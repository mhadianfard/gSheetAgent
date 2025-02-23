import json
from src.google.script_manager import ScriptManager
from flask import Flask, request, jsonify
from flask_cors import CORS
from src.llm.openai_client import LLMClient  # Import the LLMClient
from config.settings import get_default_dynamic_script

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

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
    if 'instruction' not in data or 'scriptId' not in data:
        return jsonify({'error': 'Instruction or Script ID not provided'}), 400

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
        response = uploader.update_script_content(script_id, received_code)
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



@app.route('/script/create', methods=['POST'])
def create_script():
    data = request.get_json()        
    if 'spreadsheet_id' not in data:
        return jsonify({'error': 'spreadsheet_id must be provided'}), 400
    spreadsheet_id = data['spreadsheet_id']

    token = get_authorization_token()
    if not token:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        manager = ScriptManager(token=token)  # Initialize your ScriptManager
        response = manager.create_script(spreadsheet_id)  # Call the create_script method
        script_id = response['scriptId']
        manager.update_script_content(script_id, get_default_dynamic_script())

        if 'error' in response:
            raise Exception(response['error'])

        return jsonify({'message': 'Script created successfully', 'script_id': response['scriptId']}), 201

    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({'error': str(e)}), 500 