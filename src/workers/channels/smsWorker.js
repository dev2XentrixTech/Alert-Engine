const { sendSms } = require('../../services/vonage/smsService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function smsHandler(job) {
  const { contact_value, sms_text } = job.data;

  try {
      const result = await sendSms({ to: contact_value, text: sms_text });
      const messageId = result?.messages?.[0]?.['message-id'] || null;
      await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, messageId, result, null);
  } catch (error) {
      logger.error('[SmsWorker] Failed to send', { error: error.message });
      await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
  }
}

module.exports = { smsHandler };
