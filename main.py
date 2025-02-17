from src.google.script_uploader import ScriptUploader
import datetime

def main():
    """Main function to update Google Apps Script content."""
    uploader = ScriptUploader()
    code_content = f"""
    function performAction() {{
        const ui = SpreadsheetApp.getUi();
        ui.alert('This script was last generated at {datetime.datetime.now().strftime('%I:%M%p').lower()}');
    }}
    """
    try:
        response = uploader.update_script_content(code_content)
        # Check if the response indicates success
        if 'error' in response:
            print(f"Error: {response['error']}")
        else:
            print("Upload Successful!\n")  # Print a success message
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main() 