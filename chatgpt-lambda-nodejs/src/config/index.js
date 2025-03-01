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
  }
};

module.exports = config; 