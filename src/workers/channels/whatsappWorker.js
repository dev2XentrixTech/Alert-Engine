const { sendOneWayWhatsapp, sendTwoWayWhatsapp } = require('../../services/vonage/whatsappService');
const { handleWorkerCompletion }                 = require('../../utils/workerCompletion');
const { DISPATCH_STATUS }                        = require('../../config/constants');
const logger                                     = require('../../utils/winstonLogger');

async function whatsappHandler(job) {
    const {
        contact_value, whatsapp_text, isTwoWay,
        num_options, option_1_text, option_2_text, option_3_text,
    } = job.data;

    try {
        let result;

        if (isTwoWay) {
            result = await sendTwoWayWhatsapp({
                to:   contact_value,
                text: whatsapp_text,
                ivrContext: {
                    num_options:   num_options   || 2,
                    option_1_text: option_1_text || '',
                    option_2_text: option_2_text || '',
                    option_3_text: option_3_text || '',
                },
            });
        } else {
            result = await sendOneWayWhatsapp({ to: contact_value, text: whatsapp_text });
        }

        logger.info(`[Whatsapp Response] ${result}.`);
        // Vonage returns { messageUUID } from WhatsAppText send
        const messageId = result?.messageUUID || result?.message_uuid || null;
        await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, messageId, result, null);

    } catch (error) {
        logger.error('[WhatsappWorker] Failed to send', { error: error.message });
        await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
    }
}

module.exports = { whatsappHandler };
