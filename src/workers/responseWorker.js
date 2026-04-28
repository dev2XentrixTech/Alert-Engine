const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const { enqueueLog } = require('../utils/logger');
const { sequentialNext } = require('../utils/sequentialNext');
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

  // If sequential and delivery confirmed, advance to next channel
  const delivered = status === 'delivered' || status === 'answered';
  if (sequential && delivered && channelOrder && channelIndex !== undefined) {
    await sequentialNext({ channelOrder, channelIndex, trigger_id, emp_id });
  }
}

new Worker(Q.RESPONSE_INBOUND, responseHandler, {
  connection:  redisConnection,
  concurrency: 50,
});
