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
  [Q.CHANNEL_PUSH]:     require('../workers/channels/pushWorker').pushHandler,
};

function startAllWorkers() {
  for (const [name, cfg] of Object.entries(CHANNEL_CONFIG)) {
    const worker = new Worker(name, handlers[name], {
      connection:  redisConnection,
      concurrency: cfg.concurrency,
      limiter:     cfg.limiter,
    });

    worker.on('failed', async (job, err) => {
      if (job && job.attemptsMade >= channelRetry.attempts) {
        await getQueue(cfg.dlq).add('failed', {
          trigger_id:    job.data.trigger_id,
          emp_id:        job.data.emp_id,
          channel:       name,
          error_message: err.message,
        });
      }
    });
  }

  require('../workers/resolverWorker');
  require('../workers/logWorker');
  require('../workers/responseWorker');
  require('../workers/dlqDrainWorker');

  console.log('[workerFactory] All workers started');
}

module.exports = { startAllWorkers };
