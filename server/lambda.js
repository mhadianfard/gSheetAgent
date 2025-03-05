'use strict';

// Import dependencies
const serverless = require('serverless-http');
const app = require('../src/web/app');
const config = require('../src/config');

// Configure serverless handler
const handler = serverless(app);

// Export the handler function
module.exports.handler = async (event, context) => {
  console.log('AWS Region:', config.aws.region);
  
  // Handle API Gateway events
  const result = await handler(event, context);
  return result;
};
