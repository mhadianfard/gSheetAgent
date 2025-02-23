import json
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import os
from config.settings import GOOGLE_SCOPES, GAS_DYNAMIC_DIRECTORY

class ScriptManager:
    """
    A class to handle uploading and updating Google Apps Script projects.

    Attributes:
        creds (Credentials): The Google API credentials.
        service (Resource): The Google Apps Script API service.
    """

    SCOPES = GOOGLE_SCOPES

    def __init__(self, token=None):
        """
        Initializes the ScriptUploader with credentials and service.

        Args:
            token (str): The OAuth token to authenticate the user.
        """
        self.creds = self._authenticate(token)
        self.service = build('script', 'v1', credentials=self.creds)


    def _authenticate(self, token):
        """
        Authenticates the user using the provided token.

        Args:
            token (str): The OAuth token to authenticate the user.

        Returns:
            Credentials: The authenticated Google API credentials.
        """
        if token:
            # Create credentials from the provided token
            creds = Credentials(token)
            if not creds.valid:
                raise Exception("Invalid credentials provided.")
            return creds
        else:
            raise Exception("No token provided for authentication.")


    def create_script(self, spreadsheet_id):
        """
        Creates a new Google Apps Script project.

        Args:
            spreadsheet_id (str): The ID of the spreadsheet to bind the script to.
        """
        # Create a new script project bound to a specific spreadsheet
        request = {
            'title': 'gSheetAgent Script',
            'parentId': spreadsheet_id  # Use the passed spreadsheet ID
        }

        try:
            response = self.service.projects().create(body=request).execute()
            return response
        except Exception as e:
            print(f"An error occurred: {e}")


    def update_script_content(self, script_id, code):
        """
        Updates the script content with the provided code and all files in the 'gas' directory.

        Args:
            script_id (str): The ID of the Google Apps Script project.
            code (str): The JavaScript code to update the script with.

        Returns:
            dict: The response from the Google Apps Script API.
        """
        # Start with the provided code
        files = [
            {
                'name': 'generated',
                'type': 'SERVER_JS',
                'source': code
            },
            {
                'name': 'appsscript',
                'type': 'JSON',
                'source': json.dumps({
                    "timeZone": "America/New_York",
                    "exceptionLogging": "CLOUD",
                    "runtimeVersion": "V8",
                    "oauthScopes": GOOGLE_SCOPES
                })
            }
        ]

        # Add all files from the 'gas' directory and its subfolders
        gas_directory = GAS_DYNAMIC_DIRECTORY
        
        for root, _, filenames in os.walk(gas_directory):  # Use os.walk to traverse subfolders
            for filename in filenames:
                filepath = os.path.join(root, filename)
                if os.path.isfile(filepath):
                    with open(filepath, 'r') as file:
                        file_content = file.read()
                        if filename.endswith('.html'):
                            file_type = 'HTML'
                        elif filename.endswith('.js'):
                            file_type = 'SERVER_JS'
                        elif filename.endswith('.json'):
                            file_type = 'JSON'
                        else:
                            file_type = 'UNKNOWN'
                        # Use relative path for the name to maintain folder structure
                        relative_name = os.path.relpath(filepath, gas_directory)
                        files.append({
                            'name': os.path.splitext(relative_name)[0],  # Get filename without extension
                            'type': file_type,
                            'source': file_content
                        })

        # Create the request body
        request = {'files': files}

        # Execute the update request
        response = self.service.projects().updateContent(
            scriptId=script_id,
            body=request
        ).execute()
        return response
     