from openai import OpenAI
from config.settings import OPENAI_API_KEY

class LLMClient:
    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)
    
    def get_apps_script_code(self, prompt):
        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": """You are an assistant to expedite repetitive tasks in Google Sheets.
                    You'll be asked a series of automated tasks to conduct. Write code in Google App Script..."""},
                    {"role": "user", "content": f"Create a Google Apps Script that does the following: {prompt}"}
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return None 