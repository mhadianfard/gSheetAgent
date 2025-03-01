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
      .addItem('Setup', 'setup')
      .addToUi();
  }

/**
 * Requests authorization for the script to access specific Google services.
 * This function requires the necessary OAuth scopes to be granted for full access.
 * 
 * @function requestAuthorization
 * @returns {void}
 */
function requestAuthorization() {
    ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.container.ui',
        'https://www.googleapis.com/auth/script.projects',
        'https://www.googleapis.com/auth/spreadsheets.currentonly',
    ]);
}

/**
 * Refreshes the sidebar content.
 */
function refreshSidebar() {
    showSidebar();  // Call the function to show the sidebar again
  }
  
/**
 * Retrieves the OAuth token and script ID for the current user and project.
 *
 * @returns {Object} An object containing the OAuth token and script ID.
 */
function getScriptAttributes() {
    return {
        oauthToken: ScriptApp.getOAuthToken(),
        scriptId: ScriptApp.getScriptId()
    };
}

/**
 * Opens the sidebar in the Google Sheets UI.
 */
function setup() {
    requestAuthorization();
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
    const htmlOutput = HtmlService.createHtmlOutput(html)
        .setTitle('gSheetAgent');
    SpreadsheetApp.getUi().showSidebar(htmlOutput);
}



