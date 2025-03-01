const express = require('express');
const cors = require('cors');
const { generateResponse } = require('./services/openai');
const { getSetupStatus } = require('./services/google-auth');
const { errorHandler, ValidationError } = require('./middleware/errorHandler');
const { setupSecurity } = require('./middleware/security');
const swagger = require('./swagger');
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Apply security middleware
setupSecurity(app);

// Swagger documentation
app.use('/api-docs', swagger.serve, swagger.setup);

// CORS headers function
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

/**
 * @swagger
 * /prompt:
 *   post:
 *     summary: Generate a response from OpenAI
 *     tags: [OpenAI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The prompt to send to OpenAI
 *               options:
 *                 type: object
 *                 description: Additional options for the OpenAI request
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 text:
 *                   type: string
 *                 usage:
 *                   type: object
 */
app.post('/prompt', async (req, res, next) => {
  try {
    const { prompt, options, cache = true } = req.body;
    
    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }
    
    logger.info(`Processing prompt: ${prompt.substring(0, 30)}...`);
    const response = await generateResponse(prompt, options, cache);
    logger.info('Successfully generated response');
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /setup:
 *   get:
 *     summary: Get the setup status for Google API
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Setup status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 */
app.get('/setup', async (req, res, next) => {
  try {
    logger.info('Fetching setup status');
    const setupInfo = await getSetupStatus();
    res.json(setupInfo);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
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
    logger.info(`API Documentation available at: http://localhost:${PORT}/api-docs`);
  });
}

// Export the Express app for Lambda integration
module.exports = app;
