const { sendPush } = require('../../services/pushService');
const { enqueueLog } = require('../../utils/logger');
const { sequentialNext } = require('../../utils/sequentialNext');

async function pushHandler(job) {
  const { emp_id, trigger_id, email_subject, email_body, push_token, platform, sequential } = job.data;

  await sendPush({ device_token: push_token, platform, title: email_subject, body: email_body });

  await enqueueLog({ channel: 'push', type: 'sent', status: 'success', emp_id, trigger_id });

  if (sequential) await sequentialNext(job.data);
}

module.exports = { pushHandler };
