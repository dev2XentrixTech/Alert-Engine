const { Worker } = require('bullmq');
const { redisConnection } = require('./redisConnection');
const { CHANNEL_CONFIG } = require('../config/channelConfig');
const { getQueue } = require('./queueFactory');
const { channelRetry } = require('../utils/retryPolicy');
const Q = require('../config/queueNames');

const handlers = {
  [Q.CHANNEL_EMAIL]:    require('../workers/channels/emailWorker').emailHandler,
  [Q.CHANNEL_SMS]:      require('../workers/channels/smsWorker').smsHandler,
  [Q.CHANNEL_WHATSAPP]: require('../workers/channels/whatsappWorker').whatsappHandler,
  [Q.CHANNEL_VOICE]:    require('../workers/channels/voiceWorker').voiceHandler,
  // [Q.CHANNEL_PUSH]:     require('../workers/channels/pushWorker').pushHandler,
  [Q.LOG_WRITE]:        require('../workers/logWriteWorker').logWriteHandler,
};

// Track all active workers so we can shut them down gracefully
const activeWorkers = [];

function startAllWorkers() {
  for (const [name, cfg] of Object.entries(CHANNEL_CONFIG)) {
    const worker = new Worker(name, handlers[name], {
      connection:  redisConnection,
      concurrency: cfg.concurrency,
      limiter:     cfg.limiter,
    });

    worker.on('failed', async (job, err) => {
      if (job) {
        const logger = require('../utils/winstonLogger');
        logger.error(`[${name}] Job ${job.id} failed after ${job.attemptsMade} attempts`, { error: err.message });
      }
    });

    worker.on('active', (job) => {
      console.log(`[${name}] Processing job ${job.id}`);
    });

    worker.on('completed', (job, result) => {
      console.log(`[${name}] Completed job ${job.id}`);
    });

    worker.on('error', (err) => {
      console.error(`[${name}] Worker error:`, err);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`[${name}] Job stalled: ${jobId}`);
    });

    activeWorkers.push(worker);
  }

  // Start the inbound response worker
  require('../workers/responseWorker');

  console.log('[workerFactory] All workers started.');
}

/**
 * Gracefully close all workers.
 * Lets in-flight jobs finish before disconnecting from Redis.
 */
async function stopAllWorkers() {
  await Promise.all(activeWorkers.map(w => w.close()));
}

module.exports = { startAllWorkers, stopAllWorkers };
