const { makeVoiceCall } = require('../../services/vonage/voiceService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { buildTwoWayVoiceText } = require('../../utils/buildTwoWayMessage');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function voiceHandler(job) {
    const { contact_value, voice_call_text, isTwoWay } = job.data;

    const text = isTwoWay ? buildTwoWayVoiceText(voice_call_text, job.data) : voice_call_text;

    try {
        const result = await makeVoiceCall({ to: contact_value, text });
        const callId = result?.uuid || null;
        await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, callId, result, null);
    } catch (error) {
        logger.error('[VoiceWorker] Failed to place call', { error: error.message });
        await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
    }
}

module.exports = { voiceHandler };
