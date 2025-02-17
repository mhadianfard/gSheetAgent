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
    
    if 'instruction' not in data:
        return jsonify({'error': 'Instruction not provided'}), 400
    
    instruction = data['instruction']
    
    # Create an instance of LLMClient
    llm_client = LLMClient()
    
    # Generate a response using the instruction
    response = llm_client.get_apps_script_code(instruction)    
    if response is None:
        return jsonify({'error': 'Failed to generate response from LLM'}), 500
    
    print("Response content:", response)  # Add this line for debugging
    
    try:
        response_json = json.loads(response)
    except json.JSONDecodeError as e:
        print("Failed to decode JSON:", e)
        # Handle the error appropriately
    
    received_instruction = base64.b64decode(response_json.get('explanation', '')).decode('utf-8') or 'No explanation provided'
    received_code = base64.b64decode(response_json.get('code', '')).decode('utf-8') or ''

    uploader = ScriptUploader()
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

if __name__ == '__main__':
    app.run(debug=True)
