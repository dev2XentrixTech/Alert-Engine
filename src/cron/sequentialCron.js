const cron = require('node-cron');
const db = require('../db/connection');
const { addJob } = require('../queues/queueManager');
const { CHANNEL, CHANNEL_STR_TO_ID, DISPATCH_STATUS, SEQ_STATUS } = require('../config/constants');
const Q = require('../config/queueNames');
const { channelRetry } = require('../utils/retryPolicy');
const logger = require('../utils/winstonLogger');

const CHANNEL_ID_TO_STR = Object.fromEntries(
    Object.entries(CHANNEL_STR_TO_ID).map(([k, v]) => [v, k])
);

const CHANNEL_QUEUE_MAP = {
  [CHANNEL.EMAIL]:    Q.CHANNEL_EMAIL,
  [CHANNEL.SMS]:      Q.CHANNEL_SMS,
  [CHANNEL.WHATSAPP]: Q.CHANNEL_WHATSAPP,
  [CHANNEL.VOICE]:    Q.CHANNEL_VOICE,
  [CHANNEL.PUSH]:     Q.CHANNEL_PUSH,
};

function resolveContactValue(emp, channelStr, contactTypeId) {
    if (channelStr === CHANNEL.EMAIL) {
        if (contactTypeId === 1) return emp.official_email_id;
        if (contactTypeId === 2) return emp.personal_email_id;
        if (contactTypeId === 3) return emp.emergency_email_id;
    } else if ([CHANNEL.SMS, CHANNEL.WHATSAPP, CHANNEL.VOICE].includes(channelStr)) {
        if (contactTypeId === 1) return emp.official_contact_no ? `${emp.official_contact_cc || ''}${emp.official_contact_no}` : null;
        if (contactTypeId === 2) return emp.personal_contact_no ? `${emp.personal_contact_cc || ''}${emp.personal_contact_no}` : null;
        if (contactTypeId === 3) return emp.emergency_contact_no ? `${emp.emergency_contact_cc || ''}${emp.emergency_contact_no}` : null;
    } else if (channelStr === CHANNEL.PUSH) {
        return emp.push_token;
    }
    return null;
}

function _buildChannelPayload(basePayload, channel, template, contactValue, emp) {
  const common = { ...basePayload, contact_value: contactValue };
  switch (channel) {
    case CHANNEL.EMAIL: return { ...common, email_subject: template.email_subject, email_body: template.email_body };
    case CHANNEL.SMS: return { ...common, sms_text: template.sms_text };
    case CHANNEL.WHATSAPP: return { ...common, whatsapp_text: template.whatsapp_text };
    case CHANNEL.VOICE: return { ...common, voice_call_text: template.voice_call_text, voice_call_audio: template.voice_call_audio };
    case CHANNEL.PUSH: return { ...common, push_message: template.app_push_msg, push_token: emp.push_token, platform: emp.platform };
    default: return common;
  }
}

async function processSequentialQueue() {
    try {
        const [pendingRows] = await db.execute(
            `SELECT sq.*, 
                    t.trigger_detail, t.template_id,
                    e.emp_id as e_emp_id, e.official_email_id, e.personal_email_id, e.emergency_email_id,
                    e.official_contact_no, e.personal_contact_no, e.emergency_contact_no,
                    e.official_contact_cc, e.personal_contact_cc, e.emergency_contact_cc
             FROM trigger_sequential_queue sq
             JOIN trigger_table t ON sq.trigger_id = t.id
             JOIN employee_master e ON sq.emp_id = e.id
             WHERE sq.status = ? AND sq.wait_until IS NOT NULL AND sq.wait_until <= NOW()`,
            [SEQ_STATUS.PENDING]
        );

        console.log("pendingRows",pendingRows);

        if (pendingRows.length === 0) return;

        for (const row of pendingRows) {
            try {
                const template = typeof row.trigger_detail === 'string' 
                                 ? JSON.parse(row.trigger_detail) 
                                 : (row.trigger_detail || row);

                console.log("template", template);

                const channelStr = CHANNEL_ID_TO_STR[row.channel];

                console.log("channelStr", channelStr);
                const contactValue = resolveContactValue(row, channelStr, row.contact_type);

                console.log("contactValue", contactValue);
                // Insert log
                const [logResult] = await db.execute(
                    `INSERT INTO trigger_dispatch_log (trigger_id, emp_id, channel, contact_type, contact_value, status) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [row.trigger_id, row.emp_id, row.channel, row.contact_type, contactValue || null, DISPATCH_STATUS.QUEUED]
                );

                await db.execute(
                    `UPDATE trigger_sequential_queue SET status = ?, dispatch_log_id = ?, dispatched_at = NOW() WHERE id = ?`,
                    [SEQ_STATUS.DISPATCHED, logResult.insertId, row.id]
                );

                const basePayload = {
                    triggerId: row.trigger_id,
                    templateId: row.template_id,
                    emp_id: row.emp_id,
                    alertFlowType: template.alert_flow_type,
                    isTwoWay: template.alert_type === 2,
                    ...(template.alert_type === 2 && {
                        num_options: template.num_options,
                        ...(template.num_options >= 1 && { option_1_text: template.option_1_text }),
                        ...(template.num_options >= 2 && { option_2_text: template.option_2_text }),
                        ...(template.num_options >= 3 && { option_3_text: template.option_3_text }),
                    }),
                };

                const payload = _buildChannelPayload(basePayload, channelStr, template, contactValue, row);
                payload.dispatch_log_id = logResult.insertId;
                payload.sequential_queue_id = row.id;

                console.log('Queue',CHANNEL_QUEUE_MAP[channelStr]);
                console.log('Payload',payload);
                console.log('Retry',channelRetry);

                await addJob(CHANNEL_QUEUE_MAP[channelStr], payload, channelRetry);

                await db.execute(
                    `UPDATE trigger_summary SET total_dispatches = total_dispatches + 1 WHERE trigger_id = ?`,
                    [row.trigger_id]
                );

            } catch (err) {
                logger.error(`[SequentialCron] Error dispatching seq_id ${row.id}:`, { error: err.message });
                await db.execute(`UPDATE trigger_sequential_queue SET status = ? WHERE id = ?`, [SEQ_STATUS.FAILED, row.id]);
            }
        }
    } catch (error) {
        logger.error('[SequentialCron] Error polling trigger_sequential_queue:', { error: error.message, stack: error.stack });
    }
}

async function checkSequentialCompletions() {
    try {
        const [triggers] = await db.execute(`SELECT trigger_id FROM trigger_summary WHERE alert_type = 2 AND completed_at IS NULL`);
        
        for (const t of triggers) {
            const [active] = await db.execute(`
                SELECT COUNT(*) as count 
                FROM trigger_sequential_queue 
                WHERE trigger_id = ? 
                AND (
                    status IN (?, ?) 
                    OR 
                    ((status = ? OR status = ?) AND wait_until > NOW())
                )
            `, [t.trigger_id, SEQ_STATUS.PENDING, SEQ_STATUS.DISPATCHED, SEQ_STATUS.COMPLETED, SEQ_STATUS.FAILED]);
            
            if (active[0].count === 0) {
                await db.execute(`
                    UPDATE trigger_summary 
                    SET completed_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, resolved_at, NOW()) 
                    WHERE trigger_id = ?
                `, [t.trigger_id]);
                logger.info(`[SequentialCron] Trigger ${t.trigger_id} marked as fully completed after all wait times expired.`);
            }
        }
    } catch (error) {
        logger.error('[SequentialCron] Error checking trigger completions:', { error: error.message });
    }
}

let isProcessingSequential = false;

cron.schedule('*/10 * * * * *', async () => {
    if (isProcessingSequential) {
        logger.warn('[SequentialCron] Skipping run, previous sequential processing is still active.');
        return;
    }
    isProcessingSequential = true;
    try {
        await processSequentialQueue();
        await checkSequentialCompletions();
    } finally {
        isProcessingSequential = false;
    }
});

logger.info('[SequentialCron] Sequential processing scheduler started.');
