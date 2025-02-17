from src.google.script_uploader import ScriptUploader

def main():
    uploader = ScriptUploader()
    code_content = "function myFunction() { console.log('Hello, world! @ 11:05pm'); }"
    response = uploader.update_script_content(code_content)
    print(f"Updated script with response: {response}")

if __name__ == "__main__":
    main() 