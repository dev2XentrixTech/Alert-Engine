require('dotenv').config();

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

module.exports = { redisConnection };
