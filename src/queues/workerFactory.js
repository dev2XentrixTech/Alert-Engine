const { Worker } = require('bullmq');
const { redisConnection } = require('./redisConnection');
const { CHANNEL_CONFIG } = require('../config/channelConfig');
const logger = require('../utils/winstonLogger');
const Q = require('../config/queueNames');

const handlers = {
  [Q.CHANNEL_EMAIL]:    require('../workers/channels/emailWorker').emailHandler,
  [Q.CHANNEL_SMS]:      require('../workers/channels/smsWorker').smsHandler,
  [Q.CHANNEL_WHATSAPP]: require('../workers/channels/whatsappWorker').whatsappHandler,
  [Q.CHANNEL_VOICE]:    require('../workers/channels/voiceWorker').voiceHandler,
  // [Q.CHANNEL_PUSH]:     require('../workers/channels/pushWorker').pushHandler,
  [Q.LOG_WRITE]:        require('../workers/logWriteWorker').logWriteHandler,
};

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
        
        const attemptsLeft = (job.opts?.attempts ?? 1) - job.attemptsMade;
        if (attemptsLeft > 0) {
          logger.warn(`[${name}] Job ${job.id} failed on attempt ${job.attemptsMade}. Will retry in 10s. Retries remaining: ${attemptsLeft}`, { error: err.message });
        } else {
          logger.error(`[${name}] Job ${job.id} permanently failed after all ${job.attemptsMade} attempts`, { error: err.message });
        }
      }
    });

    worker.on('active', (job) => {
      if (job.attemptsMade > 0) {
        logger.warn(`[${name}] RETRYING Job ${job.id} (Attempt #${job.attemptsMade + 1}/${job.opts?.attempts ?? 1})`);
      } else {
        logger.info(`[${name}] Processing job ${job.id}`);
      }
    });

    worker.on('completed', (job, result) => {
      logger.info(`[${name}] Completed job ${job.id}`);
    });

    worker.on('error', (err) => {
      logger.error(`[${name}] Worker system error`, { error: err.message, stack: err.stack });
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`[${name}] Job stalled: ${jobId}`);
    });

    activeWorkers.push(worker);
  }

  require('../workers/responseWorker');

  console.log('[workerFactory] All workers started.');
}


async function stopAllWorkers() {
  await Promise.all(activeWorkers.map(w => w.close()));
}

module.exports = { startAllWorkers, stopAllWorkers };
