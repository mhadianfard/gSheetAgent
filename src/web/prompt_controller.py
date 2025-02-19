import json
import base64

from src.google.script_uploader import ScriptUploader
from flask import Flask, request, jsonify
from flask_cors import CORS
from src.llm.openai_client import LLMClient  # Import the LLMClient

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

@app.route('/prompt/text', methods=['POST'])
def receive_instruction():
    """
    Receives a JSON payload with an 'instruction' string and generates a response using LLMClient.
    """
    data = request.get_json()        
    if 'instruction' not in data or 'scriptId' not in data:
        return jsonify({'error': 'Instruction or Script ID not provided'}), 400

    # Get the token from the Authorization header
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401

    token = auth_header.split(' ')[1]
    instruction = data['instruction']
    script_id = data['scriptId']  # Get the Script ID from the request

    uploader = ScriptUploader(token=token, script_id=script_id)

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
        response = uploader.update_script_content(received_code)
        # Check if the response indicates success
        if 'error' in response:
            print(f"Error: {response['error']}")
        else:
            print("Upload Successful!")  # Print a success message
    except Exception as e:
        print(f"An error occurred: {e}")

    # Return the generated response
    return jsonify({'received_instruction': received_instruction}), 200
