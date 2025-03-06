/**
 * Generates a build number in YYMMDDHHMMSS format using Toronto timezone
 * @returns {string} Build number
 */
function generateBuildNumber() {
  // Create date in Toronto timezone (Eastern Time)
  const options = { timeZone: 'America/Toronto' };
  const torontoTime = new Date().toLocaleString('en-US', options);
  const torontoDate = new Date(torontoTime);
  
  // Format as YYMMDDHHMMSS
  const year = torontoDate.getFullYear().toString().slice(-2);
  const month = (torontoDate.getMonth() + 1).toString().padStart(2, '0');
  const day = torontoDate.getDate().toString().padStart(2, '0');
  const hours = torontoDate.getHours().toString().padStart(2, '0');
  const minutes = torontoDate.getMinutes().toString().padStart(2, '0');
  const seconds = torontoDate.getSeconds().toString().padStart(2, '0');
  
  return `${year}${month}${day}.${hours}${minutes}.${seconds}`;
}

module.exports = {
  generateBuildNumber
}; 