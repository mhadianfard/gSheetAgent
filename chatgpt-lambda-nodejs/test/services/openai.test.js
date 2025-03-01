const { generateResponse } = require('../../src/services/openai');
const { Configuration, OpenAIApi } = require('openai');

// Mock the OpenAI module
jest.mock('openai', () => {
  const mockCreateChatCompletion = jest.fn();
  return {
    Configuration: jest.fn(),
    OpenAIApi: jest.fn().mockImplementation(() => {
      return { createChatCompletion: mockCreateChatCompletion };
    })
  };
});

describe('OpenAI Service', () => {
  let openaiMock;
  
  beforeEach(() => {
    // Get the mocked instance
    openaiMock = new OpenAIApi();
    
    // Reset mock data
    jest.clearAllMocks();
  });
  
  test('generates a response from OpenAI', async () => {
    // Setup successful response for this test
    openaiMock.createChatCompletion.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Test response' } }],
        usage: { total_tokens: 10 }
      }
    });
    
    const result = await generateResponse('Test prompt');
    
    // Check that the API was called with correct params
    expect(openaiMock.createChatCompletion).toHaveBeenCalled();
    const callArgs = openaiMock.createChatCompletion.mock.calls[0][0];
    expect(callArgs.messages[0].content).toBe('Test prompt');
    
    // Check the response structure
    expect(result).toHaveProperty('text', 'Test response');
    expect(result).toHaveProperty('usage');
  });
  
  test('handles API errors gracefully', async () => {
    // Setup error response for this specific test
    openaiMock.createChatCompletion.mockRejectedValue(
      new Error('API rate limit exceeded')
    );
    
    // Check that error is thrown with the right message
    await expect(generateResponse('Test prompt')).rejects.toThrow(
      'OpenAI API error: API rate limit exceeded'
    );
  });
}); 