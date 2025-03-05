
/**
 * Default server URL
 */
const DEFAULT_SERVER_URL = "https://server.gSheetAgent.app";
var LAST_SERVER_URL = "";   // Will store a record of where the latest codebase was loaded from

/**
 * Adds a custom menu to the Google Sheets UI when the spreadsheet is opened.
 */
function onOpen() {
    const documentProperties = PropertiesService.getDocumentProperties();
    const hasFinishedSetup = documentProperties.getProperty('setup_finished');
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('gSheetAgent 🤖');
    if (hasFinishedSetup) {
        menu.addItem('Open Sidebar', 'openSidebar')
            .addSeparator()
            .addItem('Test Connection', 'setup')
            .addToUi();
    } else {
        menu.addItem('Setup', 'setup');
    }
    menu.addToUi();
}

/**
 * Retrieves the server URL from ScriptProperties, also updates the global variable LAST_SERVER_URL.
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

    LAST_SERVER_URL = serverUrl.trim().replace(/\/+$/, '');
    return LAST_SERVER_URL;
}

/**
 * Refreshes the sidebar content.
 */
function refreshSidebar() {
  openSidebar();
}

/**
 * Displays a toast message in the Google Sheets UI.
 * @param {string} message - The message to display in the toast.
 */
function displayToast(message) {
  SpreadsheetApp.getActive().toast(message);
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
 * Opens the sidebar in the Google Sheets UI.
 */
function setup() {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
    const scriptAttributes = getScriptAttributes();
    const url = `${getServerUrl()}/setup?authToken=${scriptAttributes.oauthToken}&scriptId=${scriptAttributes.scriptId}`;
    const html = ''
        + '<html>'
        + '     <head>'
        + '         <base target="_top">'
        + '         <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">'
        + '         <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">'
        + `         <script src="${url}"></script>`
        + '     </head>'
        + '     <body style="background-color: #F0F4F9; min-height: 100vh; display: flex; flex-direction: column;">'
        + '         <div id="main-content" class="container flex-grow-1">'
        + '             <p>One second...</p>'
        + '         </div>'
        + '     </body>'
        + '</html>';
    const htmlOutput = HtmlService.createHtmlOutput(html).setTitle('gSheetAgent');
    SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

/**
 * Finishes the setup process and opens the sidebar.
 */
function finishSetup() {
    PropertiesService.getDocumentProperties().setProperty('setup_finished', 'true');
    openSidebar();
    displayToast('Latest codebase was successfully loaded from the server!');
}

/**
 * Shows a sidebar in the Google Sheets UI.
 */
function openSidebar() {
    const html = HtmlService.createTemplateFromFile('sidebar/content')
        .evaluate()
        .setTitle('gSheetAgent');
    SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Resets the script properties and document properties by deleting all stored properties.
 * This function is useful for clearing any saved settings or data associated with the script.
 */
function resetScript() {
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.deleteAllProperties();
    const documentProperties = PropertiesService.getDocumentProperties();
    documentProperties.deleteAllProperties();
    console.log('Script reset successfully');
}

