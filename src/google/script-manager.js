const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');

class ScriptManager {
  
  /**
   * Generates the JavaScript code for the performAction function with the current timestamp.
   *
   * @returns {string} The JavaScript code to upload.
   */
  static getDefaultGeneratedCode() {
      const currentTime = new Date().toLocaleString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      }).replace(',', ' at').toLowerCase();
      
      return `
        function performAction() {
            const ui = SpreadsheetApp.getUi();
            ui.alert('This script was last generated at ${currentTime}');
        }
      `;
  }

  /**
   * Reads the Google Apps Script manifest file (appsscript.json) from the specified GAS directory.
   *
   * @param {string} gasDirectory - The directory to read the manifest file from.
   * @returns {Promise<Object>} The parsed JSON object from the manifest file.
   * @throws {Error} Throws an error if the manifest file cannot be read or parsed.
   * 
   * @static
   */
  static async readGasManifest(gasDirectory) {
    const manifestPath = path.join(gasDirectory, 'appsscript.json');
    try {
        const data = await fs.readFile(manifestPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading GAS manifest file:", error);
        throw new Error("Failed to read GAS manifest file.");
    }
  }

  /**
   * A class to handle uploading and updating Google Apps Script projects.
   * 
   * @param {string} token - The OAuth token to authenticate the user.
   */
  constructor(token = null) {   
    this.gasDirectory = path.join(process.cwd(), config.google.gasDirectory);
    this.creds = this._authenticate(token);
    this.service = google.script({ version: 'v1', auth: this.creds });
  }

  /**
   * Authenticates the user using the provided token.
   *
   * @param {string} token - The OAuth token to authenticate the user.
   * @returns {OAuth2Client} The authenticated Google API credentials.
   * @private
   */
  _authenticate(token) {
    if (!token) throw new Error("No token provided for authentication.");
        
    const oAuth2Client = new OAuth2Client();
    oAuth2Client.setCredentials({ access_token: token });
    if (!oAuth2Client.credentials.access_token) {
      throw new Error("Invalid credentials provided.");
    }
    
    return oAuth2Client;
  }

  /**
   * Updates the script content with the provided code and all files in the 'gas' directory.
   *
   * @param {string} scriptId - The ID of the Google Apps Script project.
   * @param {string} generatedCode - The JavaScript code to update the script with.
   * @param {string} timezone - The timezone for the script. Defaults to "America/New_York".
   * @returns {Promise<object>} The response from the Google Apps Script API.
   */
  async updateScriptContent(scriptId, generatedCode = null, timezone = "America/New_York") {
    // Use default code if generatedCode is not provided
    if (!generatedCode) {
      generatedCode = ScriptManager.getDefaultGeneratedCode();
    }
    
    const manifest = await ScriptManager.readGasManifest(this.gasDirectory);
    manifest.timeZone = timezone;

    // Start with the provided code
    const files = [
      {
        name: 'generated',
        type: 'SERVER_JS',
        source: generatedCode
      },
      {
        name: 'appsscript',
        type: 'JSON',
        source: JSON.stringify(manifest)
      }
    ];

    try {
      // Add all files from the 'gas' directory and its subfolders
      await this.addFilesFromDirectory(this.gasDirectory, files);
      
      // Create the request body
      const request = { files };

      // Execute the update request
      const response = await this.service.projects.updateContent({
        scriptId,
        requestBody: request
      });
      
      return response.data;
    } catch (error) {
      console.error("Error updating script content:", error);
      return { error: error.message };
    }
  }

  /**
   * Recursively adds files from a directory to the files array.
   *
   * @param {string} directory - The directory to read files from.
   * @param {Array} files - The array to add files to.
   * @returns {Promise<void>}
   * @private
   */
  async addFilesFromDirectory(directory, files) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          await this.addFilesFromDirectory(fullPath, files);
        } else {
          // Process files
          const fileContent = await fs.readFile(fullPath, 'utf8');
          let fileType;
          
          if (entry.name.endsWith('.html')) {
            fileType = 'HTML';
          } else if (entry.name.endsWith('.js')) {
            fileType = 'SERVER_JS';
          } else {
            continue;
          }
          
          // Use relative path for the name to maintain folder structure
          const relativePath = path.relative(this.gasDirectory, fullPath);
          const nameWithoutExt = path.join(
            path.dirname(relativePath),
            path.basename(relativePath, path.extname(relativePath))
          ).replace(/\\/g, '/');
          
          files.push({
            name: nameWithoutExt,
            type: fileType,
            source: fileContent
          });
        }
      }
    } catch (error) {
      console.error("Error reading directory:", error);
      throw error;
    }
  }
}

module.exports = ScriptManager;
