document.addEventListener("DOMContentLoaded", function() 
{
    const failureMessage = '';

    if (!failureMessage) {
        google.script.run.refreshSidebar();

        // // Create Success Alert
        // const successAlert = document.createElement('div');
        // successAlert.id = 'successAlert';
        // successAlert.className = 'alert alert-success';
        // successAlert.style.display = failureMessage ? 'none' : 'block';
        // successAlert.role = 'alert';
        // successAlert.innerHTML = `
        //     <p>The gSheetAgent dynamic script component was installed successfully.</p>
        //     <p>Please refresh your browser and check the gSheetAgent menu again for the prompt capability.</p>
        // `;
        // container.appendChild(successAlert);        
        
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