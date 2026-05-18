const { sendEmail } = require('../../services/emailService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function emailHandler(job) {
  const { contact_value, email_subject, email_body } = job.data;
  
//   console.log(job.data);

  try {
      const [success, errorOrInfo] = await sendEmail(contact_value, email_subject, email_body);
      console.log('success', success);
      console.log('errorOrInfo', errorOrInfo);
      
      if (!success) {
          throw errorOrInfo || new Error('Failed to send email');
      }

      await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, errorOrInfo?.messageId, errorOrInfo, null);
  } catch (error) {
      logger.error('[EmailWorker] Failed to send', { error: error.message });
      await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
  }
}

module.exports = { emailHandler };
