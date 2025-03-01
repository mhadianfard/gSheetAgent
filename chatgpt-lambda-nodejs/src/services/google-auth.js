const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
// The file token.json stores the user's access and refresh tokens
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the token file.
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentials() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Initialize Google auth client
 * @return {Promise<OAuth2Client>}
 */
async function initializeGoogleAuth() {
  let client = await loadSavedCredentials();
  if (client) {
    return client;
  }
  
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  
  if (client.credentials) {
    await saveCredentials(client);
  }
  
  return client;
}

/**
 * Get the setup status for Google API
 * @return {Promise<object>}
 */
async function getSetupStatus() {
  try {
    // Check if credentials file exists
    try {
      await fs.access(CREDENTIALS_PATH);
    } catch (err) {
      return { status: 'not_configured', message: 'credentials.json not found' };
    }
    
    // Check if token exists (already authenticated)
    try {
      await fs.access(TOKEN_PATH);
      return { status: 'configured', message: 'Google API is properly configured' };
    } catch (err) {
      return { 
        status: 'needs_authentication', 
        message: 'Credentials found but needs authentication' 
      };
    }
  } catch (error) {
    console.error('Error checking setup status:', error);
    return { status: 'error', message: error.message };
  }
}

module.exports = {
  initializeGoogleAuth,
  getSetupStatus,
}; 