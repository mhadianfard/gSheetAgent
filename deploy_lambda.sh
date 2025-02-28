#!/bin/bash
set -e

# Load variables from .env file
. .env

# Echo loaded environment variables
echo "Loaded environment variables:"
echo "AWS_FUNCTION_NAME: $AWS_FUNCTION_NAME"
echo "AWS_REGION: $AWS_REGION"
echo "AWS_LAMBDA_URL: $AWS_LAMBDA_URL"

# Define a common name for the zip file and directory
TEMP_DIR_NAME="lambda_function"
ZIP_FILE="${TEMP_DIR_NAME}.zip"

# Delete the zip file if it already exists
if [ -f "$ZIP_FILE" ]; then
    echo "Cleaning up existing zip file: $ZIP_FILE"
    rm -f "$ZIP_FILE"
fi

# Delete the directory and its contents if it already exists
if [ -d "$TEMP_DIR_NAME" ]; then
    echo "Cleaning up existing directory: $TEMP_DIR_NAME"
    rm -rf "$TEMP_DIR_NAME"
fi

# Create the lambda_function directory
mkdir -p "$TEMP_DIR_NAME"

# Copy only the files and folders explicitly mentioned in lambda_include.txt to the lambda_function directory
while IFS= read -r file; do
    cp -r "$file" "$TEMP_DIR_NAME/"
done < lambda_include.txt

# Install Python dependencies into the lambda_function directory
pip install -r requirements.txt -t "$TEMP_DIR_NAME/"

# Create a zip file with the contents of lambda_function in the zip root
cd "$TEMP_DIR_NAME"
zip -r "../$ZIP_FILE" .  # Zip the contents of the lambda_function directory
cd ..

# Upload the zip file to AWS Lambda
echo "Uploading lambda function..."
if ! aws lambda update-function-code \
    --function-name $AWS_FUNCTION_NAME \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$AWS_REGION"; then
    echo "Error: Failed to upload the lambda function. Please check your AWS credentials and permissions."
    exit 1
fi

# Clean up: delete the zip file and the lambda_function directory
rm -f "$ZIP_FILE"
rm -rf "$TEMP_DIR_NAME"

echo "Deployed to $AWS_LAMBDA_URL"

