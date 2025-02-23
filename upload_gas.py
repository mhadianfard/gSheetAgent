import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.script_manager import ScriptManager
from config.settings import TOKEN_FILE, GOOGLE_CREDENTIALS_PATH, GOOGLE_SCOPES, SCRIPT_ID_FILE, get_default_dynamic_script

def main():
    """
    Main function to update Google Apps Script content.

    This function serves as a CLI entry point for easier development. It allows developers 
    to push code directly to the specified Google Apps Script project without going through 
    the main application flow. The main application flow receives the authentication token 
    from requests originating from the Google Apps Script application.

    The function initializes a ScriptUploader instance and prepares a JavaScript function 
    that displays a timestamp alert in the Google Sheets UI. It attempts to upload this 
    script content to the Google Apps Script service. If the upload is successful, a 
    confirmation message is printed; otherwise, an error message is displayed.

    The timestamp function alerts the user with the last generated time of the script 
    in a user-friendly format.

    Raises:
        Exception: If there is an error during the upload process, it will be caught 
        and printed to the console.
    """
    # Obtain Google Authorization token
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r') as token:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, GOOGLE_SCOPES)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                GOOGLE_CREDENTIALS_PATH, GOOGLE_SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())

    # Load the script ID from the file system
    with open(SCRIPT_ID_FILE, 'r') as file:
        script_id = file.read().strip()

    # Initialize the ScriptUploader without script_id
    uploader = ScriptManager(token=creds.token)

    # Use the dynamic script content from the settings
    code_content = get_default_dynamic_script()
    
    try:
        # Pass the script_id to the update_script_content method
        response = uploader.update_script_content(script_id, code_content)
        # Check if the response indicates success
        if 'error' in response:
            print(f"Error: {response['error']}")
        else:
            print("Upload Successful!")  # Print a success message
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()