const { addJob } = require('../queues/queueManager');
const { channelRetry } = require('./retryPolicy');

const CHANNEL_QUEUE_MAP = require('../config/queueNames');

const channelToQueue = {
  email:    CHANNEL_QUEUE_MAP.CHANNEL_EMAIL,
  sms:      CHANNEL_QUEUE_MAP.CHANNEL_SMS,
  whatsapp: CHANNEL_QUEUE_MAP.CHANNEL_WHATSAPP,
  voice:    CHANNEL_QUEUE_MAP.CHANNEL_VOICE,
  push:     CHANNEL_QUEUE_MAP.CHANNEL_PUSH,
};

async function sequentialNext(jobData) {
  const { channelOrder, channelIndex } = jobData;
  const nextIndex = channelIndex + 1;

  if (!channelOrder || nextIndex >= channelOrder.length) return; 

  const nextChannel = channelOrder[nextIndex];
  const queueName   = channelToQueue[nextChannel];
  if (!queueName) throw new Error(`Unknown channel: ${nextChannel}`);

  await addJob(queueName, { ...jobData, channelIndex: nextIndex }, channelRetry);
}

module.exports = { sequentialNext };
