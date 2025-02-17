import datetime
from src.google.script_uploader import ScriptUploader
from src.web.prompt_controller import app

def main():
    """
    Main function to update Google Apps Script content.

    This function initializes a ScriptUploader instance and prepares a JavaScript function 
    that displays a timestamp alert in the Google Sheets UI. It attempts to upload this 
    script content to the Google Apps Script service. If the upload is successful, a 
    confirmation message is printed; otherwise, an error message is displayed.

    The timestamp function alerts the user with the last generated time of the script 
    in a user-friendly format.

    Raises:
        Exception: If there is an error during the upload process, it will be caught 
        and printed to the console.
    """
    uploader = ScriptUploader()
    code_content = f"""
    function performAction() {{
        const ui = SpreadsheetApp.getUi();
        ui.alert('This script was last generated at {datetime.datetime.now().strftime('%I:%M%p').lower()}');
    }}
    """
    try:
        response = uploader.update_script_content(code_content)
        # Check if the response indicates success
        if 'error' in response:
            print(f"Error: {response['error']}")
        else:
            print("Upload Successful!")  # Print a success message
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()