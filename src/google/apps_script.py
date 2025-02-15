from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import json
import os
import time
from config.settings import GOOGLE_CREDENTIALS_PATH, GOOGLE_TOKEN_PATH, GOOGLE_SCOPES

class GoogleAppsScript:
    def __init__(self, spreadsheet_id):
        self.spreadsheet_id = spreadsheet_id
        print(f"Initializing with spreadsheet ID: {spreadsheet_id}")
        self.creds = self._get_credentials()
        self.script_id = None  # Will store the script ID
        
        # Test with Sheets API first
        try:
            sheets_service = build('sheets', 'v4', credentials=self.creds)
            result = sheets_service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()
            print(f"Successfully accessed spreadsheet: {result.get('properties', {}).get('title', 'Unknown')}")
            
            self.service = build('script', 'v1', credentials=self.creds)
            
            # Try to create a persistent script
            self.create_persistent_script()
            
        except Exception as e:
            print(f"Error in initialization: {e}")
            return

    def create_persistent_script(self):
        """Creates a persistent script if it doesn't exist."""
        try:
            # Create a new script project if we don't have one
            if not self.script_id:
                project = {
                    'title': 'Voice Assistant Script',
                    'parentId': self.spreadsheet_id
                }
                
                print("Creating persistent script project...")
                project = self.service.projects().create(body=project).execute()
                self.script_id = project['scriptId']
                print(f"Created persistent script with ID: {self.script_id}")
        except Exception as e:
            print(f"Error creating persistent script: {e}")

    def update_script(self, script_content):
        """Updates the existing script with new content."""
        try:
            if not self.script_id:
                print("No script ID available")
                return False
                
            files = [{
                'name': 'Code',
                'type': 'SERVER_JS',
                'source': script_content
            }, {
                'name': 'appsscript',
                'type': 'JSON',
                'source': json.dumps({
                    'timeZone': 'America/New_York',
                    'dependencies': {},
                    'exceptionLogging': 'CLOUD'
                })
            }]
            
            print(f"Updating script {self.script_id} with new content...")
            self.service.projects().updateContent(
                scriptId=self.script_id,
                body={'files': files}
            ).execute()
            
            print("Script updated successfully")
            return True
            
        except Exception as e:
            print(f"Error updating script: {e}")
            return False

    def run_script(self):
        """Runs the persistent script."""
        try:
            if not self.script_id:
                print("No script ID available")
                return None
                
            print(f"Running script {self.script_id}")
            
            # Create a new version
            version = self.service.projects().versions().create(
                scriptId=self.script_id,
                body={}
            ).execute()
            
            print(f"Created version: {version}")
            
            # Create deployment
            deployment = {
                'versionNumber': version['versionNumber'],
                'manifestFileName': 'appsscript',
                'description': 'Auto deployment'
            }
            
            deployment = self.service.projects().deployments().create(
                scriptId=self.script_id,
                body=deployment
            ).execute()
            
            deployment_id = deployment['deploymentId']  # Get the AKfycby... ID
            print(f"Created deployment with ID: {deployment_id}")
            
            # Run using deployment ID
            request = {
                'function': 'main',
                'parameters': []
            }
            
            response = self.service.scripts().run(
                scriptId=deployment_id,  # Use the AKfycby... ID here
                body=request
            ).execute()
            
            print(f"Full response: {response}")
            
            if 'error' in response:
                print(f"Script execution error: {response['error']}")
                return None
                
            return response.get('response', {}).get('result')
            
        except Exception as e:
            print(f"Error executing script: {e}")
            print(f"Try visiting: https://script.google.com/macros/s/{deployment_id}/exec")
            return None

    def _get_credentials(self):
        creds = None
        
        if os.path.exists(GOOGLE_TOKEN_PATH):
            creds = Credentials.from_authorized_user_file(GOOGLE_TOKEN_PATH, GOOGLE_SCOPES)
            print("Found existing credentials")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                print("Refreshed expired credentials")
            else:
                print("Getting new credentials...")
                flow = InstalledAppFlow.from_client_secrets_file(
                    GOOGLE_CREDENTIALS_PATH, GOOGLE_SCOPES)
                creds = flow.run_local_server(port=0)
            
            with open(GOOGLE_TOKEN_PATH, 'w') as token:
                token.write(creds.to_json())
                print("Saved new credentials")

        return creds 