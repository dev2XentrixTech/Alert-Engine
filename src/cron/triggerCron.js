const cron = require('node-cron');
const db = require('../db/connection');
const { addJob } = require('../queues/queueManager');
const { ALERT_TYPE, ALERT_FLOW, CHANNEL, triggerStatus, CHANNEL_STR_TO_ID, CONTACT_STR_TO_ID, DISPATCH_STATUS, SEQ_STATUS } = require('../config/constants');
const Q = require('../config/queueNames');
const { channelRetry } = require('../utils/retryPolicy');
const logger = require('../utils/winstonLogger');

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
      const grpIdsStr = String(grp_ids_str);
      const grpIds = grpIdsStr.split(',').map(s => parseInt(s.trim())).filter(Boolean);
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
      const empIdsStr = String(emp_ids_str);
      empIdsStr.split(',').map(s => parseInt(s.trim())).filter(Boolean).forEach(id => empIdSet.add(id));
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

function resolveContactValue(emp, channelStr, contactTypeStr) {
    if (channelStr === CHANNEL.EMAIL) {
        if (contactTypeStr === 'official') return emp.official_email_id;
        if (contactTypeStr === 'personal') return emp.personal_email_id;
        if (contactTypeStr === 'emergency') return emp.emergency_email_id;
    } else if ([CHANNEL.SMS, CHANNEL.WHATSAPP, CHANNEL.VOICE].includes(channelStr)) {
        if (contactTypeStr === 'official') return emp.official_contact_no ? `${emp.official_contact_cc || ''}${emp.official_contact_no}` : null;
        if (contactTypeStr === 'personal') return emp.personal_contact_no ? `${emp.personal_contact_cc || ''}${emp.personal_contact_no}` : null;
        if (contactTypeStr === 'emergency') return emp.emergency_contact_no ? `${emp.emergency_contact_cc || ''}${emp.emergency_contact_no}` : null;
    } else if (channelStr === CHANNEL.PUSH) {
        return emp.push_token;
    }
    return null;
}

function _buildChannelPayload(basePayload, channel, template, contactValue, emp) {
  const common = { ...basePayload, contact_value: contactValue };

  switch (channel) {
    case CHANNEL.EMAIL:
      return { ...common, email_subject: template.email_subject, email_body: template.email_body };
    case CHANNEL.SMS:
      return { ...common, sms_text: template.sms_text };
    case CHANNEL.WHATSAPP:
      return { ...common, whatsapp_text: template.whatsapp_text };
    case CHANNEL.VOICE:
      return { ...common, voice_call_text: template.voice_call_text, voice_call_audio: template.voice_call_audio };
    case CHANNEL.PUSH:
      return { ...common, push_message: template.app_push_msg, push_token: emp.push_token, platform: emp.platform };
    default:
      return common;
  }
}

// (async function recoverStuckTriggers() {
//     try {
//         const [result] = await db.execute(
//             `UPDATE trigger_table SET status = ${triggerStatus.FAILED} WHERE status = ${triggerStatus.PROCESSING}`
//         );
//         if (result.affectedRows > 0) {
//             logger.warn(`[Startup] Found ${result.affectedRows} triggers stuck in PROCESSING state due to a crash. Marked them as FAILED to prevent duplicate dispatching.`);
//         }
//     } catch (err) {
//         logger.error('[Startup] Failed to run trigger recovery:', { error: err.message });
//     }
// })();

async function processNewTriggers() {
    try {
        const [triggers] = await db.execute(
            `SELECT * FROM trigger_table WHERE status = ${triggerStatus.PENDING}`
        );

        console.log('[ triggers ]', triggers);
        if (triggers.length === 0) return;

        for (const trigger of triggers) {
            await db.execute(
                `UPDATE trigger_table SET status = ${triggerStatus.PROCESSING} WHERE id = ?`,
                [trigger.id]
            );

            try {
                const template = typeof trigger.trigger_detail === 'string' 
                                 ? JSON.parse(trigger.trigger_detail) 
                                 : (trigger.trigger_detail || trigger);
                
                const employees = await resolveUniqueEmployees(template.grp_ids, template.emp_ids);
                const deviceTriggers = template.device_triggers;   
                const alertType      = template.alert_type; // ONE_WAY or TWO_WAY
                const alertFlowType  = template.alert_flow_type; // ALL_IN or SEQUENTIAL
                const isTwoWay       = alertType === ALERT_FLOW.TWO_WAY;
                
                console.log('[ employees ]', employees);

                let channelsUsed = new Set();
                if (alertFlowType === ALERT_TYPE.ALL_IN && deviceTriggers) {
                    for (const ch of Object.keys(deviceTriggers)) channelsUsed.add(CHANNEL_STR_TO_ID[ch]);
                } else if (alertFlowType === ALERT_TYPE.SEQUENTIAL && deviceTriggers) {
                    for (const dt of deviceTriggers) channelsUsed.add(CHANNEL_STR_TO_ID[dt.channel]);
                }

                console.log('[ channelsUsed ]', channelsUsed);

                const [summaryResult] = await db.execute(
                    `INSERT INTO trigger_summary (trigger_id, total_employees, channels_used, alert_type, resolved_at) 
                     VALUES (?, ?, ?, ?, NOW())`,
                    [trigger.id, employees.length, Array.from(channelsUsed).join(','), alertFlowType]
                );

                let totalDispatches = 0;

                for (const emp of employees) {
                    const basePayload = {
                        triggerId: trigger.id,
                        templateId: trigger.template_id || null,
                        emp_id: emp.id,
                        alertFlowType,
                        isTwoWay,
                        ...(isTwoWay && {
                            num_options: template.num_options,
                            ...(template.num_options >= 1 && { option_1_text: template.option_1_text }),
                            ...(template.num_options >= 2 && { option_2_text: template.option_2_text }),
                            ...(template.num_options >= 3 && { option_3_text: template.option_3_text }),
                        }),
                    };

                    console.log('[ basePayload ]', basePayload);

                    if (alertFlowType === ALERT_TYPE.ALL_IN && deviceTriggers) {

                        // console.log('entries',Object.entries(deviceTriggers));
                        for (const [channelStr, flags] of Object.entries(deviceTriggers)) {

                            // console.log('flags',Object.entries(flags));
                            for (const [contactStr, isEnabled] of Object.entries(flags)) {
                                if (!isEnabled) continue;
                                const contactValue = resolveContactValue(emp, channelStr, contactStr);
                                // console.log('contactValue',contactValue);

                                if (!contactValue && channelStr !== CHANNEL.PUSH) continue;
                                
                                const [logResult] = await db.execute(
                                    `INSERT INTO trigger_dispatch_log (trigger_id, emp_id, channel, contact_type, contact_value, status) 
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [trigger.id, emp.id, CHANNEL_STR_TO_ID[channelStr], CONTACT_STR_TO_ID[contactStr], contactValue || null, DISPATCH_STATUS.QUEUED]
                                );

                                const payload = _buildChannelPayload(basePayload, channelStr, template, contactValue, emp);
                                payload.dispatch_log_id = logResult.insertId;

                                console.log('Queue',CHANNEL_QUEUE_MAP[channelStr]);
                                console.log('Payload',payload);
                                console.log('Retry',channelRetry);


                                await addJob(CHANNEL_QUEUE_MAP[channelStr], payload, channelRetry);
                                totalDispatches++;
                            }
                        }
                    } else if (alertFlowType === ALERT_TYPE.SEQUENTIAL && Array.isArray(deviceTriggers)) {
                        console.log('[ ACTIVATING SEQUENTIAL TRIGGER]');
                        let seqOrder = 1;
                        for (const step of deviceTriggers) {
                            
                            const { channel: channelStr, contact: contactStr, waiting_time:wait_minutes } = step;
                            const contactValue = resolveContactValue(emp, channelStr, contactStr);

                            if (!contactValue && channelStr !== CHANNEL.PUSH) continue;

                            const [seqResult] = await db.execute(
                                `INSERT INTO trigger_sequential_queue (trigger_id, emp_id, channel, contact_type, seq_order, wait_minutes, status) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [trigger.id, emp.id, CHANNEL_STR_TO_ID[channelStr], CONTACT_STR_TO_ID[contactStr], seqOrder, wait_minutes || 0, SEQ_STATUS.PENDING]
                            );
                            
                            if (seqOrder === 1) {
                                const [logResult] = await db.execute(
                                    `INSERT INTO trigger_dispatch_log (trigger_id, emp_id, channel, contact_type, contact_value, status) 
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [trigger.id, emp.id, CHANNEL_STR_TO_ID[channelStr], CONTACT_STR_TO_ID[contactStr], contactValue || null, DISPATCH_STATUS.QUEUED]
                                );

                                await db.execute(
                                    `UPDATE trigger_sequential_queue SET status = ?, dispatch_log_id = ?, dispatched_at = NOW() WHERE id = ?`,
                                    [SEQ_STATUS.DISPATCHED, logResult.insertId, seqResult.insertId]
                                );

                                const payload = _buildChannelPayload(basePayload, channelStr, template, contactValue, emp);
                                payload.dispatch_log_id = logResult.insertId;
                                payload.sequential_queue_id = seqResult.insertId;

                                await addJob(CHANNEL_QUEUE_MAP[channelStr], payload, channelRetry);
                                totalDispatches++;
                            }
                            seqOrder++;
                        }
                    }
                }

                await db.execute(
                    `UPDATE trigger_summary SET total_dispatches = ? WHERE trigger_id = ?`,
                    [totalDispatches, trigger.id]
                );

                await db.execute(
                    `UPDATE trigger_table SET status = ${triggerStatus.COMPLETED} WHERE id = ?`,
                    [trigger.id]
                );

                logger.info(`[Cron] Trigger ${trigger.id} successfully processed and queued.`);

            } catch (err) {
                logger.error(`[Cron] Error resolving data for trigger ${trigger.id}:`, { error: err.message, stack: err.stack });
                await db.execute(
                    `UPDATE trigger_table SET status = ${triggerStatus.FAILED} WHERE id = ?`,
                    [trigger.id]
                );
            }
        }
    } catch (error) {
        logger.error('[Cron] Error polling trigger_table:', { error: error.message, stack: error.stack });
    }
}

let isProcessingTriggers = false;

cron.schedule('*/30 * * * * *', async () => {
    if (isProcessingTriggers) {
        logger.warn('[Cron] Skipping run, previous trigger processing is still active.');
        return;
    }
    isProcessingTriggers = true;
    try {
        logger.info('[Cron] Checking trigger_table for new entries...');
        await processNewTriggers();
    } finally {
        isProcessingTriggers = false;
    }
});

logger.info('[Cron] Trigger processing scheduler started.');
