const { handler } = require('../lambda');

// Create a mock event object
const createMockEvent = (path, method, body = {}) => ({
  path,
  httpMethod: method,
  body: JSON.stringify(body),
  headers: {
    'Content-Type': 'application/json'
  }
});

describe('Lambda Handler', () => {
  test('handles /prompt endpoint', async () => {
    // Mock the serverless-http handler response
    const mockEvent = createMockEvent('/prompt', 'POST', { 
      prompt: 'Test prompt' 
    });
    
    const response = await handler(mockEvent, {});
    
    expect(response).toHaveProperty('statusCode');
    expect(response.statusCode).toBe(200);
    expect(response).toHaveProperty('body');
    
    // Parse the response body
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('text');
  });
  
  test('handles /setup endpoint', async () => {
    const mockEvent = createMockEvent('/setup', 'GET');
    
    const response = await handler(mockEvent, {});
    
    expect(response).toHaveProperty('statusCode');
    expect(response.statusCode).toBe(200);
  });
  
  test('returns 404 for unknown endpoints', async () => {
    const mockEvent = createMockEvent('/unknown', 'GET');
    
    const response = await handler(mockEvent, {});
    
    expect(response).toHaveProperty('statusCode');
    expect(response.statusCode).toBe(404);
  });
}); 