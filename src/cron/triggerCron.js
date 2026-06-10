const cron = require('node-cron');
const db = require('../db/connection');
const { addJob } = require('../queues/queueManager');
const { ALERT_TYPE, ALERT_FLOW, CHANNEL, triggerStatus, CHANNEL_STR_TO_ID, CONTACT_STR_TO_ID, QUEUE_STATUS, SEQ_STATUS } = require('../config/constants');
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

const LOGIC_FIELD_MAP = {
    country_id:        'country_id',
    city_id:           'city_id',
    site_id:           'site_id',
    department_id:     'cc_function_id',
    business_unit_id:  'ccg2_business_unit_id',
    domain_id:         'ccg1_domain_unit_id',
    working_status_id: 'working_status_id',
    user_type_id:      'user_type_id',
    blood_group_id:    'blood_group_id'
};

const resolveGroupEmployeeIds = async (groupId, visitedGrpIds = new Set()) => {
    if (visitedGrpIds.has(groupId)) return new Set();
    visitedGrpIds.add(groupId);

    const [rows] = await db.execute(
        `SELECT grp_type, emp_ids, grp_ids,
                country_id, city_id, site_id, department_id, business_unit_id,
                domain_id, working_status_id, user_type_id, blood_group_id
         FROM manage_group WHERE id = ? LIMIT 1`,
        [groupId]
    );
    if (!rows.length) return new Set();

    const grp      = rows[0];
    const empIdSet = new Set();

    if (grp.grp_type === 1) {
        if (grp.emp_ids) {
            grp.emp_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean)
                .forEach(id => empIdSet.add(id));
        }
        if (grp.grp_ids) {
            const nestedIds = grp.grp_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean);
            for (const nid of nestedIds) {
                const nestedSet = await resolveGroupEmployeeIds(nid, visitedGrpIds);
                nestedSet.forEach(id => empIdSet.add(id));
            }
        }
    } else if (grp.grp_type === 2) {
        let empCol = null, masterVal = null;
        for (const [grpCol, empMasterCol] of Object.entries(LOGIC_FIELD_MAP)) {
            if (grp[grpCol] !== null && grp[grpCol] !== undefined) {
                empCol    = empMasterCol;
                masterVal = grp[grpCol];
                break;
            }
        }
        if (empCol && masterVal !== null) {
            const [empRows] = await db.execute(
                `SELECT id FROM employee_master WHERE ${empCol} = ?`, [masterVal]
            );
            empRows.forEach(e => empIdSet.add(e.id));
        }
    }

    return empIdSet;
};



const resolveUniqueEmployees = async (grp_ids_str, emp_ids_str) => {
    const empIdSet = new Set();

    if (grp_ids_str) {
        const grpIds = grp_ids_str.split(',').map(s => parseInt(s.trim())).filter(Boolean);

        for (const gid of grpIds) {
            const resolved = await resolveGroupEmployeeIds(gid);
            resolved.forEach(id => empIdSet.add(id));
        }
    }

    if (emp_ids_str) {
        String(emp_ids_str).split(',').map(s => parseInt(s.trim())).filter(Boolean)
            .forEach(id => empIdSet.add(id));
    }

    if (!empIdSet.size) return [];

    const ids          = [...empIdSet];
    const placeholders = ids.map(() => '?').join(',');
    const [employees]  = await db.execute(
        `SELECT id, emp_id, full_name, first_name,
                official_email_id, official_contact_no, official_contact_cc,
                personal_email_id, personal_contact_no, personal_contact_cc,
                emergency_email_id, emergency_contact_no, emergency_contact_cc
         FROM employee_master WHERE id IN (${placeholders})`,
        ids
    );

    return employees;
};

function resolveContactValue(emp, channelStr, contactTypeStr) {

    const cleanCC = (cc) => (cc || '').replace(/\+/g, '');

    if (channelStr === CHANNEL.EMAIL) {
        
        if (contactTypeStr === 'official') 
            return emp.official_email_id;

        if (contactTypeStr === 'personal') 
            return emp.personal_email_id;

        if (contactTypeStr === 'emergency') 
            return emp.emergency_email_id;
        
    } else if ([CHANNEL.SMS, CHANNEL.WHATSAPP, CHANNEL.VOICE].includes(channelStr)) {
        
        if (contactTypeStr === 'official') 
            return emp.official_contact_no 
                   ? `${cleanCC(emp.official_contact_cc) || ''}${emp.official_contact_no}` 
                   : null;

        if (contactTypeStr === 'personal') 
            return emp.personal_contact_no 
                   ? `${cleanCC(emp.personal_contact_cc) || ''}${emp.personal_contact_no}` 
                   : null;

        if (contactTypeStr === 'emergency') 
            return emp.emergency_contact_no 
                   ? `${cleanCC(emp.emergency_contact_cc) || ''}${emp.emergency_contact_no}` 
                   : null;
        
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

        logger.info('[ triggers ]', triggers);
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
                const alertType      = template.alert_type; 
                const alertFlowType  = template.alert_flow_type; 
                const isTwoWay       = alertType === ALERT_FLOW.TWO_WAY;

                 logger.info('[ EXPLOYEES ]:', employees);

                let channelsUsed = new Set();
                if (alertFlowType === ALERT_TYPE.ALL_IN && deviceTriggers) {
                    for (const [ch, flags] of Object.entries(deviceTriggers)) {
                        if (Object.values(flags).some(Boolean)) {
                            channelsUsed.add(CHANNEL_STR_TO_ID[ch]);
                        }
                    }
                } else if (alertFlowType === ALERT_TYPE.SEQUENTIAL && deviceTriggers) {
                    for (const dt of deviceTriggers) channelsUsed.add(CHANNEL_STR_TO_ID[dt.channel]);
                }

                logger.info('[ CHANNELS USED ]:', channelsUsed);

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
                        name: emp.first_name,
                        alertFlowType,
                        isTwoWay,
                        ...(isTwoWay && {
                            num_options: template.num_options,
                            ...(template.num_options >= 1 && { option_1_text: template.option_1_text }),
                            ...(template.num_options >= 2 && { option_2_text: template.option_2_text }),
                            ...(template.num_options >= 3 && { option_3_text: template.option_3_text }),
                        }),
                    };

                    logger.info('[ BASE PAYLOAD ]:', basePayload);

                    if (alertFlowType === ALERT_TYPE.ALL_IN && deviceTriggers) {

                        for (const [channelStr, flags] of Object.entries(deviceTriggers)) {

                            for (const [contactStr, isEnabled] of Object.entries(flags)) {
                                
                                if (!isEnabled) continue;
                                
                                const contactValue = resolveContactValue(emp, channelStr, contactStr);
    
                                if (!contactValue && channelStr !== CHANNEL.PUSH) continue;
                                
                                const [logResult] = await db.execute(
                                    `INSERT INTO trigger_dispatch_log (trigger_id, emp_id, channel, contact_type, contact_value, status) 
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [trigger.id, emp.id, CHANNEL_STR_TO_ID[channelStr], CONTACT_STR_TO_ID[contactStr], contactValue || null, QUEUE_STATUS.QUEUED]
                                );

                                const payload = _buildChannelPayload(basePayload, channelStr, template, contactValue, emp);
                                payload.dispatch_log_id = logResult.insertId;

                                logger.info(`[ JOBS ${totalDispatches} ]`, {
                                    "Queue":CHANNEL_QUEUE_MAP[channelStr],
                                    "Payload":payload,
                                })

                                await addJob(CHANNEL_QUEUE_MAP[channelStr], payload, channelRetry);
                                totalDispatches++;
                            }
                        }
                    } else if (alertFlowType === ALERT_TYPE.SEQUENTIAL && Array.isArray(deviceTriggers)) {
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
                                    [trigger.id, emp.id, CHANNEL_STR_TO_ID[channelStr], CONTACT_STR_TO_ID[contactStr], contactValue || null, QUEUE_STATUS.QUEUED]
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

cron.schedule('*/5 * * * * *', async () => {
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
