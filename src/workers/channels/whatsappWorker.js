const { sendWhatsapp } = require('../../services/vonage/whatsappService');
const { enqueueLog } = require('../../utils/logger');
const { sequentialNext } = require('../../utils/sequentialNext');

async function whatsappHandler(job) {
  const { emp_id, trigger_id, email_body, emergency_contact, sequential } = job.data;

  await sendWhatsapp({ to: emergency_contact, text: email_body });

  await enqueueLog({ channel: 'whatsapp', type: 'sent', status: 'success', emp_id, trigger_id });

  if (sequential && process.env.WHATSAPP_SEQUENTIAL_ON_RECEIPT !== 'true') {
    await sequentialNext(job.data);
  }
}

module.exports = { whatsappHandler };
