const channelRetry = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
};

const logRetry = {
  attempts: 3,
  backoff: { type: 'fixed', delay: 1000 },
};

module.exports = { channelRetry, logRetry };
