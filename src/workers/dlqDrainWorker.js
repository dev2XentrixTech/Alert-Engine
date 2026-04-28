const { CHANNEL_CONFIG } = require('../config/channelConfig');
const { getQueue } = require('../queues/queueFactory');
const pool = require('../db/connection');

const DRAIN_INTERVAL_MS = 10 * 60 * 1000; 

async function drainDlqs() {
  for (const cfg of Object.values(CHANNEL_CONFIG)) {
    try {
      const dlqQueue = getQueue(cfg.dlq);
      const jobs     = await dlqQueue.getJobs(['failed', 'waiting', 'completed']);

      if (!jobs.length) continue;

      const values = jobs.map(j => [
        j.data.trigger_id    || null,
        j.data.emp_id        || null,
        j.data.channel       || cfg.dlq,
        j.data.error_message || null,
      ]);

      const placeholders = values.map(() => '(?,?,?,?)').join(',');
      await pool.query(
        `INSERT IGNORE INTO log_failed (trigger_id, emp_id, channel, error_message) VALUES ${placeholders}`,
        values.flat()
      );

      await Promise.all(jobs.map(j => j.remove()));

      console.log(`[dlqDrain] Drained ${jobs.length} jobs from ${cfg.dlq}`);
    } catch (err) {
      console.error(`[dlqDrain] Error draining ${cfg.dlq}:`, err.message);
    }
  }
}

setInterval(drainDlqs, DRAIN_INTERVAL_MS);
// Run once on startup to clear any leftover DLQ entries
drainDlqs();
