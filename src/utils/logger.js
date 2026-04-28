const { addJob } = require('../queues/queueManager');
const Q = require('../config/queueNames');
const { logRetry } = require('./retryPolicy');

async function enqueueLog(payload) {
  return addJob(Q.LOG_WRITE, { ...payload, ts: Date.now() }, logRetry);
}

module.exports = { enqueueLog };
