import json
import os  # Import os to handle file paths
from src.google.script_manager import ScriptManager
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from src.llm.openai_client import LLMClient  # Import the LLMClient
from config.settings import CORS_ORIGIN  # Import the CORS origin from settings

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": CORS_ORIGIN}})  # Enable CORS for specific origins

def cors_headers():
    return {
        'Access-Control-Allow-Origin': CORS_ORIGIN,  # Use the configuration value
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

def get_authorization_token():
    """Extracts the token from the Authorization header."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    return auth_header.split(' ')[1]


@app.route('/prompt', methods=['POST'])
def receive_instruction():
    """
    Receives a JSON payload with an 'instruction' string and generates a response using LLMClient.
    """
    data = request.get_json()        
    if 'instruction' not in data or 'scriptId' not in data or 'timezone' not in data:
        return jsonify({'error': 'Instruction, Script ID or Timezone not provided'}), 400

    token = get_authorization_token()
    if not token:
        return jsonify({'error': 'Unauthorized'}), 401
    
    instruction = data['instruction']
    script_id = data['scriptId']  # Get the Script ID from the request

    # Initialize ScriptManager without script_id
    uploader = ScriptManager(token=token)

    # Generate a response from the LLM client using the instruction
    llm_client = LLMClient()
    response = llm_client.get_apps_script_code(instruction)    
    if response is None:
        return jsonify({'error': 'Failed to generate response from LLM'}), 500        
    print("Response content:", response)  # Add this line for debugging
    
    try:
        response_json = json.loads(response)
    except json.JSONDecodeError as e:
        print("Failed to decode JSON:", e)
        return jsonify({'error': 'Failed to decode response from LLM'}), 500

    received_instruction = response_json.get('explanation', 'No explanation provided')
    received_code = response_json.get('code', '')

    try:
        # Pass the script_id to the update_script_content method
        response = uploader.update_script_content(script_id, received_code, timezone)
        if 'error' in response:
            raise Exception(response['error'])
    except Exception as e:
        error_message = str(e)
        # Check if the error message contains the specific error
        if 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' in error_message:
            user_message = "This document hasn't been properly authorized to do an end-to-end automation. Please reinstall the add-on."
        else:
            user_message = error_message  # Use the original error message for other errors

        print(f"An error occurred: {error_message}")
        return jsonify({'error': user_message}), 500
    
    print("Upload Successful!")  # Print a success message
    return jsonify({'received_instruction': received_instruction}), 200



@app.route('/setup', methods=['GET'])
def setup():
    # Read the contents of setup.js from the filesystem
    js_file_path = os.path.join(os.path.dirname(__file__), 'templates', 'setup.js')
    with open(js_file_path, 'r') as js_file:
        js_content = js_file.read()

    try:
        data = request.args
        if 'authToken' not in data or 'scriptId' not in data:
            raise Exception('authToken and scriptId must be provided')
        auth_token = data['authToken']
        script_id = data['scriptId']

        manager = ScriptManager(token=auth_token)  # Initialize your ScriptManager
        response = manager.update_script_content(script_id)
        if 'error' in response:
            raise Exception(response['error'])

    except Exception as e:
        print(f"An error occurred: {e}")
        if 'SERVICE_DISABLED' in str(e):
            # @todo provide better instructions here:
            user_message = "The Apps Script API has not been enabled for this project. Please enable it by visiting the Google Developers Console."
            js_content = js_content.replace("failureMessage = ''", f"failureMessage = '{user_message}'")
        else:
            js_content = js_content.replace("failureMessage = ''", f"failureMessage = '{e}'")
    
    return Response(js_content, mimetype='application/javascript', headers=cors_headers())