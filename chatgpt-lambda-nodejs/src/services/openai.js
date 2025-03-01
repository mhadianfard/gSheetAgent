const { Configuration, OpenAIApi } = require("openai");
const config = require('../config');

// Initialize OpenAI with configuration
const configuration = new Configuration({
  apiKey: config.openai.apiKey,
});

const openai = new OpenAIApi(configuration);

/**
 * Sends a prompt to OpenAI and returns the response
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {object} options - Additional options for the request
 * @returns {Promise<object>} - The response from OpenAI
 */
async function generateResponse(prompt, options = {}) {
  try {
    const defaultOptions = {
      model: config.openai.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: config.openai.temperature,
      max_tokens: config.openai.maxTokens,
    };

    const requestOptions = { ...defaultOptions, ...options };
    
    const response = await openai.createChatCompletion(requestOptions);
    
    return {
      text: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

module.exports = {
  generateResponse,
}; 