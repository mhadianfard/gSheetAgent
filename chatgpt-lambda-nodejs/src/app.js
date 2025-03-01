const express = require('express');
const cors = require('cors');
const { generateResponse } = require('./services/openai');
const { getSetupStatus } = require('./services/google-auth');
const { errorHandler, ValidationError } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const config = require('./config');

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.url}`);
  next();
});

// Middleware for parsing JSON and handling CORS
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CORS headers function
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Routes
app.post('/prompt', async (req, res, next) => {
  try {
    const { prompt, options } = req.body;
    
    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }
    
    logger.info(`Processing prompt: ${prompt.substring(0, 30)}...`);
    const response = await generateResponse(prompt, options);
    logger.info('Successfully generated response');
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/setup', async (req, res, next) => {
  try {
    logger.info('Fetching setup status');
    const setupInfo = await getSetupStatus();
    res.json(setupInfo);
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware
app.use(errorHandler);

// For local development
if (require.main === module) {
  const PORT = config.server.port;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Lambda integration
module.exports = app;
