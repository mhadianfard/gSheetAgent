const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const LLMClient = require('../llm/llm-client');
const ScriptManager = require('../google/script-manager');
const config = require('../config');
const { corsMiddleware, getCorsHeaders } = require('./middleware/cors-middleware');

/**
 * Extracts the token from the Authorization header.
 * @param {Object} req - Express request object
 * @returns {string|null} The token or null if not found
 */
const getAuthorizationToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
};

/**
 * Health check endpoint - Returns build info and status
 * This endpoint is exempt from CORS restrictions
 */
router.get('/health', async (req, res) => {
  // Get the build number from environment variable
  const buildNumber = process.env.LATEST_BUILD || null;
  return res.status(200).json({
    success: true,
    latest_build: buildNumber
  });
});

// Apply CORS middleware to all other routes
router.use(corsMiddleware);

/**
 * Handle prompt requests - Receives an instruction and returns AI-generated code
 */
router.post('/prompt', async (req, res) => {
  const data = req.body;
  
  if (!data.instruction || !data.scriptId || !data.timezone) {
    return res.status(400).json({ error: 'Instruction, Script ID or Timezone not provided' });
  }

  const token = getAuthorizationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const instruction = data.instruction;
  const scriptId = data.scriptId;
  const timezone = data.timezone;

  // Initialize ScriptManager
  const uploader = new ScriptManager(token);

  // Generate a response from the LLM client using the instruction
  const llmClient = new LLMClient();
  const response = await llmClient.getAppsScriptCode(instruction);
  
  if (response === null) {
    return res.status(500).json({ error: 'Failed to generate response from LLM' });
  }
  
  console.log("Response content:", response);  // Debug line
  
  try {
    const responseJson = JSON.parse(response);
    const receivedInstruction = responseJson.explanation || 'No explanation provided';
    const receivedCode = responseJson.code || '';

    try {
      // Pass the script_id to the update_script_content method
      const uploadResponse = await uploader.updateScriptContent(scriptId, receivedCode, timezone);
      if (uploadResponse.error) {
        throw new Error(uploadResponse.error);
      }
    } catch (e) {
      const errorMessage = e.message;
      let userMessage = errorMessage;
      
      // Check if the error message contains the specific error
      if (errorMessage.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        userMessage = "This document hasn't been properly authorized to do an end-to-end automation. Please reinstall the add-on.";
      }

      console.error(`An error occurred: ${errorMessage}`);
      return res.status(500).json({ error: userMessage });
    }
    
    console.log("Upload Successful!");  // Success message
    return res.status(200).json({ received_instruction: receivedInstruction });
    
  } catch (e) {
    console.error("Failed to decode JSON:", e);
    return res.status(500).json({ error: 'Failed to decode response from LLM' });
  }
});

/**
 * Handle setup requests - Configures the script for the user
 */
router.get('/setup', async (req, res) => {
  // Read the contents of setup.js from the filesystem
  const jsFilePath = path.join(process.cwd(), config.templates.setupJsPath);
  
  try {
    let jsContent = await fs.readFile(jsFilePath, 'utf8');
    
    try {
      const data = req.query;
      if (!data.authToken || !data.scriptId) {
        throw new Error('authToken and scriptId must be provided');
      }
      
      const authToken = data.authToken;
      const scriptId = data.scriptId;

      const manager = new ScriptManager(authToken);
      const response = await manager.updateScriptContent(scriptId);
      
      if (response.error) {
        throw new Error(response.error);
      }
    } catch (e) {
      console.error(`An error occurred: ${e}`);
      
      if (e.message.includes('SERVICE_DISABLED')) {
        // Provide better instructions
        const userMessage = "The Apps Script API has not been enabled for this project. Please enable it by visiting the Google Developers Console.";
        jsContent = jsContent.replace("failureMessage = ''", `failureMessage = '${userMessage}'`);
      } else {
        jsContent = jsContent.replace("failureMessage = ''", `failureMessage = '${e}'`);
      }
    }
    
    res.set('Content-Type', 'application/javascript');
    Object.entries(getCorsHeaders()).forEach(([key, value]) => {
      res.set(key, value);
    });
    return res.send(jsContent);
    
  } catch (e) {
    console.error(`Error reading setup.js: ${e}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 