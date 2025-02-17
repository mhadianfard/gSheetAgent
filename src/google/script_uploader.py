from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import os
from google.oauth2.credentials import Credentials
from config.settings import SCRIPT_ID_FILE, TOKEN_FILE, GOOGLE_CREDENTIALS_PATH, GOOGLE_SCOPES, GAS_DIRECTORY

class ScriptUploader:
    """
    A class to handle uploading and updating Google Apps Script projects.

    Attributes:
        script_id (str): The ID of the Google Apps Script project.
        creds (Credentials): The Google API credentials.
        service (Resource): The Google Apps Script API service.
    """

    SCOPES = GOOGLE_SCOPES

    def __init__(self):
        """
        Initializes the ScriptUploader with credentials and service.
        Loads the script ID and authenticates the user.
        """
        self.script_id = self._load_script_id()
        self.creds = self._authenticate()
        self.service = build('script', 'v1', credentials=self.creds)

    def _load_script_id(self):
        """
        Loads the script ID from a file.

        Returns:
            str: The script ID.
        """
        with open(SCRIPT_ID_FILE, 'r') as file:
            return file.read().strip()

    def _authenticate(self):
        """
        Authenticates the user and returns credentials.

        Returns:
            Credentials: The authenticated Google API credentials.
        """
        creds = None
        if os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE, 'r') as token:
                creds = Credentials.from_authorized_user_file(TOKEN_FILE, self.SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    GOOGLE_CREDENTIALS_PATH, self.SCOPES)
                creds = flow.run_local_server(port=0)
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        return creds

    def update_script_content(self, code):
        """
        Updates the script content with the provided code and all files in the 'gas' directory.

        Args:
            code (str): The JavaScript code to update the script with.

        Returns:
            dict: The response from the Google Apps Script API.
        """
        # Start with the provided code
        files = [
            {
                'name': 'Code',
                'type': 'SERVER_JS',
                'source': code
            }
        ]

        # Add all files from the 'gas' directory
        gas_directory = GAS_DIRECTORY
        for filename in os.listdir(gas_directory):
            filepath = os.path.join(gas_directory, filename)
            if os.path.isfile(filepath):
                with open(filepath, 'r') as file:
                    file_content = file.read()
                    file_type = 'SERVER_JS' if filename.endswith('.js') else 'JSON'
                    files.append({
                        'name': os.path.splitext(filename)[0],  # Get filename without extension
                        'type': file_type,
                        'source': file_content
                    })

        # Debug: Print the files array to the console
        print("Files array:", files)

        # Create the request body
        request = {'files': files}

        # Execute the update request
        response = self.service.projects().updateContent(
            scriptId=self.script_id,
            body=request
        ).execute()
        return response 