const { Configuration, OpenAIApi } = require("openai");
const config = require('../config');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// Initialize OpenAI with configuration
const configuration = new Configuration({
  apiKey: config.openai.apiKey,
});

const openai = new OpenAIApi(configuration);

/**
 * Generate a cache key for the OpenAI request
 */
function generateCacheKey(prompt, options) {
  return `openai_${prompt}_${JSON.stringify(options)}`;
}

/**
 * Sends a prompt to OpenAI and returns the response
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {object} options - Additional options for the request
 * @param {boolean} useCache - Whether to use the cache (default: true)
 * @returns {Promise<object>} - The response from OpenAI
 */
async function generateResponse(prompt, options = {}, useCache = true) {
  try {
    // Generate cache key
    const cacheKey = generateCacheKey(prompt, options);
    
    // Check cache first if caching is enabled
    if (useCache) {
      const cachedResponse = cache.get(cacheKey);
      if (cachedResponse) {
        logger.info('Returning cached OpenAI response');
        return cachedResponse;
      }
    }
    
    // Prepare request options
    const defaultOptions = {
      model: config.openai.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: config.openai.temperature,
      max_tokens: config.openai.maxTokens,
    };

    const requestOptions = { ...defaultOptions, ...options };
    
    // Call OpenAI API
    logger.info(`Calling OpenAI API with model: ${requestOptions.model}`);
    const response = await openai.createChatCompletion(requestOptions);
    
    // Format the response
    const result = {
      text: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
    
    // Cache the response if caching is enabled
    if (useCache) {
      cache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    logger.error('Error calling OpenAI:', error);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

module.exports = {
  generateResponse,
}; 