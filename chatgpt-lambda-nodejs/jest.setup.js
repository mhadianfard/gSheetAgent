// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_FUNCTION_NAME = 'test-function';
process.env.NODE_ENV = 'test';

// Mock the logger to avoid console output during tests
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  http: jest.fn(),
  debug: jest.fn()
}));

// Create logs directory for tests
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
} 