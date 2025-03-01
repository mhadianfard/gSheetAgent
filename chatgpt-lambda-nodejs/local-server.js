const app = require('./src/app');
const config = require('./src/config');

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('- POST /prompt');
  console.log('- GET /setup');
}); 