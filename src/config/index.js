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
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json',
    tokenPath: process.env.GOOGLE_TOKEN_PATH || 'token.json',
    scriptId: process.env.SCRIPT_ID,
    gasDirectory: process.env.GAS_DIRECTORY || 'gas',
  },
  
  // LLM Configuration
  llm: {
    model: process.env.LLM_MODEL || 'gpt-4o',
    instructionFile: process.env.LLM_INSTRUCTION_FILE || 'src/llm/llm-instruction.txt'
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