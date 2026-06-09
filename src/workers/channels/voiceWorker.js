const { makeOneWayCall, makeTwoWayCall } = require('../../services/vonage/voiceService');
const { handleWorkerCompletion }         = require('../../utils/workerCompletion');
const { QUEUE_STATUS }                = require('../../config/constants');
const logger                             = require('../../utils/winstonLogger');
const { v4: uuidv4 }                     = require('uuid');

async function voiceHandler(job) {
    const {
        contact_value, voice_call_text, voice_call_audio,
        isTwoWay, triggerId, emp_id, dispatch_log_id,
        num_options, option_1_text, option_2_text, option_3_text,
    } = job.data;

    try {
        let result;

        if (isTwoWay) {
            // Generate a correlation UUID so the DTMF webhook can identify
            // which trigger + employee this call belongs to.
            const callUuid = `${triggerId}-${emp_id}-${uuidv4()}`;

            result = await makeTwoWayCall({
                to:         contact_value,
                callUuid,
                ivrContext: {
                    text:           voice_call_text,
                    audio_url:      voice_call_audio || '',
                    num_options:    num_options   || 2,
                    option_1_text:  option_1_text || '',
                    option_2_text:  option_2_text || '',
                    option_3_text:  option_3_text || '',
                },
            });
        } else {
            result = await makeOneWayCall({ to: contact_value, text: voice_call_text, audioUrl: voice_call_audio || '' });
        }

        logger.info(`[Voice Call Response] ${result}.`);
        
        const callId = result?.uuid || null;
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCHED, callId, result, null);

    } catch (error) {
        logger.error('[VoiceWorker] Failed to place call', { error: error.message, err: error });
        await handleWorkerCompletion(job, QUEUE_STATUS.DISPATCH_FAILED, null, null, error.message);
    }
}

module.exports = { voiceHandler };
