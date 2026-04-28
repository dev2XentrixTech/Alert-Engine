const { sendSms } = require('../../services/vonage/smsService');
const { enqueueLog } = require('../../utils/logger');
const { sequentialNext } = require('../../utils/sequentialNext');

async function smsHandler(job) {
  const { emp_id, trigger_id, email_body, emergency_contact, sequential } = job.data;

  await sendSms({ to: emergency_contact, text: email_body });

  await enqueueLog({ channel: 'sms', type: 'sent', status: 'success', emp_id, trigger_id });

  // For SMS sequential flow, next channel is triggered via delivery receipt in responseWorker
  // Only advance here if not waiting for delivery confirmation
  if (sequential && process.env.SMS_SEQUENTIAL_ON_RECEIPT !== 'true') {
    await sequentialNext(job.data);
  }
}

module.exports = { smsHandler };
