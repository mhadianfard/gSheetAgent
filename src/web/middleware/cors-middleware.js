const cors = require('cors');
const config = require('../../config');

/**
 * Get CORS origin checker function based on config
 * @returns {Function} Origin checker function for CORS
 */
const getOriginFunction = () => {
  return function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    const configOrigin = config.cors.origin;
    
    // Handle wildcard domains (like *.googleusercontent.com)
    if (configOrigin.includes('*')) {
      const pattern = configOrigin.replace('*.', '.*\\.');
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(origin)) {
        return callback(null, true);
      }
    }
    
    // For other origins, check against configured origin
    if (configOrigin === '*' || origin === configOrigin) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  };
};

// Create a single CORS configuration object
const corsOptions = {
  origin: getOriginFunction(),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

/**
 * Generate CORS headers based on corsOptions
 * @returns {Object} CORS headers object
 */
const getCorsHeaders = () => {
  const origin = typeof corsOptions.origin === 'function' 
    ? '*' // When using a function, we can't predict the allowed origin in advance
    : corsOptions.origin;
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': corsOptions.methods.join(', '),
    'Access-Control-Allow-Headers': corsOptions.allowedHeaders.join(', ')
  };
};

// Export middleware and utilities
module.exports = {
  corsMiddleware: cors(corsOptions),
  getCorsHeaders
}; 