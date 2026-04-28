const { makeVoiceCall } = require('../../services/vonage/voiceService');
const { enqueueLog } = require('../../utils/logger');
const { sequentialNext } = require('../../utils/sequentialNext');

async function voiceHandler(job) {
  const { emp_id, trigger_id, email_body, emergency_contact, sequential } = job.data;

  await makeVoiceCall({ to: emergency_contact, text: email_body });

  await enqueueLog({ channel: 'voice', type: 'sent', status: 'success', emp_id, trigger_id });

  // Voice sequential advancement happens via call-status webhook in responseWorker
  if (sequential && process.env.VOICE_SEQUENTIAL_ON_RECEIPT !== 'true') {
    await sequentialNext(job.data);
  }
}

module.exports = { voiceHandler };
