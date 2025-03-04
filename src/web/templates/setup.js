/**
 * The /setup endpoint on the server will first attempt to update the remote script with new contents, 
 * then it will respond with contents of this script file as an application/javascript response.
 * 
 * In case the script update fails, the server will put a failure message here before responding to the caller.
 * 
 */
document.addEventListener("DOMContentLoaded", function() 
{
    const failureMessage = ''; // This will be set by the server if the script update fails.

    if (!failureMessage) {
        google.script.run.finishSetup();
        
    } else {
        // Find the main content container and clear it
        const container = document.getElementById('main-content');
        container.innerHTML = '';

        // Create the header
        const header = document.createElement('h2');
        header.className = 'text-left mt-4 mb-4';
        header.textContent = 'gSheetAgent';
        container.appendChild(header);

        // Create Failure Alert
        const failureAlert = document.createElement('div');
        failureAlert.id = 'failureAlert';
        failureAlert.className = 'alert alert-danger';
        failureAlert.role = 'alert';
        failureAlert.innerHTML = `
            <p>Failed to set up the gSheetAgent dynamic script component:</p>
            <p id="failureMessage">${failureMessage}</p>
        `;
        container.appendChild(failureAlert);
    }
});