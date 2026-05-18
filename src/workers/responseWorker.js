const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const { enqueueLog } = require('../utils/logger');

const Q = require('../config/queueNames');

async function responseHandler(job) {
  const { emp_id, trigger_id, message, channel, status, sequential, channelOrder, channelIndex } = job.data;

  await enqueueLog({
    channel,
    type:         'response',
    status:       status || 'received',
    emp_id,
    trigger_id,
    message_text: message,
    sequential:   sequential ? 1 : 0,
  });
}

new Worker(Q.RESPONSE_INBOUND, responseHandler, {
  connection:  redisConnection,
  concurrency: 50,
});

