const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const config = require('../config');
const logger = require('../utils/logger');

// Set up rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again after 15 minutes'
    });
  }
});

// Setup API key validation middleware (if not in Lambda)
const validateApiKey = (req, res, next) => {
  // Skip in Lambda environment as it uses AWS authentication
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn(`Invalid API key attempt from IP: ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Setup security middleware
const setupSecurity = (app) => {
  // Set security HTTP headers
  app.use(helmet());
  
  // Prevent XSS attacks
  app.use(xss());
  
  // Rate limiting
  app.use(limiter);
  
  // Log all request details in development
  if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
      logger.debug(`Request: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
      next();
    });
  }
  
  // API Key validation for direct access (when not via API Gateway)
  app.use(validateApiKey);
};

module.exports = {
  setupSecurity
}; 