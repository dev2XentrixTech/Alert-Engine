require('dotenv').config();
const { initQueues } = require('./src/queues/queueFactory');
require('./src/cron/triggerCron');
require('./src/cron/sequentialCron');

initQueues();

console.log('[Cron Process] Cron scheduler started successfully.');
