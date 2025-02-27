/**
 * Default server URL
 */
const DEFAULT_SERVER_URL = "https://bhnjkmdbgzzn4ftgee4cvnvzbe0tsloa.lambda-url.ca-central-1.on.aws";

/**
 * Retrieves the server URL from ScriptProperties.
 * If it doesn't exist, creates it with the default value.
 *
 * @returns {string} The server URL.
 */
function getServerUrl() {
    const scriptProperties = PropertiesService.getScriptProperties();
    let serverUrl = scriptProperties.getProperty('SERVER_URL');

    if (!serverUrl) {
        serverUrl = DEFAULT_SERVER_URL;
        scriptProperties.setProperty('SERVER_URL', serverUrl);
    }

    return serverUrl;
}

/**
 * Adds a custom menu to the Google Sheets UI when the spreadsheet is opened.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('gSheetAgent 🤖')
    .addItem('Open', 'showSidebar')
    .addSeparator() // Added separator
    .addItem('Setup', 'setup')
    .addToUi();
}

/**
 * Shows a sidebar in the Google Sheets UI.
 */
function showSidebar() {
  var html = HtmlService.createTemplateFromFile('sidebar/content')
      .evaluate()
      .setTitle('gSheetAgent');
  SpreadsheetApp.getUi().showSidebar(html);
}

function displayToast(message) {
  SpreadsheetApp.getActive().toast(message);
}

/**
 * Refreshes the sidebar content.
 */
function refreshSidebar() {
  showSidebar();  // Call the function to show the sidebar again
}

/**
 * Retrieves the OAuth token, script ID, and timezone for the current user and project.
 *
 * @returns {Object} An object containing the OAuth token, script ID, and timezone.
 * @property {string} oauthToken - The OAuth token for the current user.
 * @property {string} scriptId - The ID of the current script.
 * @property {string} timezone - The timezone of the active spreadsheet.
 */
function getScriptAttributes() {
    return {
        oauthToken: ScriptApp.getOAuthToken(),
        scriptId: ScriptApp.getScriptId(),
        timezone: SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),
        serverUrl: getServerUrl()
    };
}

/**
 * Will force a re-authentication of the script.
 */
function setup() {
  let spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let scriptId = ScriptApp.getProjectKey();
  console.log("Spreadsheet ID: " + spreadsheet.getId());
  console.log("Script ID: " + scriptId);
  SpreadsheetApp.getUi().alert("You should have up-to-date authorization at this stage.");
}

