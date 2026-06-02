const channelRetry = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 2000 },
};


module.exports = { channelRetry };
