const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const { logRetry } = require('../utils/retryPolicy');
const { LOG_TABLE } = require('../config/constants');
const Q = require('../config/queueNames');
const pool = require('../db/connection');

let buffer = [];
const FLUSH_INTERVAL_MS = 500;
const FLUSH_BATCH_SIZE  = 100;

async function flush() {
  if (!buffer.length) return;
  const batch = buffer.splice(0, buffer.length);

  // Group by table
  const groups = {};
  for (const entry of batch) {
    const table = entry.type === 'trigger'
      ? LOG_TABLE.trigger
      : LOG_TABLE[entry.channel] || LOG_TABLE.trigger;

    if (!groups[table]) groups[table] = [];
    groups[table].push(entry);
  }

  await Promise.all(
    Object.entries(groups).map(([table, rows]) => {
      const cols   = ['trigger_id', 'emp_id', 'status', 'error_message', 'channel', 'created_at'];
      const values = rows.map(r => [
        r.trigger_id   || null,
        r.emp_id       || null,
        r.status       || 'sent',
        r.error_message|| null,
        r.channel      || 'system',
        new Date(r.ts  || Date.now()),
      ]);
      const placeholders = values.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
      const flat = values.flat();
      return pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders}`, flat);
    })
  );
}

setInterval(flush, FLUSH_INTERVAL_MS);

async function logHandler(job) {
  buffer.push(job.data);
  if (buffer.length >= FLUSH_BATCH_SIZE) await flush();
}

new Worker(Q.LOG_WRITE, logHandler, {
  connection:  redisConnection,
  concurrency: 2,
});
