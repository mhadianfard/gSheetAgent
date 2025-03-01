#!/bin/bash
set -e

# Load variables from .env file if it exists
if [ -f .env ]; then
  echo "Loading environment variables from .env file"
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OPENAI_API_KEY environment variable is not set"
  exit 1
fi

# Check if API_KEY is set
if [ -z "$API_KEY" ]; then
  echo "Generating a random API_KEY"
  export API_KEY=$(openssl rand -hex 16)
  echo "API_KEY=$API_KEY" >> .env
  echo "Generated API_KEY: $API_KEY"
fi

# Determine stage from command line or default to dev
STAGE=${1:-dev}
echo "Deploying to $STAGE environment"

# Run the deployment using the serverless-deploy profile
echo "Deploying with Serverless Framework to ca-central-1..."
AWS_PROFILE=serverless-deploy npx serverless deploy --stage $STAGE --region ca-central-1

echo "===================================================="
echo "Deployment Completed Successfully!"
echo "API Key: $API_KEY"
echo "====================================================" 