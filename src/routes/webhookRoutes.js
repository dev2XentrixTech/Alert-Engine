const { Router } = require('express');
const crypto     = require('crypto');
const { addJob } = require('../queues/queueManager');
const Q          = require('../config/queueNames');
const logger     = require('../utils/winstonLogger');

const router = Router();

// --- Signature Validation (Vonage HMAC-SHA256) ---
function validateVonageSignature(req) {
    const secret    = process.env.VONAGE_SIGNATURE_SECRET;
    const signature = req.headers['x-vonage-signature'] || req.headers['x-nexmo-signature'];
    if (!secret || !signature) return false;

    const hmac = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

/**
 * POST /api/webhook/sms-response
 * Vonage calls this when a user replies to a two-way SMS.
 * Payload from Vonage: { msisdn, to, text, ... }
 */
router.post('/api/webhook/sms-response', async (req, res) => {
    res.status(200).json({ ok: true }); // Always ack Vonage immediately

    const { msisdn, text, 'message-id': messageId } = req.body;
    if (!msisdn || !text) return;

    // Lookup the trigger_id by the incoming message_id on trigger_dispatch_log
    const { getQueue } = require('../queues/queueFactory');
    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'sms',
        contact_value: msisdn,
        raw_reply:     text,
        trigger_id:    null,  // ResponseWorker will resolve via contact_value lookup
        emp_id:        null,
    });

    logger.info('[Webhook] SMS response received', { from: msisdn });
});

/**
 * POST /api/webhook/whatsapp-response
 * Vonage calls this when a user replies to a two-way WhatsApp message.
 */
router.post('/api/webhook/whatsapp-response', async (req, res) => {
    res.status(200).json({ ok: true });

    const { from, message } = req.body;
    const text = message?.content?.text || '';
    if (!from || !text) return;

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'whatsapp',
        contact_value: from,
        raw_reply:     text,
        trigger_id:    null,
        emp_id:        null,
    });

    logger.info('[Webhook] WhatsApp response received', { from });
});

/**
 * GET /api/webhook/email-response
 * User clicks a response button in the email.
 * Query params: trigger_id, emp_id, option (1/2/3)
 */
router.get('/api/webhook/email-response', async (req, res) => {
    const { trigger_id, emp_id, option } = req.query;

    if (!trigger_id || !emp_id || !option) {
        return res.status(400).send('<h2>Invalid response link.</h2>');
    }

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'email',
        contact_value: null,    // resolved via emp_id + trigger_id in the worker
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
