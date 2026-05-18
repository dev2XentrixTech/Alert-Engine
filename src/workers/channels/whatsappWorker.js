const { sendWhatsapp } = require('../../services/vonage/whatsappService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function whatsappHandler(job) {
  const { contact_value, whatsapp_text, isTwoWay, num_options, option_1_text, option_2_text, option_3_text } = job.data;

  try {
      const options = isTwoWay ? [option_1_text, option_2_text, option_3_text].slice(0, num_options) : [];
      const result = await sendWhatsapp({ to: contact_value, text: whatsapp_text, options });
      
      const messageId = result?.message_uuid || result?.messages?.[0]?.['message-id'] || null;
      await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, messageId, result, null);
  } catch (error) {
      logger.error('[WhatsappWorker] Failed to send', { error: error.message });
      await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
  }
}

module.exports = { whatsappHandler };
