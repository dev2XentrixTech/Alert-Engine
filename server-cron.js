require('dotenv').config();
const { initQueues } = require('./src/queues/queueFactory');
require('./src/cron/triggerCron');
require('./src/cron/sequentialCron');

initQueues();

console.log('[Cron Process] Cron scheduler started successfully.');

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
    console.log(`\n[Cron Process] Received ${signal}. Exiting.`);
    process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
