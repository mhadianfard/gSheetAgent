from openai import OpenAI
from config.settings import OPENAI_API_KEY, LLM_INSTRUCTION_FILE

class LLMClient:
    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)
    
    def get_apps_script_code(self, prompt):
        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": open(LLM_INSTRUCTION_FILE).read()},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content
        
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return None 