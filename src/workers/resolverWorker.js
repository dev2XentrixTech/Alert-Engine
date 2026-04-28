const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const { addJob } = require('../queues/queueManager');
const { resolveEmployees } = require('../services/employeeResolver');
const { enqueueLog } = require('../utils/logger');
const { sequentialNext } = require('../utils/sequentialNext');
const { channelRetry } = require('../utils/retryPolicy');
const { ALERT_TYPE, CHANNEL } = require('../config/constants');
const Q = require('../config/queueNames');
const pool = require('../db/connection');

const CHANNEL_QUEUE_MAP = {
  [CHANNEL.EMAIL]:    Q.CHANNEL_EMAIL,
  [CHANNEL.SMS]:      Q.CHANNEL_SMS,
  [CHANNEL.WHATSAPP]: Q.CHANNEL_WHATSAPP,
  [CHANNEL.VOICE]:    Q.CHANNEL_VOICE,
  [CHANNEL.PUSH]:     Q.CHANNEL_PUSH,
};

async function resolverHandler(job) {
  const { template_id, trigger_id } = job.data;

  const [[template]] = await pool.query(
    'SELECT * FROM alert_template WHERE id = ?',
    [template_id]
  );
  if (!template) throw new Error(`Template ${template_id} not found`);

  const employees    = await resolveEmployees(template);
  const channelOrder = JSON.parse(template.device_triggers || '[]'); // e.g. ["sms","voice","email"]
  const alertType    = template.alert_type;

  for (const emp of employees) {
    const basePayload = {
      trigger_id,
      template_id,
      emp_id:        emp.emp_id,
      email_subject: template.subject,
      email_body:    template.body,
      personal_email: emp.personal_email,
      emergency_contact: emp.emergency_contact,
      push_token:    emp.push_token,
      platform:      emp.platform,
      sequential:    alertType === ALERT_TYPE.SEQUENTIAL,
      channelOrder,
      channelIndex:  0,
    };

    if (alertType === ALERT_TYPE.ALL_IN) {
      // Fan out all applicable channels simultaneously
      const jobs = channelOrder
        .filter(ch => _hasChannelData(emp, ch))
        .map(ch => addJob(CHANNEL_QUEUE_MAP[ch], { ...basePayload }, channelRetry));
      await Promise.all(jobs);
    } else {
      // Sequential: enqueue only the first channel
      const firstChannel = channelOrder.find(ch => _hasChannelData(emp, ch));
      if (firstChannel) {
        await addJob(CHANNEL_QUEUE_MAP[firstChannel], basePayload, channelRetry);
      }
    }
  }

  await enqueueLog({
    type:           'trigger',
    trigger_id,
    template_id,
    employee_count: employees.length,
    channel:        'system',
  });
}

function _hasChannelData(emp, channel) {
  if (channel === CHANNEL.EMAIL)    return !!emp.personal_email;
  if (channel === CHANNEL.SMS)      return !!emp.emergency_contact;
  if (channel === CHANNEL.WHATSAPP) return !!emp.emergency_contact;
  if (channel === CHANNEL.VOICE)    return !!emp.emergency_contact;
  if (channel === CHANNEL.PUSH)     return !!emp.push_token;
  return false;
}

new Worker(Q.ALERT_DISPATCH, resolverHandler, {
  connection:  redisConnection,
  concurrency: 5,
});
