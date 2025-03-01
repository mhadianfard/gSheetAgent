# ChatGPT Lambda Node.js

A serverless implementation of a ChatGPT-like service using AWS Lambda and Node.js.

## Project Overview

This project implements a serverless API for interacting with OpenAI's GPT models. The application is designed for high scalability, security, and ease of deployment using AWS services.

## Features

- OpenAI GPT integration for AI-powered responses
- API key authentication for security
- Caching layer for performance optimization
- Google OAuth integration for authentication (optional)
- Comprehensive error handling
- Logging system
- Serverless deployment for reliability

## Prerequisites

- Node.js 16.x or higher
- AWS account with access to Lambda, API Gateway, CloudFormation, S3, and IAM
- AWS CLI installed and configured
- Serverless Framework
- OpenAI API Key

## Setup Instructions

### 1. Install Dependencies

#### Clone the repository (if you haven’t already)
```sh
git clone <repository-url>
cd chatgpt-lambda-nodejs
```

#### Install dependencies
```sh
npm install
```

#### Install Serverless Framework globally
```sh
npm install -g serverless
```

### 2. AWS Configuration

#### Option A: Using AWS SSO
If you're using AWS SSO, make sure you're logged in:
```sh
aws sso login --profile your-profile-name
```

#### Option B: Using a Dedicated IAM User (Recommended for Deployment)
Create a dedicated IAM user with the following permissions:
- `AmazonAPIGatewayAdministrator`
- `AWSLambda_FullAccess`
- `CloudFormationFullAccess`
- `AmazonS3FullAccess`
- `AmazonDynamoDBFullAccess`
- `IAMFullAccess` (or a more restricted policy with necessary role creation permissions)

Configure this user in your AWS CLI:
```sh
aws configure --profile serverless-deploy
```

#### Enter Access Key ID and Secret Access Key when prompted
- Set the default region to `ca-central-1` (or your preferred region)
- Set the output format to `json`

### 3. Environment Configuration

Create a `.env` file with your OpenAI API key and API key for authenticating requests:
```sh
touch .env
```

#### Add the following to your `.env` file:
```ini
OPENAI_API_KEY=your_openai_api_key_here
API_KEY=your_preferred_api_key_for_authentication
NODE_ENV=development
```

### 4. Serverless Configuration

The `serverless.yml` file is already configured, but you may want to modify it based on your needs:
- Change the service name
- Modify memory size and timeout
- Add custom domain (optional)

## Deployment

Deployment is handled by the `deploy.sh` script, which:
- Checks for required environment variables
- Generates an API key if one doesn’t exist
- Uses your AWS credentials to deploy the application
- Outputs deployment information

#### Make the deployment script executable
```sh
chmod +x deploy.sh
```

#### Deploy to the default (dev) stage
```sh
./deploy.sh
```

#### Or deploy to a specific stage (e.g., prod)
```sh
./deploy.sh prod
```

The script will output your API endpoint and API key after successful deployment.

### Testing the Deployed API

After deployment, you can test your API with `curl`:

#### Test the health endpoint
```sh
curl -X GET "https://your-api-id.execute-api.ca-central-1.amazonaws.com/dev/health" \
  -H "x-api-key: your_api_key"
```

#### Test the prompt endpoint
```sh
curl -X POST "https://your-api-id.execute-api.ca-central-1.amazonaws.com/dev/prompt" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{"prompt":"What is AWS Lambda?"}'
```

## Local Development

You can run the application locally for development:
```sh
npm run dev
```

Or use Serverless offline:
```sh
npm run offline
```

## Troubleshooting

### Common Deployment Issues

#### AWS Credential Issues
Make sure your AWS credentials are properly configured:
```sh
aws sts get-caller-identity --profile serverless-deploy
```

#### IAM Permission Errors
Ensure your IAM user or role has all required permissions.

#### Lambda Deployment Package Issues
If your package size exceeds limits, use the patterns in `serverless.yml`.

#### Environment Variables
Verify that `OPENAI_API_KEY` and `API_KEY` are properly set in your `.env` file.

### Runtime Issues

#### Timeout Errors
If you experience timeout errors, consider increasing the Lambda timeout in `serverless.yml`.

#### Memory Issues
If you experience out-of-memory errors, increase the memorySize in `serverless.yml`.

#### CORS Issues
If frontend applications can’t connect, verify the CORS configuration in `serverless.yml`.

## Architecture

- **API Gateway**: Routes HTTP requests to your Lambda function
- **Lambda Functions**: Processes requests and returns responses
- **DynamoDB**: Handles routing within the Lambda function
- **OpenAI API**: Provides AI capabilities

## Security Considerations

- **All API endpoints are protected with API key authentication**
- **CORS is enabled for cross-origin requests**
- **Environment variables are used for storing sensitive information**
- **Rate limiting protects against abuse**

## Additional Resources

- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [DynamoDB Documentation](https://aws.amazon.com/dynamodb/)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)

