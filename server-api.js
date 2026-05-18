require('dotenv').config();
const app = require('./app');
const { initQueues } = require('./src/queues/queueFactory');

const PORT = process.env.PORT || 4000;

// Initialize queues for the API to be able to push jobs
initQueues();

app.listen(PORT, () => {
  console.log(`[API Process] HTTP server running on port ${PORT}`);
});
