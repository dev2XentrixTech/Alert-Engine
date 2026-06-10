/**
 * logWriteWorker.js
 *
 * Handler for the LOG_WRITE queue.
 * Registered in workerFactory.js alongside all channel workers.
 * The Worker instance is created there by the CHANNEL_CONFIG loop.
 *
 * Job payload: { message_uuid, delivery_status, event_type, channel, raw_payload }
 *
 *   message_uuid    — Vonage message/call UUID
 *   delivery_status — DELIVERY_STATUS code (1=DELIVERED 2=FAILED) → trigger_dispatch_log.delivery_status
 *   event_type      — raw provider string ("submitted", "delivered", "answered", etc.) → dispatch_event_log.event_type
 *   channel         — channel ID (2=sms, 3=whatsapp, 4=voice)
 *   raw_payload     — full raw webhook body from Vonage
 *
 * This worker ONLY writes delivery_status — it never touches queue_status.
 * queue_status is owned by the channel workers (emailWorker, smsWorker, etc.)
 *
 * Pricing from Vonage webhooks:
 *   SMS/WhatsApp: raw_payload.usage.price / raw_payload.usage.currency
 *   Voice:        not included in event webhooks
 */

const db = require('../db/connection');
const logger = require('../utils/winstonLogger');

async function logWriteHandler(job) {
    const { message_uuid, delivery_status, event_type, channel, raw_payload } = job.data;

    // ── 1. Append to dispatch_event_log ───────────────────────────────────────
    // Stores the RAW Vonage event string and the channel ID — the faithful audit record.
    await db.execute(
        `INSERT INTO dispatch_event_log (message_uuid, channel, event_type, raw_payload)
         VALUES (?, ?, ?, ?)`,
        [message_uuid, channel, event_type, JSON.stringify(raw_payload)]
    );

    // ── 2. Update trigger_dispatch_log.delivery_status ────────────────────────
    logger.info('[ RAW PAYLOAD ]:', raw_payload);

    // Extract Vonage pricing.
    // SMS/WhatsApp: raw_payload.usage.price / raw_payload.usage.currency
    // Voice: raw_payload.price / raw_payload.currency (defaulting to EUR for Voice)
    let price = null;
    let currency = null;

    if (raw_payload?.usage?.price !== undefined && raw_payload?.usage?.price !== null) {
        price = parseFloat(raw_payload.usage.price);
        currency = raw_payload.usage.currency || 'EUR';
    } else if (raw_payload?.price !== undefined && raw_payload?.price !== null) {
        price = parseFloat(raw_payload.price);
        currency = raw_payload.currency || 'EUR';
    }

    // delivery_status is nullable and only set ONCE (first webhook wins via COALESCE).
    // We never downgrade: if DELIVERED arrived first, a later FAILED won't overwrite it.
    // (COALESCE(delivery_status, ?) means: only write if currently NULL)
    if (price !== null && currency) {
        await db.execute(
            `UPDATE trigger_dispatch_log
             SET delivery_status = COALESCE(delivery_status, ?),
                 price           = COALESCE(price, ?),
                 currency        = COALESCE(currency, ?)
             WHERE message_id = ? AND channel = ?`,
            [delivery_status, price, currency, message_uuid, channel]
        );
    } else {
        await db.execute(
            `UPDATE trigger_dispatch_log
             SET delivery_status = COALESCE(delivery_status, ?)
             WHERE message_id = ? AND channel = ?`,
            [delivery_status, message_uuid, channel]
        );
    }
}

module.exports = { logWriteHandler };
