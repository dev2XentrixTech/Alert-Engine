const { sendSms } = require('../../services/vonage/smsService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { buildTwoWaySmsText } = require('../../utils/buildTwoWayMessage');
const { QUEUE_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function smsHandler(job) {
    const { contact_value, sms_text, isTwoWay } = job.data;

    const text = isTwoWay ? buildTwoWaySmsText(sms_text, job.data) : sms_text;

    try {
        const result = await sendSms({ to: contact_value, text });
        const messageId = result?.messageUUID || result?.message_uuid || null;
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCHED, messageId, result, null);
    } catch (error) {
        logger.error('[SmsWorker] Failed to send', { error: error.message });
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCH_FAILED, null, null, error.message);
        throw error;
    }
}

module.exports = { smsHandler };
