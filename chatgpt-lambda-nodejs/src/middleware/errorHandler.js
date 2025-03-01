const { formatError } = require('../utils/helpers');

/**
 * Central error handling middleware for Express
 */
function errorHandler(err, req, res, next) {
  console.error('Error occurred:', err);
  
  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
  }
  
  res.status(statusCode).json(formatError(err));
}

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class APIError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

module.exports = {
  errorHandler,
  ValidationError,
  NotFoundError,
  APIError
}; 