import json
from src.web.routes import app
from config.settings import CORS_ORIGIN  # Import the CORS origin from settings

def cors_headers():
    return {
        'Access-Control-Allow-Origin': CORS_ORIGIN,  # Use the configuration value
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

def lambda_handler(event, context):
    http_method = event['httpMethod']
    path = event['path']  # Get the path from the event

    # Create a mock request object to pass to the Flask app
    with app.test_request_context(path, method=http_method, json=json.loads(event.get('body', '{}'))):
        if path == '/prompt' and http_method == 'POST':
            response = app.full_dispatch_request()
            return {
                'statusCode': response.status_code,
                'headers': cors_headers(),  # Use the CORS headers function
                'body': response.get_data(as_text=True)
            }
        elif path == '/setup' and http_method == 'GET':
            response = app.full_dispatch_request()
            return {
                'statusCode': response.status_code,
                'headers': cors_headers(),  # Use the CORS headers function
                'body': response.get_data(as_text=True)
            }
        else:
            return {
                'statusCode': 404,
                'headers': cors_headers(),  # Use the CORS headers function
                'body': json.dumps('Not Found')
            }
