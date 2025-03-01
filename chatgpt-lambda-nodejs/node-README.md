# ChatGPT Lambda NodeJS

A Node.js implementation of an OpenAI API integration deployed to AWS Lambda.

## Features

- Express API with OpenAI integration
- Google API authentication
- AWS Lambda deployment
- Comprehensive error handling
- Logging system
- Testing infrastructure

## Installation

1. Clone this repository:
   ```sh
   git clone <repository-url>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```ini
   OPENAI_API_KEY=your_openai_api_key
   AWS_FUNCTION_NAME=your_lambda_function_name
   AWS_REGION=your_aws_region
   AWS_LAMBDA_URL=your_lambda_url
   ```

## Local Development

Run the local development server:
```sh
npm start
```

Or with automatic reloading:
```sh
npm run dev
```

## API Endpoints

### POST `/prompt`
Send a prompt to OpenAI and get a response.

**Request:**
```json
{
  "prompt": "Tell me a joke about programming",
  "options": {
    "model": "gpt-4",
    "temperature": 0.7
  }
}
```

**Response:**
```json
{
  "text": "Why do programmers prefer dark mode? Because light attracts bugs!",
  "usage": {
    "prompt_tokens": 6,
    "completion_tokens": 12,
    "total_tokens": 18
  }
}
```

### GET `/setup`
Check the configuration status of Google API integration.

**Response:**
```json
{
  "status": "configured",
  "message": "Google API is properly configured"
}
```

## Testing

Run tests with Jest:
```sh
npm test
```

## Deployment

Deploy to AWS Lambda:
```sh
npm run deploy
```

Make sure your AWS credentials are configured properly.

## License

MIT

