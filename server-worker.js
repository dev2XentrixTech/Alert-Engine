require('dotenv').config();
const { initQueues } = require('./src/queues/queueFactory');
const { startAllWorkers } = require('./src/queues/workerFactory');

// Initialize queues and workers
initQueues();
startAllWorkers();

console.log('[Worker Process] BullMQ workers started successfully.');
