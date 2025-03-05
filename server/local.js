const app = require('../src/web/app');
const config = require('../src/config');
const { generateBuildNumber } = require('../src/utils/build');

const PORT = config.server.port;

// Set build number in environment variable
process.env.LATEST_BUILD = generateBuildNumber();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Build number: ${process.env.LATEST_BUILD}`);
  console.log('Available endpoints:');
  console.log('- GET /health');
  console.log('- POST /prompt');
  console.log('- GET /setup');
}); 