const { getQueue } = require('./queueFactory');

async function addJob(queueName, data, opts = {}) {
  return getQueue(queueName).add(queueName, data, opts);
}

module.exports = { addJob };
