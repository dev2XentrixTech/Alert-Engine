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
const { READ_EVENT } = require('../config/constants');

async function logWriteHandler(job) {
    const { message_uuid, delivery_status, event_type, channel, raw_payload } = job.data;

    // ── 1. Append to dispatch_event_log ───────────────────────────────────────
    // Stores the RAW Vonage event string — the faithful audit record.
    await db.execute(
        `INSERT INTO dispatch_event_log (message_uuid, event_type, raw_payload)
         VALUES (?, ?, ?)`,
        [message_uuid, event_type, JSON.stringify(raw_payload)]
    );

    // ── 2. Update trigger_dispatch_log.delivery_status ────────────────────────
    // Skip for WhatsApp "read" — that's event-log only, not a delivery state change.
    // if (event_type === READ_EVENT) {
    //     return;
    // }

    // Extract Vonage pricing — present in SMS/WhatsApp webhooks only.
    const price    = raw_payload?.usage?.price    ? parseFloat(raw_payload.usage.price)    : null;
    const currency = raw_payload?.usage?.currency ? raw_payload.usage.currency              : null;

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
