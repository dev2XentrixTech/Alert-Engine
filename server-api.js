require('dotenv').config();
const app = require('./app');
const { initQueues } = require('./src/queues/queueFactory');

const PORT = process.env.PORT || 3000;

initQueues();

const server = app.listen(PORT, () => {
    console.log(`[API Process] HTTP server running on port ${PORT}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Ensures the port is released cleanly on Ctrl+C or process.kill,
// preventing EADDRINUSE on the next restart.
function shutdown(signal) {
    console.log(`\n[API Process] Received ${signal}. Closing HTTP server...`);
    server.close(() => {
        console.log('[API Process] HTTP server closed. Exiting.');
        process.exit(0);
    });

    // Force-exit after 5s if connections are still open (e.g. keep-alive)
    setTimeout(() => {
        console.error('[API Process] Forced exit after timeout.');
        process.exit(1);
    }, 5000).unref(); // .unref() so this timer doesn't keep the event loop alive
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
