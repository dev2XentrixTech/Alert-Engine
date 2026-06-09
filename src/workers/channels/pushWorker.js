const { sendPush } = require('../../services/pushService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { QUEUE_STATUS } = require('../../config/constants');
const db = require('../../db/connection');
const logger = require('../../utils/winstonLogger');

async function pushHandler(job) {
  const { emp_id, triggerId, push_token, platform, email_subject, push_message, dispatch_log_id } = job.data;

  try {
      const result = await sendPush({ device_token: push_token, platform, title: email_subject, body: push_message });
      const messageId = result?.messageId || null;
      
      await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCHED, messageId, result, null);

      // Log into app_notification for the inbox
      await db.execute(
          `INSERT INTO app_notification (trigger_id, emp_id, title, message, dispatch_log_id) 
           VALUES (?, ?, ?, ?, ?)`,
          [triggerId, emp_id, email_subject, push_message, dispatch_log_id || null]
      );

  } catch (error) {
      logger.error('[PushWorker] Failed to send push', { error: error.message });
      await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCH_FAILED, null, null, error.message);
  }
}

module.exports = { pushHandler };
