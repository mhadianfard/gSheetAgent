const express = require('express');
const cors = require('cors');
const { generateResponse } = require('./services/openai');
const { getSetupStatus } = require('./services/google-auth');

const app = express();

// Middleware for parsing JSON and handling CORS
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CORS headers function (similar to your Python implementation)
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Routes
app.post('/prompt', async (req, res) => {
  try {
    const { prompt, options } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const response = await generateResponse(prompt, options);
    res.json(response);
  } catch (error) {
    console.error("Error processing prompt:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/setup', async (req, res) => {
  try {
    const setupInfo = await getSetupStatus();
    res.json(setupInfo);
  } catch (error) {
    console.error("Error in setup:", error);
    res.status(500).json({ error: error.message });
  }
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Lambda integration
module.exports = app;
