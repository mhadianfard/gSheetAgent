const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

class LLMClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.instructionFile = path.join(process.cwd(), config.llm.instructionFile);
  }

  /**
   * Generate Google Apps Script code based on the provided prompt
   * 
   * @param {string} prompt - The user instruction/prompt
   * @returns {Promise<string>} - JSON string containing the response with code and explanation
   */
  async getAppsScriptCode(prompt) {
    try {
      // Read the instruction file content
      const instructionContent = await fs.readFile(this.instructionFile, 'utf8');
      
      const response = await this.client.chat.completions.create({
        model: config.llm.model || "gpt-4",
        messages: [
          { role: "system", content: instructionContent },
          { role: "user", content: `\`\`\`${prompt}\`\`\`` }
        ],
        response_format: { type: "json_object" }
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return null;
    }
  }
}

module.exports = LLMClient; 