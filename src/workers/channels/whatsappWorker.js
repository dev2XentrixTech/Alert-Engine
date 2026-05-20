const { sendWhatsapp } = require('../../services/vonage/whatsappService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { buildTwoWayWhatsappText } = require('../../utils/buildTwoWayMessage');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function whatsappHandler(job) {
    const { contact_value, whatsapp_text, isTwoWay } = job.data;

    const text = isTwoWay ? buildTwoWayWhatsappText(whatsapp_text, job.data) : whatsapp_text;

    try {
        const result = await sendWhatsapp({ to: contact_value, text });
        const messageId = result?.message_uuid || result?.messages?.[0]?.['message-id'] || null;
        await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, messageId, result, null);
    } catch (error) {
        logger.error('[WhatsappWorker] Failed to send', { error: error.message });
        await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
    }
}

module.exports = { whatsappHandler };
