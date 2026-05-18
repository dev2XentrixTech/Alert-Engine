const { makeVoiceCall } = require('../../services/vonage/voiceService');
const { handleWorkerCompletion } = require('../../utils/workerCompletion');
const { DISPATCH_STATUS } = require('../../config/constants');
const logger = require('../../utils/winstonLogger');

async function voiceHandler(job) {
  const { contact_value, voice_call_text } = job.data;

  try {
      const result = await makeVoiceCall({ to: contact_value, text: voice_call_text });
      const callId = result?.uuid || null;
      await handleWorkerCompletion(job, DISPATCH_STATUS.SENT, callId, result, null);
  } catch (error) {
      logger.error('[VoiceWorker] Failed to place call', { error: error.message });
      await handleWorkerCompletion(job, DISPATCH_STATUS.FAILED, null, null, error.message);
  }
}

module.exports = { voiceHandler };
