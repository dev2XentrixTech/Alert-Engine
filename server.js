require('dotenv').config();
const app                = require('./app');
const { initQueues }     = require('./src/queues/queueFactory');
const { startAllWorkers } = require('./src/queues/workerFactory');

const PORT = process.env.PORT || 4000;

initQueues();

startAllWorkers();

require('./src/cron/triggerCron');

app.listen(PORT, () => {
  console.log(`[alert-notification-ms] HTTP server running on port ${PORT}`);
});
