/**
 * Creates a custom menu in the Google Sheets UI when the spreadsheet is opened.
 */
function onOpen() {
    const scriptProperties = PropertiesService.getScriptProperties();
    const dynamicScriptId = scriptProperties.getProperty('DYNAMIC_SCRIPT_ID');
    if (!dynamicScriptId) {
        const ui = SpreadsheetApp.getUi();
        ui.createMenu('gSheetAgent Installer')
            .addItem('Install Dynamic Script', 'openSidebar')
            .addToUi();
    } else {
        console.log('Dynamic script already installed.');
        console.log('Script ID: ', dynamicScriptId);
    }
}

/**
 * Opens the sidebar in the Google Sheets UI.
 */
function openSidebar() {
    var html = HtmlService.createTemplateFromFile('sidebar/content')
        .evaluate()
        .setTitle('gSheetAgent Installer');
    SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Retrieves the active spreadsheet ID and the OAuth token for the current user.
 * 
 * @returns {Object} An object containing the spreadsheet ID and the OAuth token.
 */
function getAppVariables() {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();    
    const token = ScriptApp.getOAuthToken();    
    return {
        spreadsheetId: spreadsheetId,
        authToken: token
    };
}

/**
 * Stores the provided Google Apps Script ID in the Script Properties of the active GAS application.
 *
 * @param {string} scriptId - The Google Apps Script ID to store.
 */
function storeDynamicScriptID(scriptId) {
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('DYNAMIC_SCRIPT_ID', scriptId);
}

/**
 * Clears the stored Google Apps Script ID from the Script Properties of the active GAS application.
 */
function clearDynamicScriptID() {
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.deleteProperty('DYNAMIC_SCRIPT_ID');
}
