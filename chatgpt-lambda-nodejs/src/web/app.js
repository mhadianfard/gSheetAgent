const express = require('express');
const routes = require('./routes');
const config = require('../config');

const app = express();

// Middleware for parsing JSON
app.use(express.json());

// Use web routes
app.use('/', routes);

// For local development
if (require.main === module) {
  const PORT = config.server.port || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Lambda integration
module.exports = app; 