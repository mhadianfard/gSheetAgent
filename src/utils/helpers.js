/**
 * Safely parse JSON with error handling
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Value to return if parsing fails
 * @returns {*} Parsed object or fallback value
 */
function safeJsonParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return fallback;
  }
}

/**
 * Format error for API response
 * @param {Error} error - Error object
 * @returns {object} Formatted error object
 */
function formatError(error) {
  return {
    error: {
      message: error.message,
      type: error.name,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    }
  };
}

/**
 * Sleep function to pause execution
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  safeJsonParse,
  formatError,
  sleep
}; 