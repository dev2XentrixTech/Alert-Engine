const { sendEmail } = require('../../services/emailService');
const { enqueueLog } = require('../../utils/logger');
const { sequentialNext } = require('../../utils/sequentialNext');

async function emailHandler(job) {
  const { emp_id, trigger_id, email_subject, email_body, personal_email, sequential } = job.data;

  await sendEmail({ to: personal_email, subject: email_subject, html: email_body });

  await enqueueLog({ channel: 'email', type: 'sent', status: 'success', emp_id, trigger_id });

  if (sequential) await sequentialNext(job.data);
}

module.exports = { emailHandler };
