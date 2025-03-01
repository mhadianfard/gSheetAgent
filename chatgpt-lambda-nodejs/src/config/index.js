require('dotenv').config();

const config = {
  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens: parseInt(process.env.MAX_TOKENS || '150', 10),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
  },
  
  // AWS Configuration
  aws: {
    region: process.env.AWS_REGION,
    functionName: process.env.AWS_FUNCTION_NAME,
    lambdaUrl: process.env.AWS_LAMBDA_URL,
  },
  
  // Server Configuration
  server: {
    port: process.env.PORT || 5000,
  },
  
  // Google Configuration
  google: {
    scopes: [
      'https://www.googleapis.com/auth/script.container.ui',
      'https://www.googleapis.com/auth/script.projects',
      'https://www.googleapis.com/auth/spreadsheets.currentonly',
    ],
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json',
    tokenPath: process.env.GOOGLE_TOKEN_PATH || 'token.json',
    gasDynamicDirectory: process.env.GAS_DYNAMIC_DIRECTORY || 'gas/dynamic',
    
    /**
     * Generates the JavaScript code for the performAction function with the current timestamp.
     *
     * @returns {string} The JavaScript code to upload.
     */
    getDefaultDynamicScript: function() {
      const currentTime = new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }).toLowerCase();
      
      return `
      function performAction() {
          const ui = SpreadsheetApp.getUi();
          ui.alert('This script was last generated at ${currentTime}');
      }
      `;
    }
  },
  
  // LLM Configuration
  llm: {
    model: process.env.LLM_MODEL || 'gpt-4o',
    instructionFile: process.env.LLM_INSTRUCTION_FILE || 'src/llm/llm_instruction.txt'
  },
  
  // CORS Settings
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://*.googleusercontent.com'
  },
  
  // Templates paths
  templates: {
    setupJsPath: process.env.SETUP_JS_PATH || 'src/web/templates/setup.js'
  }
};

module.exports = config; 