from src.google.apps_script import GoogleAppsScript
from config.settings import SPREADSHEET_ID

def main():
    apps_script = GoogleAppsScript(SPREADSHEET_ID)
    
    # Simple test script that logs to console
    test_script = '''
    function main() {
      console.log("Hello World");
      return "Script executed successfully!";
    }
    '''
    
    print("\nUpdating script content...")
    if apps_script.update_script(test_script):
        print("\nExecuting script...")
        result = apps_script.run_script()
        print(f"\nExecution result: {result}")
    else:
        print("Failed to update script")

if __name__ == "__main__":
    main() 