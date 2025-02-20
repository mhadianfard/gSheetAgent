/**
 * Adds a custom menu to the Google Sheets UI when the spreadsheet is opened.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('gSheetAgent')
    .addItem('Open', 'showSidebar')
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
 * Will force a re-authentication of the script.
 */
function forceReauthentication() {
  let spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let scriptId = ScriptApp.getProjectKey();
  console.log(scriptId);
}

