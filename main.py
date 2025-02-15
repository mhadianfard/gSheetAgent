from src.speech.recognizer import VoiceRecognizer
from src.llm.openai_client import LLMClient
from src.google.apps_script import GoogleAppsScript

def main():
    voice_recognizer = VoiceRecognizer()
    llm_client = LLMClient()
    apps_script = GoogleAppsScript()
    
    print("Starting voice-controlled Google Apps Script...")
    
    voice_input = voice_recognizer.listen()
    if voice_input:
        print("\nGenerating Google Apps Script code...")
        script_code = llm_client.get_apps_script_code(voice_input)
        if script_code:
            print("\nGenerated Script:")
            print(script_code)
            # Future: Deploy and execute script

if __name__ == "__main__":
    main() 