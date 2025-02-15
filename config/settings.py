import os
from dotenv import load_dotenv
from pathlib import Path

# Get the base directory of our project
BASE_DIR = Path(__file__).resolve().parent.parent

# Load the .env file
load_dotenv(BASE_DIR / '.env')

# Get the API key
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not OPENAI_API_KEY:
    raise Exception("OPENAI_API_KEY not found in .env file")

# Google API Settings
GOOGLE_CREDENTIALS_PATH = 'path/to/credentials.json'
GOOGLE_TOKEN_PATH = BASE_DIR / 'token.json'
GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.projects'
]

# The ID of your Google Spreadsheet where scripts will be deployed
SPREADSHEET_ID = os.getenv('SPREADSHEET_ID') 