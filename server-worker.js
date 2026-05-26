require('dotenv').config();
const { initQueues } = require('./src/queues/queueFactory');
const { startAllWorkers, stopAllWorkers } = require('./src/queues/workerFactory');

initQueues();
startAllWorkers();

console.log('[Worker Process] BullMQ workers started successfully.');

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
    console.log(`\n[Worker Process] Received ${signal}. Draining workers...`);
    stopAllWorkers()
        .then(() => {
            console.log('[Worker Process] All workers stopped. Exiting.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[Worker Process] Error during shutdown:', err.message);
            process.exit(1);
        });

    setTimeout(() => {
        console.error('[Worker Process] Forced exit after timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
