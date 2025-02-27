#!/bin/bash
set -e

. .env
ZIP_FILE="lambda.zip"

# # Dependency installation, adjust according to your function
# echo "Installing dependencies..."
pip install -r requirements.txt -t .

echo "Building zip file..."
zip -r $ZIP_FILE . -x@lambda_exclude.txt
echo "Uploading lambda function..."
aws lambda update-function-code \
    --function-name $AWS_FUNCTION_NAME \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$AWS_REGION"
rm $ZIP_FILE
echo "Deployed to $AWS_LAMBDA_URL"

