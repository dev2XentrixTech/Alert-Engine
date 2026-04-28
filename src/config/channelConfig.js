const Q = require('./queueNames');

// Each entry: { queueName, dlqName, concurrency, limiter }
// Retry policy lives in src/utils/retryPolicy.js
const CHANNEL_CONFIG = {
  [Q.CHANNEL_EMAIL]: {
    dlq:         Q.DLQ_EMAIL,
    concurrency: 10,
    limiter:     { max: 50,  duration: 1000 },
  },
  [Q.CHANNEL_SMS]: {
    dlq:         Q.DLQ_SMS,
    concurrency: 20,
    limiter:     { max: 200, duration: 1000 },
  },
  [Q.CHANNEL_WHATSAPP]: {
    dlq:         Q.DLQ_WHATSAPP,
    concurrency: 15,
    limiter:     { max: 100, duration: 1000 },
  },
  [Q.CHANNEL_VOICE]: {
    dlq:         Q.DLQ_VOICE,
    concurrency: 5,
    limiter:     { max: 30,  duration: 1000 },
  },
  [Q.CHANNEL_PUSH]: {
    dlq:         Q.DLQ_PUSH,
    concurrency: 50,
    limiter:     { max: 500, duration: 1000 },
  },
};

module.exports = { CHANNEL_CONFIG };
