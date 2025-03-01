const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ChatGPT Lambda API',
      version: '1.0.0',
      description: 'API for OpenAI integration with AWS Lambda',
      contact: {
        name: 'API Support',
        email: 'mohsen@moseytech.ca',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
    ],
  },
  // Path to the API docs
  apis: ['./src/app.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocs),
}; 