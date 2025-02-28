import os
from dotenv import load_dotenv
from pathlib import Path
import datetime

# Get the base directory of our project
BASE_DIR = Path(__file__).resolve().parent.parent

# Load the .env file
load_dotenv(BASE_DIR / '.env')

# Get the API key from the environment first, then from the .env file
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY')

if not OPENAI_API_KEY:
    raise Exception("OPENAI_API_KEY not found in environment or .env file")

# Google API Settings
GOOGLE_CREDENTIALS_PATH = BASE_DIR / 'credentials.json'
GOOGLE_TOKEN_PATH = BASE_DIR / 'token.json'
GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/script.container.ui',
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/spreadsheets.currentonly',
]

SCRIPT_ID_FILE = BASE_DIR / 'script_id.txt'
TOKEN_FILE = BASE_DIR / 'token.json' 
LLM_INSTRUCTION_FILE = BASE_DIR / 'src/llm/llm_instruction.txt'
GAS_DYNAMIC_DIRECTORY = BASE_DIR / 'gas/dynamic'

# CORS Settings
CORS_ORIGIN = "https://*.script.googleusercontent.com"

def get_default_dynamic_script():
    """
    Generates the JavaScript code for the performAction function with the current timestamp.

    Returns:
        str: The JavaScript code to upload.
    """
    current_time = datetime.datetime.now().strftime('%I:%M%p').lower()
    return f"""
    function performAction() {{
        const ui = SpreadsheetApp.getUi();
        ui.alert('This script was last generated at {current_time}');
    }}
    """