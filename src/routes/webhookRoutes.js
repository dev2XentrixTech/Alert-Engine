const { Router }    = require('express');
const crypto        = require('crypto');
const { verifySignature } = require('@vonage/jwt');
const { addJob }    = require('../queues/queueManager');
const Q             = require('../config/queueNames');
const logger        = require('../utils/winstonLogger');
const { DISPATCH_STATUS } = require('../config/constants');
const db = require('../db/connection');

const router = Router();

// ─── JWT Signature Verification ──────────────────────────────────────────────
// In sandbox mode (IS_SANDBOX=true) Vonage doesn't always send a valid JWT,
// so we warn and continue. In production, always enforce.
function verifyVonageJWT(req) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        if (!verifySignature(token, process.env.VONAGE_API_SIGNATURE_SECRET)) {
            throw new Error('Invalid token');
        }
    } catch (err) {
        if (process.env.IS_SANDBOX === 'true') {
            logger.warn('[WhatsAppWebhook] JWT check skipped in sandbox/dev: ' + err.message);
            return; // Allow in sandbox
        }
        throw err; // Reject in production
    }
}

// ─── SMS Signature Validation (HMAC-SHA256) ──────────────────────────────────
// function validateVonageSignature(req) {
//     const secret    = process.env.VONAGE_SIGNATURE_SECRET;
//     const signature = req.headers['x-vonage-signature'] || req.headers['x-nexmo-signature'];
//     if (!secret || !signature) return false;
//     const hmac = crypto
//         .createHmac('sha256', secret)
//         .update(JSON.stringify(req.body))
//         .digest('hex');
//     return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
// }

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/webhooks/inbound
//
// Vonage calls this when a user replies to any WhatsApp message.
//
// Real Vonage payload (confirmed from logs):
// {
//   from: '918317280673',
//   to: '14157386102',
//   text: '2',                  ← top-level, NOT message.content.text
//   message_uuid: '...',
//   timestamp: '...',
//   channel: 'whatsapp',
//   message_type: 'text'
// }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/whatsapp/webhooks/inbound', async (req, res) => {
    res.status(200).end(); // Always ACK immediately so Vonage doesn't retry
    
    console.log('[ WHATSAPP INBOUND ]: ',req.body);

    try {
        verifyVonageJWT(req);
    } catch (err) {
        logger.warn('[WhatsAppWebhook] JWT verification failed in production — request rejected');
        return;
    }

    const body = req.body || {};
    const from = body.from;
    const text = body.text?.trim(); // top-level field confirmed from Vonage logs

    if (!from || !text) {
        logger.warn('[WhatsAppWebhook] Inbound missing from/text', { body });
        return;
    }

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'whatsapp',
        contact_value: from,
        raw_reply:     text,
        trigger_id:    null, // responseWorker resolves via contact_value lookup
        emp_id:        null,
    });

    logger.info('[WhatsAppWebhook] Inbound response queued', { from, text });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/webhooks/status
//
// Vonage streams delivery status updates here:
//   submitted → delivered → read
//
// Real Vonage payload (confirmed from logs):
// { message_uuid, status, timestamp, to, from, channel, whatsapp: { ... } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/whatsapp/webhooks/status', async (req, res) => {
    res.status(200).end();

    const { message_uuid, status, timestamp } = req.body || {};
    if (!message_uuid || !status) return;

    logger.info('[WhatsAppWebhook] Status update', { message_uuid, status, timestamp });

    // Map Vonage status strings → our DISPATCH_STATUS codes
    // submitted → already recorded as SENT by the worker, skip
    // delivered → DELIVERED (4)
    // read      → READ (5)
    // const { DISPATCH_STATUS } = require('../config/constants');
    // const db = require('../db/connection');

    // const statusMap = {
    //     delivered: DISPATCH_STATUS.DELIVERED,
    //     read:      DISPATCH_STATUS.READ,
    // };

    // const newStatus = statusMap[status];
    // if (!newStatus) return; // 'submitted' and other events — nothing to update

    // try {
    //     const [result] = await db.execute(
    //         `UPDATE trigger_dispatch_log
    //          SET status = ?, provider_response = JSON_SET(
    //              COALESCE(provider_response, '{}'),
    //              '$.whatsapp_status', ?,
    //              '$.whatsapp_status_at', ?
    //          )
    //          WHERE message_id = ? AND channel = 3`,
    //         [newStatus, status, timestamp, message_uuid]
    //     );

    //     if (result.affectedRows > 0) {
    //         logger.info('[WhatsAppWebhook] Dispatch log updated', { message_uuid, status, affectedRows: result.affectedRows });
    //     } else {
    //         logger.warn('[WhatsAppWebhook] No dispatch log found for message_uuid', { message_uuid });
    //     }
    // } catch (err) {
    //     logger.error('[WhatsAppWebhook] Failed to update dispatch log', { error: err.message });
    // }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/webhooks/inbound
//
// Vonage calls this when a user replies to a two-way SMS (Messages API).
// Payload: { from, to, text, message_uuid, timestamp, ... }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/sms/webhooks/inbound', async (req, res) => {
    res.status(200).end();

    const { from, text, message_uuid } = req.body || {};
    if (!from || !text) return;

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'sms',
        contact_value: from,
        raw_reply:     text.trim(),
        trigger_id:    null,
        emp_id:        null,
    });

    logger.info('[SmsWebhook] SMS inbound received', { from, text, message_uuid });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/webhooks/status
//
// Vonage streams delivery status updates here for SMS Messages API.
// Payload: { message_uuid, status, timestamp, to, usage, ... }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/sms/webhooks/status', async (req, res) => {
    res.status(200).end();

    console.log("Req Status:", req.body);
    
    const { message_uuid, status, timestamp } = req.body || {};
    if (!message_uuid || !status) return;

    logger.info('[SmsWebhook] Status update', { message_uuid, status, timestamp });

    // For SMS, we want to store raw objects for both statuses:
    // e.g. status='submitted' and status='delivered'/'failed'
    
    // Determine the numerical status to apply if it is terminal
    let newStatus = null;
    if (status === 'delivered') newStatus = DISPATCH_STATUS.DELIVERED;
    else if (status === 'failed' || status === 'rejected') newStatus = DISPATCH_STATUS.FAILED;

    try {
        // We dynamically insert the raw response into the provider_response JSON object
        // using the status as the key (e.g. $.sms_status_submitted)
        const jsonKey = `$.sms_status_${status}`;

        let query = `UPDATE trigger_dispatch_log
                     SET provider_response = JSON_SET(
                         COALESCE(provider_response, '{}'),
                         ?, ?
                     )`;
        const params = [jsonKey, JSON.stringify(req.body)];

        if (newStatus) {
            query += `, status = ?`;
            params.push(newStatus);
        }

        query += ` WHERE message_id = ? AND channel = 2`; // channel 2 = SMS
        params.push(message_uuid);

        const [result] = await db.execute(query, params);

        if (result.affectedRows > 0) {
            logger.info('[SmsWebhook] Dispatch log updated', { message_uuid, status, affectedRows: result.affectedRows });
        } else {
            logger.warn('[SmsWebhook] No dispatch log found for message_uuid', { message_uuid });
        }
    } catch (err) {
        logger.error('[SmsWebhook] Failed to update dispatch log', { error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email/webhooks/response
//
// User clicks a response button embedded in the alert email.
// Query params: trigger_id, emp_id, option (1/2/3)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/email/webhooks/response', async (req, res) => {
    
    console.log('query', req.query);

    const { trigger_id, emp_id, option } = req.query;

    if (!trigger_id || !emp_id || !option) {
        return res.status(400).send('<h2>Invalid response link.</h2>');
    }

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'email',
        contact_value: null,
        raw_reply:     String(option),
        trigger_id:    parseInt(trigger_id),
        emp_id:        parseInt(emp_id),
    });

    logger.info('[Webhook] Email response received', { trigger_id, emp_id, option });

    return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Response Recorded</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;">
            <h2 style="color:#1a73e8;">✅ Thank you!</h2>
            <p>Your response has been recorded successfully.</p>
        </body>
        </html>
    `);
});

module.exports = router;
