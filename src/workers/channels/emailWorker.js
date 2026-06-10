const { sendEmail } = require('../../services/emailService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { buildTwoWayEmail } = require('../../utils/buildTwoWayMessage');
const { QUEUE_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function emailHandler(job) {
    const { contact_value, email_subject, email_body, isTwoWay } = job.data;

    let subject = email_subject;
    let body    = email_body;

    if (isTwoWay) {

        const enriched = buildTwoWayEmail(subject, body, {
            ...job.data,
            triggerId: job.data.triggerId,
            emp_id:    job.data.emp_id,
        });

        console.log('enriched',enriched)

        subject = enriched.subject;
        body    = enriched.body;
    }

    try {
        const [success, errorOrInfo] = await sendEmail(contact_value, subject, body);
        if (!success) throw errorOrInfo || new Error('Failed to send email');

        logger.info(`[Email Worker Response] ${[success, errorOrInfo]}.`);
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCHED, errorOrInfo?.messageId, errorOrInfo, null);
    } catch (error) {
        logger.error('[EmailWorker] Failed to send', { error: error.message });
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCH_FAILED, null, null, error.message);
        throw error;
    }
}

module.exports = { emailHandler };
