const { Queue } = require('bullmq');
const { redisConnection } = require('./redisConnection');
const { CHANNEL_CONFIG } = require('../config/channelConfig');
const Q = require('../config/queueNames');

const queues = {};

// const DLQ_DEFAULTS = {
//   defaultJobOptions: { removeOnFail: { count: 500 }, removeOnComplete: true },
// };

function initQueues() {
  for (const [name, cfg] of Object.entries(CHANNEL_CONFIG)) {
    queues[name]    = new Queue(name,    { connection: redisConnection });
    // queues[cfg.dlq] = new Queue(cfg.dlq, { connection: redisConnection, ...DLQ_DEFAULTS });
  }

  // LOG_WRITE is initialised via CHANNEL_CONFIG loop above.
  // Only RESPONSE_INBOUND is not in CHANNEL_CONFIG, so it needs its own entry.
  for (const name of [Q.RESPONSE_INBOUND]) {
    queues[name] = new Queue(name, { connection: redisConnection });
  }

  return queues;
}

function getQueue(name) {
  if (!queues[name]) throw new Error(`Queue "${name}" not initialised`);
  return queues[name];
}

module.exports = { initQueues, getQueue };
