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

async function whatsappWorker(job) {
  const { contact, whatsapp_text, isTwoWay, num_options, option_1_text } = job.data;

  // --- send the whatsapp message ---
  await sendWhatsApp({
    to:      `${contact.cc}${contact.number}`,
    message: whatsapp_text,
    ...(isTwoWay && { options: [option_1_text, option_2_text, option_3_text].slice(0, num_options) }),
  });

  // --- if sequential, enqueue the next channel ---
  if (job.data._sequential) {
    await enqueueNextSequentialChannel({ data: job.data });
  }
}

module.exports = { whatsappHandler };
