const serverless = require('serverless-http');
const app = require('./src/app');
const config = require('./src/config');

// Log configuration on cold start (excluding sensitive information)
console.log('Starting Lambda with configuration:');
console.log('AWS Region:', config.aws.region);
console.log('OpenAI Model:', config.openai.defaultModel);

// Create a serverless handler from the Express app
const handler = serverless(app);

// Lambda handler function
exports.handler = async (event, context) => {
  // Process the Lambda event with our Express app
  return await handler(event, context);
};
