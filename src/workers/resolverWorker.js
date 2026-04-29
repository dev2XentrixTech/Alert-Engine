const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const { addJob } = require('../queues/queueManager');
const { resolveEmployees } = require('../services/employeeResolver');
const { enqueueLog } = require('../utils/logger');
const { sequentialNext } = require('../utils/sequentialNext');
const { channelRetry } = require('../utils/retryPolicy');
const { ALERT_TYPE, CHANNEL, ALERT_FLOW } = require('../config/constants');
const Q = require('../config/queueNames');
const db = require('../db/connection');

const CHANNEL_QUEUE_MAP = {
  [CHANNEL.EMAIL]:    Q.CHANNEL_EMAIL,
  [CHANNEL.SMS]:      Q.CHANNEL_SMS,
  [CHANNEL.WHATSAPP]: Q.CHANNEL_WHATSAPP,
  [CHANNEL.VOICE]:    Q.CHANNEL_VOICE,
  [CHANNEL.PUSH]:     Q.CHANNEL_PUSH,
};

const resolveUniqueEmployees = async (grp_ids_str, emp_ids_str) => {
  const empIdSet = new Set();

  if (grp_ids_str) {
      const grpIds = grp_ids_str.split(',').map(s => parseInt(s.trim())).filter(Boolean);
      if (grpIds.length) {
          const placeholders = grpIds.map(() => '?').join(',');
          const [groups] = await db.execute(
              `SELECT emp_ids FROM manage_group WHERE id IN (${placeholders})`,
              grpIds
          );
          for (const group of groups) {
              if (!group.emp_ids) continue;
              group.emp_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean).forEach(id => empIdSet.add(id));
          }
      }
  }

  if (emp_ids_str) {
      emp_ids_str.split(',').map(s => parseInt(s.trim())).filter(Boolean).forEach(id => empIdSet.add(id));
  }

  if (!empIdSet.size) return [];

  const ids = [...empIdSet];
  const placeholders = ids.map(() => '?').join(',');
  const [employees] = await db.execute(
      `SELECT id, emp_id, full_name, 
              official_email_id, official_contact_no, official_contact_cc,
              personal_email_id, personal_contact_no, personal_contact_cc,
              emergency_email_id, emergency_contact_no, emergency_contact_cc
      FROM employee_master WHERE id IN (${placeholders})`,
      ids
  );

  return employees;
};

function _resolveChannelContacts(emp, deviceTriggers) {
  const result = {};
  for (const [channel, flags] of Object.entries(deviceTriggers)) {

    result[channel] = []; 

    if (channel === CHANNEL.EMAIL) {
      if (flags.official  && emp.official_email_id) {
        result[channel].push({ type: 'official', value: emp.official_email_id });
      }
      if (flags.personal  && emp.personal_email_id) {
        result[channel].push({ type: 'personal', value: emp.personal_email_id });
      }
      if (flags.emergency && emp.emergency_email_id) {
        result[channel].push({ type: 'emergency', value: emp.emergency_email_id });
      }
    }

    if ([CHANNEL.SMS, CHANNEL.WHATSAPP, CHANNEL.VOICE].includes(channel)) {

      if (flags.official && emp.official_contact_no) {
        result[channel].push({
          type: 'official',
          number: emp.official_contact_no,
          cc: emp.official_contact_cc
        });
      }

      if (flags.personal && emp.personal_contact_no) {
        result[channel].push({
          type: 'personal',
          number: emp.personal_contact_no,
          cc: emp.personal_contact_cc
        });
      }

      if (flags.emergency && emp.emergency_contact_no) {
        result[channel].push({
          type: 'emergency',
          number: emp.emergency_contact_no,
          cc: emp.emergency_contact_cc
        });
      }
    }

    if (channel === CHANNEL.PUSH && emp.push_token) {
      result[channel].push({
        token: emp.push_token,
        platform: emp.platform
      });
    }
  }

  return result;

}

async function enqueueNextSequentialChannel(job) {
  const { basePayload, channelOrder, channelContacts, template, channelIndex } = job.data;
  await _enqueueNextChannel(basePayload, channelOrder, channelContacts, template, channelIndex + 1);
}

async function _enqueueNextChannel(basePayload, channelOrder, channelContacts, template, startIndex) {
  
  for (let i = startIndex; i < channelOrder.length; i++) {
    const ch = channelOrder[i];
    if (channelContacts[ch] !== null) {
      await addJob(
        CHANNEL_QUEUE_MAP[ch],
        {
          ..._buildChannelPayload(basePayload, ch, template, channelContacts[ch]),
          // Pass these so the channel worker can trigger the next step
          _sequential: true,
          _channelOrder:    channelOrder,
          _channelContacts: channelContacts,
          _channelIndex:    i,
          _template:        template,
          _basePayload:     basePayload,
        },
        channelRetry
      );
      return; // only enqueue one at a time
    }
  }
  // All channels exhausted — log or mark trigger complete
  console.log(`[sequential] All channels exhausted for emp ${basePayload.emp_id}, trigger ${basePayload.triggerId}`);
}

function _buildChannelPayload(basePayload, channel, template, contact) {
  const common = { ...basePayload, contact };

  switch (channel) {
    case CHANNEL.EMAIL:
      return {
        ...common,
        email_subject: template.email_subject,
        email_body:    template.email_body,
      };

    case CHANNEL.SMS:
      return {
        ...common,
        sms_text: template.sms_text,
      };

    case CHANNEL.WHATSAPP:
      return {
        ...common,
        whatsapp_text: template.whatsapp_text,
      };

    case CHANNEL.VOICE:
      return {
        ...common,
        voice_call_text:  template.voice_call_text,
        voice_call_audio: template.voice_call_audio,
      };

    case CHANNEL.PUSH:
      return {
        ...common,
        push_message: template.app_push_msg,
        push_token:   contact.token,
        platform:     contact.platform,
      };

    default:
      return common;
  }
}

async function resolverHandler(job) {
  const { triggerId, templateId, userId } = job.data;

  const [rows] = await db.execute(
    `SELECT * FROM alert_template WHERE id = ? LIMIT 1`,
    [templateId]
  );

  if (!rows.length) throw new Error(`Template ${templateId} not found for trigger ${triggerId}`);
  
  const template = rows[0];
  template.device_triggers =
    typeof template.device_triggers === 'string'
      ? JSON.parse(template.device_triggers)
      : template.device_triggers;

  const employees = await resolveUniqueEmployees(template.grp_ids, template.emp_ids);

  const deviceTriggers = template.device_triggers;   
  const channelOrder   = Object.keys(deviceTriggers); 
  const alertType      = template.alert_type;         
  const alertFlowType  = template.alert_flow_type;    
  const isTwoWay       = alertFlowType === ALERT_FLOW.TWO_WAY;

  for (const emp of employees) {
      
      const channelContacts = _resolveChannelContacts(emp, deviceTriggers);

      const basePayload = {
        triggerId,
        templateId,
        emp_id:       emp.id,
        alertFlowType,
        isTwoWay,
        ...(isTwoWay && {
          num_options:    template.num_options,
          option_1_text:  template.option_1_text,
          option_2_text:  template.option_2_text,
          option_3_text:  template.option_3_text,
        }),
      };
      
      if (alertType === ALERT_TYPE.ALL_IN) {
        const jobs = channelOrder
          .filter(ch => channelContacts[ch] && channelContacts[ch].length > 0) 
          .map(ch =>
            addJob(
              CHANNEL_QUEUE_MAP[ch],
              _buildChannelPayload(basePayload, ch, template, channelContacts[ch]),
              channelRetry
            )
          );
   
        // await Promise.allSettled(jobs);
   
      } else {
        await _enqueueNextChannel(basePayload, channelOrder, channelContacts, template, 0);
      }
  }

  // await enqueueLog({
  //   type:           'trigger',
  //   trigger_id,
  //   template_id,
  //   employee_count: employees.length,
  //   channel:        'system',
  // });
}

new Worker(Q.ALERT_DISPATCH, resolverHandler, {
  connection:  redisConnection,
  concurrency: 1,
});
