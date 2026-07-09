const Q = require('./queueNames');

const CHANNEL_CONFIG = {
  [Q.CHANNEL_EMAIL]: {
    // dlq:         Q.DLQ_EMAIL,
    concurrency: 3,
    limiter:     { max: 50,  duration: 1000 },
  },
  [Q.CHANNEL_SMS]: {
    // dlq:         Q.DLQ_SMS,
    concurrency: 1,
    limiter:     { max: 50, duration: 1000 },
  },
  [Q.CHANNEL_WHATSAPP]: {
    // dlq:         Q.DLQ_WHATSAPP,
    concurrency: 1,
    limiter:     { max: 1, duration: 3000 },
  },
  [Q.CHANNEL_VOICE]: {
    // dlq:         Q.DLQ_VOICE,
    concurrency: 1,
    limiter:     { max: 30,  duration: 60000 },
  },
  // [Q.CHANNEL_PUSH]: {
  //   // dlq:         Q.DLQ_PUSH,
  //   concurrency: 1,
  //   limiter:     { max: 500, duration: 1000 },
  // },
  [Q.LOG_WRITE]: {
    concurrency: 5,
    limiter:     { max: 100, duration: 5000 },
  },
};

module.exports = { CHANNEL_CONFIG };
