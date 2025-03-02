#!/bin/bash
set -e

# Configuration
SERVICE_NAME="gsheetagent"
REGION="ca-central-1"
ENVIRONMENT="Production"
STACK_NAME="${SERVICE_NAME}-${ENVIRONMENT}"
CODE_DIR="."  # Directory containing your Lambda code
TEMPLATE_FILE="template.yaml"
DEPLOYMENT_BUCKET="${SERVICE_NAME}-deployments-${REGION}"
INCLUDE_FILE="lambda_include.txt"  # File containing list of files/dirs to include
VERBOSE=false  # Set to true for detailed output

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status with timestamp
status() {
  echo -e "${BLUE}[$(date +"%H:%M:%S")]${NC} ${YELLOW}$1${NC}"
}

# Function to handle verbose output
run_cmd() {
  if [ "$VERBOSE" = true ]; then
    eval "$@"
  else
    eval "$@ > /dev/null 2>&1" || { echo -e "${RED}Command failed: $@${NC}"; return 1; }
  fi
}

# Process command line arguments
FORCE_FULL_DEPLOY=false
for arg in "$@"; do
  case $arg in
    --full-deploy)
      FORCE_FULL_DEPLOY=true
      shift
      ;;
  esac
done

# Print header
echo -e "\n${GREEN}========== Deploying ${SERVICE_NAME} to ${ENVIRONMENT} ==========${NC}\n"

# Create S3 bucket for deployments if it doesn't exist
status "Checking deployment bucket..."
if ! aws s3 ls "s3://${DEPLOYMENT_BUCKET}" 2>&1 > /dev/null; then
  status "Creating deployment bucket: ${DEPLOYMENT_BUCKET}"
  run_cmd "aws s3 mb \"s3://${DEPLOYMENT_BUCKET}\" --region ${REGION}"
fi

# Package the Lambda code
status "Packaging Lambda code..."
PACKAGE_DIR=$(mktemp -d)
PACKAGE_PATH="${PACKAGE_DIR}/lambda-package.zip"

# Check if include file exists
if [ ! -f "${INCLUDE_FILE}" ]; then
  echo -e "${RED}Error: Include file ${INCLUDE_FILE} not found!${NC}"
  exit 1
fi

# Create a temporary directory for the Lambda package
LAMBDA_BUILD_DIR="${PACKAGE_DIR}/build"
mkdir -p "${LAMBDA_BUILD_DIR}"

# Copy package.json and package-lock.json to build directory
status "Copying package files..."
cp package.json "${LAMBDA_BUILD_DIR}/"
if [ -f "package-lock.json" ]; then
  cp package-lock.json "${LAMBDA_BUILD_DIR}/"
fi

# Install production dependencies in the build directory
status "Installing production dependencies..."
(cd "${LAMBDA_BUILD_DIR}" && npm install --production --no-optional)

# Copy application files
status "Copying application files..."
cd ${CODE_DIR}

# Create a copy of each file/directory from include file to build dir
while IFS= read -r item || [[ -n "$item" ]]; do
  # Skip empty lines
  if [[ -z "$item" ]]; then
    continue
  fi

  # Trim whitespace
  item=$(echo "$item" | xargs)

  # Check if file/directory exists
  if [ ! -e "$item" ]; then
    echo -e "${YELLOW}Warning: Item '$item' does not exist, skipping${NC}"
    continue
  fi

  # Special handling for directories to avoid copying node_modules
  if [ -d "$item" ]; then
    status "Copying directory: $item"
    mkdir -p "${LAMBDA_BUILD_DIR}/$item"
    cp -r "$item"/* "${LAMBDA_BUILD_DIR}/$item/" 2>/dev/null || true
  else
    status "Copying file: $item"
    cp "$item" "${LAMBDA_BUILD_DIR}/$item"
  fi
done < "${INCLUDE_FILE}"

# Create the final zip package
status "Creating final deployment package..."
cd "${LAMBDA_BUILD_DIR}"
zip -q -r "$PACKAGE_PATH" .
cd - > /dev/null

# Upload the code to S3 before stack deployment
status "Uploading code to S3..."
run_cmd "aws s3 cp ${PACKAGE_PATH} \"s3://${DEPLOYMENT_BUCKET}/lambda-package.zip\""

# Check if CloudFormation stack exists and its status
STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} 2>&1 || echo "STACK_NOT_EXIST")

if [[ ${STACK_EXISTS} == *"STACK_NOT_EXIST"* ]]; then
  STACK_STATUS="DOES_NOT_EXIST"
else
  STACK_STATUS=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query "Stacks[0].StackStatus" --output text)
fi

status "Stack status: ${STACK_STATUS}"

# If stack is in a failed state that can't be updated, try to clean up resources
if [[ "${STACK_STATUS}" == *"FAILED"* || "${STACK_STATUS}" == *"ROLLBACK_"* || "${STACK_STATUS}" == *"_FAILED"* ]]; then
  status "Cleaning up failed stack..."
  
  # First try to get any IAM role that might be causing issues
  ROLE_NAME="${SERVICE_NAME}-lambda-role-${ENVIRONMENT}"
  
  if aws iam get-role --role-name ${ROLE_NAME} 2>&1 | grep -q "NoSuchEntity"; then
    status "Role does not exist yet - this is normal for first deployment"
  elif aws iam get-role --role-name ${ROLE_NAME} 2>&1 > /dev/null; then
    status "Cleaning up IAM role policies..."
    
    # List and detach managed policies (silently)
    POLICIES=$(aws iam list-attached-role-policies --role-name ${ROLE_NAME} --query "AttachedPolicies[*].PolicyArn" --output text)
    for POLICY in $POLICIES; do
      run_cmd "aws iam detach-role-policy --role-name ${ROLE_NAME} --policy-arn ${POLICY}"
    done
    
    # List and delete inline policies (silently)
    INLINE_POLICIES=$(aws iam list-role-policies --role-name ${ROLE_NAME} --query "PolicyNames" --output text)
    for POLICY in $INLINE_POLICIES; do
      run_cmd "aws iam delete-role-policy --role-name ${ROLE_NAME} --policy-name ${POLICY}"
    done
    
    # Brief pause for AWS to process changes
    sleep 5
  fi
  
  # Try to delete the stack
  status "Deleting failed stack..."
  run_cmd "aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}"
  
  status "Waiting for stack deletion to complete (this may take a few minutes)..."
  
  # Wait with timeout and check status periodically
  DELETE_TIMEOUT=300  # 5 minutes timeout
  DELETE_START_TIME=$(date +%s)
  
  while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED_TIME=$((CURRENT_TIME - DELETE_START_TIME))
    
    if [ $ELAPSED_TIME -gt $DELETE_TIMEOUT ]; then
      echo -e "${RED}Stack deletion timed out. Continuing with new stack creation...${NC}"
      break
    fi
    
    # Check stack status
    CURRENT_STATUS=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} 2>&1 || echo "STACK_NOT_EXIST")
    
    if [[ $CURRENT_STATUS == *"STACK_NOT_EXIST"* ]]; then
      status "Stack deleted successfully"
      STACK_STATUS="DOES_NOT_EXIST"
      break
    elif [[ $CURRENT_STATUS == *"DELETE_FAILED"* ]]; then
      echo -e "${RED}Stack deletion failed. Creating new stack with different name...${NC}"
      # Append timestamp to create a unique stack name
      TIMESTAMP=$(date +%s)
      STACK_NAME="${SERVICE_NAME}-${ENVIRONMENT}-${TIMESTAMP}"
      status "New stack name: ${STACK_NAME}"
      STACK_STATUS="DOES_NOT_EXIST"
      break
    fi
    
    echo -n "."
    sleep 10
  done
  echo "" # New line after progress dots
fi

# Deploy the CloudFormation stack
if [[ "${STACK_STATUS}" == "DOES_NOT_EXIST" ]]; then
  # First-time deployment or after deletion - create the CloudFormation stack
  status "Creating new CloudFormation stack: ${STACK_NAME}"
  
  echo -e "${YELLOW}Deploying stack (this may take several minutes)...${NC}"
  aws cloudformation deploy \
    --template-file ${TEMPLATE_FILE} \
    --stack-name ${STACK_NAME} \
    --parameter-overrides \
      ServiceName=${SERVICE_NAME} \
      EnvironmentType=${ENVIRONMENT} \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --region ${REGION} > /dev/null
  
  status "Stack creation completed successfully"
  
  # Display the created Lambda function's details
  FUNCTION_NAME=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue" --output text)
  
  echo -e "\n${GREEN}Lambda Function Details:${NC}"
  echo -e "  ${YELLOW}Name:${NC} ${FUNCTION_NAME}"
  echo -e "  ${YELLOW}Region:${NC} ${REGION}"
  FUNCTION_ARN=$(aws lambda get-function --function-name ${FUNCTION_NAME} --region ${REGION} --query "Configuration.FunctionArn" --output text)
  echo -e "  ${YELLOW}ARN:${NC} ${FUNCTION_ARN}"
else
  # Stack exists in an updateable state
  if [ "$FORCE_FULL_DEPLOY" = true ]; then
    status "Forcing full stack redeployment..."
    aws cloudformation deploy \
      --template-file ${TEMPLATE_FILE} \
      --stack-name ${STACK_NAME} \
      --parameter-overrides \
        ServiceName=${SERVICE_NAME} \
        EnvironmentType=${ENVIRONMENT} \
      --capabilities CAPABILITY_NAMED_IAM \
      --no-fail-on-empty-changeset \
      --region ${REGION} > /dev/null
  else
    # Regular code update path...
    FUNCTION_NAME=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue" --output text)
    
    if [[ -z "$FUNCTION_NAME" || "$FUNCTION_NAME" == "None" ]]; then
      status "Function name not found in outputs. Updating whole stack..."
      
      # If we can't get the function name, update the whole stack
      aws cloudformation deploy \
        --template-file ${TEMPLATE_FILE} \
        --stack-name ${STACK_NAME} \
        --parameter-overrides \
          ServiceName=${SERVICE_NAME} \
          EnvironmentType=${ENVIRONMENT} \
        --capabilities CAPABILITY_NAMED_IAM \
        --no-fail-on-empty-changeset \
        --region ${REGION} > /dev/null
    else
      # Update the Lambda function directly
      status "Updating Lambda function: ${FUNCTION_NAME}"
      aws lambda update-function-code \
        --function-name ${FUNCTION_NAME} \
        --s3-bucket ${DEPLOYMENT_BUCKET} \
        --s3-key lambda-package.zip \
        --region ${REGION} \
        --publish > /dev/null
    fi
    
    status "Lambda function updated successfully"
    
    # Create or get Lambda function URL
    status "Setting up public URL for Lambda function..."
    FUNCTION_URL=""

    # Check if function URL already exists
    URL_CONFIG=$(aws lambda get-function-url-config --function-name ${FUNCTION_NAME} --region ${REGION} 2>&1 || echo "URL_NOT_EXIST")

    if [[ ${URL_CONFIG} == *"URL_NOT_EXIST"* ]]; then
      # Function URL doesn't exist yet, create it
      status "Creating new function URL..."
      URL_RESPONSE=$(aws lambda create-function-url-config \
        --function-name ${FUNCTION_NAME} \
        --auth-type NONE \
        --region ${REGION})
      
      # Add resource-based policy to allow public access
      aws lambda add-permission \
        --function-name ${FUNCTION_NAME} \
        --statement-id FunctionURLAllowPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal '*' \
        --function-url-auth-type NONE \
        --region ${REGION} > /dev/null
      
      FUNCTION_URL=$(echo $URL_RESPONSE | grep -o 'https://[^"]*')
    else
      # Function URL exists, extract it
      FUNCTION_URL=$(echo $URL_CONFIG | grep -o 'https://[^"]*')
    fi

    # Display the updated Lambda function's details
    echo -e "\n${GREEN}Lambda Function Details:${NC}"
    echo -e "  ${YELLOW}Name:${NC} ${FUNCTION_NAME}"
    echo -e "  ${YELLOW}Region:${NC} ${REGION}"
    FUNCTION_ARN=$(aws lambda get-function --function-name ${FUNCTION_NAME} --region ${REGION} --query "Configuration.FunctionArn" --output text)
    echo -e "  ${YELLOW}ARN:${NC} ${FUNCTION_ARN}"
    echo -e "  ${YELLOW}Public URL:${NC} ${FUNCTION_URL}"
  fi
fi

# Clean up
rm -rf ${PACKAGE_DIR}

echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}\n"