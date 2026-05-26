require('dotenv').config();

const redisConnection = {
  host:     process.env.REDIS_HOST     || '127.0.0.1',
  port:     parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,   // omit entirely if no password
  db:       parseInt(process.env.REDIS_DB)   || 0,
};

module.exports = { redisConnection };
