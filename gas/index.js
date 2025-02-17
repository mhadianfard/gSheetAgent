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
  var html = HtmlService.createTemplateFromFile('sidebar')
      .evaluate()
      .setTitle('gSheetAgent');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Refreshes the sidebar content.
 */
function refreshSidebar() {
  showSidebar();  // Call the function to show the sidebar again
}

