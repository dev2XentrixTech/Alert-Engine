const { Worker } = require('bullmq');
const { redisConnection } = require('../queues/redisConnection');
const db     = require('../db/connection');
const Q      = require('../config/queueNames');
const logger = require('../utils/winstonLogger');

/**
 * Maps a raw reply text or digit to an option number.
 * Accepts: "1", "yes", "YES", " Yes " etc.
 */
function resolveOption(rawReply, template) {
    const trimmed = (rawReply || '').trim().toLowerCase();

    const asNum = parseInt(trimmed);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= template.num_options) {
        return asNum;
    }

    for (let i = 1; i <= template.num_options; i++) {
        const optText = (template[`option_${i}_text`] || '').toLowerCase();
        if (trimmed === optText) return i;
    }

    return null; // unrecognised reply
}

async function responseHandler(job) {
    const { channel, contact_value, raw_reply, trigger_id, emp_id } = job.data;

    try {
        // ─── 1. Resolve trigger_id, emp_id, channelId and the dispatch log's sent_at ───
        let resolvedTrigId, resolvedEmpId, channelId, dispatchSentAt;

        if (trigger_id && emp_id) {
            // Email click-through: ids are already known
            resolvedTrigId = trigger_id;
            resolvedEmpId  = emp_id;

            const [logs] = await db.execute(
                `SELECT channel, sent_at FROM trigger_dispatch_log 
                 WHERE trigger_id = ? AND emp_id = ? AND status = 2 
                 ORDER BY sent_at DESC LIMIT 1`,
                [trigger_id, emp_id]
            );
            channelId      = logs[0]?.channel   || null;
            dispatchSentAt = logs[0]?.sent_at    || null;
        } else {
            // SMS / WhatsApp: look up by contact_value
            const [logs] = await db.execute(
                `SELECT trigger_id, emp_id, channel, sent_at 
                 FROM trigger_dispatch_log 
                 WHERE contact_value = ? AND status = 2
                 ORDER BY sent_at DESC LIMIT 1`,
                [contact_value]
            );

            if (!logs.length) {
                logger.warn('[ResponseWorker] No matching dispatch log found', { contact_value });
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
        const template = typeof triggers[0].trigger_detail === 'string'
            ? JSON.parse(triggers[0].trigger_detail)
            : triggers[0].trigger_detail;

        const selectedOption = resolveOption(raw_reply, template);

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
        throw err; // Let BullMQ retry
    }
}

new Worker(Q.RESPONSE_INBOUND, responseHandler, {
    connection:  redisConnection,
    concurrency: 20,
});

logger.info('[ResponseWorker] Inbound response worker started.');
