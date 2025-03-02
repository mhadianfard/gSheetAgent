/**
 * upload_gas.js
 * 
 * A script to update Google Apps Script content directly from the CLI.
 * This is equivalent to the Python upload_gas.py file, providing a development
 * workflow for updating script content without going through the full application.
 */

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const express = require('express');
const opener = require('opener');
const ScriptManager = require('./src/google/script_manager');
const config = require('./src/config');

/**
 * Main function to update Google Apps Script content.
 * 
 * This function serves as a CLI entry point for easier development. It allows developers 
 * to push code directly to the specified Google Apps Script project without going through 
 * the main application flow.
 */
async function main() {
  try {
    // Paths for token and credentials
    const tokenPath = path.join(process.cwd(), config.google.tokenPath);
    const credentialsPath = path.join(process.cwd(), config.google.credentialsPath);
    
    // Obtain Google Authorization token
    let credentials;
    let token;

    try {
      credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
      console.log('Loaded credentials from file');
    } catch (error) {
      console.error(`Error loading credentials: ${error}`);
      return;
    }

    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    // Check if token already exists
    try {
      token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
      oAuth2Client.setCredentials(token);
      
      // Check if token is expired and needs refresh
      if (token.expiry_date && token.expiry_date < Date.now()) {
        console.log('Token expired, refreshing...');
        const refreshedToken = await oAuth2Client.refreshToken(token.refresh_token);
        token = refreshedToken.credentials;
        await fs.writeFile(tokenPath, JSON.stringify(token), 'utf8');
        console.log('Token refreshed and saved');
      }
    } catch (error) {
      console.log('No token found or error reading token. Getting new token...');
      token = await getNewToken(oAuth2Client);
      await fs.writeFile(tokenPath, JSON.stringify(token), 'utf8');
      console.log('New token saved');
    }

    // Get script ID from environment variables
    const scriptId = config.google.scriptId;
    
    // Ensure script ID is available
    if (!scriptId) {
      console.error('Error: No Script ID found in environment variables.');
      console.error('Please set SCRIPT_ID in your .env file.');
      return;
    }
    
    console.log(`Using script ID: ${scriptId}`);

    // Initialize the ScriptManager with the token
    console.log('Token object:', token);
    console.log('Access token:', token.access_token);
    const scriptManager = new ScriptManager(token.access_token);
    
    // Update the script content
    const response = await scriptManager.updateScriptContent(scriptId);
    
    // Check if the response indicates success
    if (response.error) {
      console.error(`Error: ${JSON.stringify(response.error)}`);
    } else {
      console.log('Upload Successful!');
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}

/**
 * Get a new OAuth2 token by launching the authorization flow and opening browser.
 * 
 * @param {OAuth2Client} oAuth2Client - The OAuth2 client to get token for
 * @returns {Promise<Object>} The token object
 */
async function getNewToken(oAuth2Client) {
  // Create a simple express server to handle the callback
  const app = express();
  let server = null;
  
  // Create a random state value to prevent CSRF attacks
  const state = Math.random().toString(36).substring(2, 15);
  
  // Set up a promise that will resolve when we get the token
  return new Promise((resolve, reject) => {
    try {
      const PORT = 3000;
      
      // Define the redirect URI (must match Google Cloud Console settings)
      const redirectUri = `http://localhost:${PORT}/`;
      
      // Configure the OAuth client to use our local redirect
      oAuth2Client.redirectUri = redirectUri;
      
      // Generate the authorization URL
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: config.google.scopes,
        state: state,
        prompt: 'consent'  // Force prompt to ensure we get a refresh token
      });
      
      console.log('Opening browser for authentication...');
      
      // Set up Express route to handle the OAuth callback
      app.get('/', async (req, res) => {
        // Close the response with a success message
        res.send('Authentication successful! You can close this window.');
        
        // Check state parameter to prevent CSRF attacks
        if (req.query.state !== state) {
          reject(new Error('State mismatch - possible CSRF attack'));
          if (server) server.close();
          return;
        }
        
        try {
          // Exchange the code for tokens
          const code = req.query.code;
          const { tokens } = await oAuth2Client.getToken(code);
          
          // Set credentials and resolve the promise
          oAuth2Client.setCredentials(tokens);
          console.log('Authentication successful');
          
          // Close the server
          if (server) {
            server.close();
            console.log('OAuth callback server closed');
          }
          
          resolve(tokens);
        } catch (error) {
          reject(new Error(`Error retrieving access token: ${error}`));
          if (server) server.close();
        }
      });
      
      // Start the server
      server = app.listen(PORT, async () => {
        console.log(`OAuth callback server listening on port ${PORT}`);
        
        // Open the browser to the authorization URL
        opener(authUrl);
        console.log('If the browser did not open automatically, please visit this URL:', authUrl);
      });
      
      // Set a timeout to close the server if no response is received
      setTimeout(() => {
        if (server) {
          server.close();
          reject(new Error('Authentication timed out after 5 minutes'));
        }
      }, 5 * 60 * 1000);
      
    } catch (error) {
      reject(error);
    }
  });
}

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
