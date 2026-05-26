const { Worker }             = require('bullmq');
const { redisConnection }    = require('../queues/redisConnection');
const db                     = require('../db/connection');
const Q                      = require('../config/queueNames');
const logger                 = require('../utils/winstonLogger');
const { CHANNEL_STR_TO_ID , DISPATCH_STATUS}  = require('../config/constants');

/**
 * Maps a raw reply text or digit to an option number.
 * Accepts: "1", "yes", "YES", " Yes " etc.
 */
function resolveOption(rawReply, template) {
    console.log('rawReply', rawReply);
    console.log('template', template);

    const trimmed = (rawReply || '').trim().toLowerCase();
    console.log('trimmed', trimmed);

    const asNum = parseInt(trimmed);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= template.num_options) {
        console.log('asNum',asNum);
        return asNum;
    }

    for (let i = 1; i <= template.num_options; i++) {
        const optText = (template[`option_${i}_text`] || '').toLowerCase();
        console.log('optText', optText);
        if (trimmed === optText) return i;
    }

    return null; // unrecognised reply
}

async function responseHandler(job) {
    const { channel, contact_value, raw_reply, trigger_id, emp_id } = job.data;

    // Convert channel string ('whatsapp', 'sms', 'voice_call') → integer for DB queries
    const channelInt = CHANNEL_STR_TO_ID[channel] || null;

    try {
        // ─── 1. Resolve trigger_id, emp_id, channelId and the dispatch log's sent_at ───
        let resolvedTrigId, resolvedEmpId, channelId, dispatchSentAt;

        if (trigger_id && emp_id) {
            // Email click-through: trigger_id + emp_id already known
            resolvedTrigId = trigger_id;
            resolvedEmpId  = emp_id;

            const [logs] = await db.execute(
                `SELECT channel, sent_at FROM trigger_dispatch_log 
                 WHERE trigger_id = ? AND emp_id = ? AND status = 2 
                 ORDER BY sent_at DESC LIMIT 1`,
                [trigger_id, emp_id]
            );

            channelId      = logs[0]?.channel || null;
            dispatchSentAt = logs[0]?.sent_at  || null;
        } else {
            // SMS / WhatsApp: look up by contact_value AND channel
            // Without the channel filter, a WhatsApp reply could accidentally
            // match a voice call dispatch to the same phone number.
            const [logs] = await db.execute(
                `SELECT trigger_id, emp_id, channel, sent_at 
                 FROM trigger_dispatch_log 
                 WHERE contact_value = ? AND channel = ? AND status = 2
                 ORDER BY sent_at DESC LIMIT 1`,
                [contact_value, channelInt ]
            );

            console.log('Contact Details: ',[contact_value, channelInt]);
            console.log(`disptach_log`, logs);

            if (!logs.length) {
                logger.warn('[ResponseWorker] No matching dispatch log found', { contact_value, channel });
                return;
            }

            resolvedTrigId = logs[0].trigger_id;
            resolvedEmpId  = logs[0].emp_id;
            channelId      = logs[0].channel;
            dispatchSentAt = logs[0].sent_at;
        }

        // ─── 2. Per-channel idempotency: skip if this exact channel response already logged ───
        const [existing] = await db.execute(
            `SELECT id FROM trigger_response_log 
             WHERE trigger_id = ? AND emp_id = ? AND channel = ? LIMIT 1`,
            [resolvedTrigId, resolvedEmpId, channelId]
        );

        console.log('existing',existing);

        if (existing.length) {
            logger.info('[ResponseWorker] Duplicate channel response ignored', {
                trigger_id: resolvedTrigId, emp_id: resolvedEmpId, channel: channelId,
            });
            return;
        }

        // ─── 3. Load template to resolve option text ───
        const [triggers] = await db.execute(
            `SELECT trigger_detail FROM trigger_table WHERE id = ?`,
            [resolvedTrigId]
        );
        console.log('triggers',triggers);
        
        const template = typeof triggers[0].trigger_detail === 'string'
            ? JSON.parse(triggers[0].trigger_detail)
            : triggers[0].trigger_detail;

        // console.log('selectedOption',selectedOption);

        const selectedOption = resolveOption(raw_reply, template);
        console.log('selectedOption',selectedOption);
        // ─── 4. Calculate how long it took the user to respond ───
        let responseTimeSeconds = null;
        if (dispatchSentAt) {
            responseTimeSeconds = Math.round((Date.now() - new Date(dispatchSentAt).getTime()) / 1000);
        }

        // ─── 5. Log the response for this channel ───
        await db.execute(
            `INSERT INTO trigger_response_log 
                (trigger_id, emp_id, channel, contact_value, selected_option, response_raw, response_time_seconds) 
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                selected_option = VALUES(selected_option),
                response_raw = VALUES(response_raw),
                response_time_seconds = VALUES(response_time_seconds)`,
            [resolvedTrigId, resolvedEmpId, channelId, contact_value || null, selectedOption, raw_reply, responseTimeSeconds]
        );

        logger.info('[ResponseWorker] Response logged', {
            trigger_id: resolvedTrigId, emp_id: resolvedEmpId,
            channel: channelId, selected_option: selectedOption,
            response_time_seconds: responseTimeSeconds,
        });

    } catch (err) {
        logger.error('[ResponseWorker] Error processing response', { error: err.message, stack: err.stack });
        throw err;
    }
}

new Worker(Q.RESPONSE_INBOUND, responseHandler, {
    connection:  redisConnection,
    concurrency: 2,
});

logger.info('[ResponseWorker] Inbound response worker started.');
