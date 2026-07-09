const { Router }    = require('express');
const { verifySignature } = require('@vonage/jwt');
const { addJob }    = require('../queues/queueManager');
const Q             = require('../config/queueNames');
const logger        = require('../utils/winstonLogger');
const { DELIVERY_STATUS } = require('../config/constants');
const { decryptData } = require('../utils/utilities');


// ── recordProviderEvent: fire-and-forget via LOG_WRITE queue ──────────────────
// event_type      = raw Vonage status string ("submitted", "delivered", "read", etc.)
//                   → stored in dispatch_event_log.event_type
// delivery_status = our numeric code (DELIVERY_STATUS.*)
//                   → stored in trigger_dispatch_log.status
function recordProviderEvent({ message_uuid, channel, event_type, delivery_status, raw_payload }) {
    addJob(Q.LOG_WRITE, { message_uuid, channel, event_type, delivery_status, raw_payload })
        .catch(err => logger.error('[Webhook] Failed to enqueue log-write job', { error: err.message, message_uuid }));
}


const router = Router();


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
            return; 
        }
        throw err; 
    }
}

router.post('/api/whatsapp/webhooks/inbound', async (req, res) => {
    res.status(200).end();
    
    logger.info('[ WHATSAPP INBOUND ]: ',req.body);

    try {
        verifyVonageJWT(req);
    } catch (err) {
        logger.warn('[WhatsAppWebhook] JWT verification failed in production — request rejected');
        return;
    }

    const body = req.body || {};
    const from = body.from;
    const text = body.text?.trim();

    if (!from || !text) {
        logger.warn('[WhatsAppWebhook] Inbound missing from/text', { body });
        return;
    }

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'whatsapp',
        contact_value: from,
        raw_reply:     text,
        trigger_id:    null, 
        emp_id:        null,
    });

    logger.info('[WhatsAppWebhook] Inbound response queued', { from, text });
});

router.post('/api/whatsapp/webhooks/status', (req, res) => {
    res.status(200).end();

    const body = req.body || {};

    logger.info('[ SMS WEBHOOKS EVENT ]:', body);

    const { message_uuid, status } = body;
    if (!message_uuid || !status) return;

    // WhatsApp event lifecycle: submitted → delivered → read
    // Network-delivery logic (same as voice):
    //   submitted = WhatsApp server received the message = network delivery confirmed → DELIVERED
    //   delivered = landed on recipient device                                       → DELIVERED (no-op, already set)
    //   read      = user opened it                                                   → event log only (READ)
    //   rejected  = WhatsApp/carrier blocked (DND, invalid, banned)                 → FAILED
    //              NOTE: unlike voice "rejected" (user declined = phone was reached),
    //              WA rejected means the message never reached the device.
    //   failed    = provider-level failure                                           → FAILED
    const statusMap = {
        submitted: DELIVERY_STATUS.DELIVERED,
        delivered: DELIVERY_STATUS.DELIVERED,
        read:      null,                       // event log only — handled by READ_EVENT guard in logWriteWorker
        rejected:  DELIVERY_STATUS.FAILED,
        failed:    DELIVERY_STATUS.FAILED,
    };
    const newStatus = statusMap[status];
    if (newStatus === undefined) return;       // unknown event — ignore
    // newStatus===null means READ — still enqueue so event_type is logged

    recordProviderEvent({ message_uuid, channel: 3, event_type: status, delivery_status: newStatus, raw_payload: body });
    logger.info('[WhatsAppWebhook] Status event enqueued', { message_uuid, status });
});


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

router.post('/api/sms/webhooks/status', (req, res) => {
    res.status(200).end();

    const body = req.body || {};

    logger.info('[ SMS WEBHOOKS EVENT ]:', body);

    const { message_uuid, status } = body;
    if (!message_uuid || !status) return;

    // SMS event lifecycle: submitted → delivered
    // Network-delivery logic (same as voice):
    //   submitted = carrier accepted and is routing to handset = network delivery → DELIVERED
    //   delivered = carrier DLR confirmed on handset            = DELIVERED (no-op)
    //   rejected  = carrier blocked (DND, invalid number, etc.) = FAILED
    //              NOTE: unlike voice "rejected" (user's phone rang and they declined),
    //              SMS rejected means it never left the carrier routing layer.
    //   failed    = provider-level failure                       = FAILED
    const statusMap = {
        submitted: DELIVERY_STATUS.DELIVERED,
        delivered: DELIVERY_STATUS.DELIVERED,
        rejected:  DELIVERY_STATUS.FAILED,
        failed:    DELIVERY_STATUS.FAILED,
    };
    const newStatus = statusMap[status];
    if (newStatus === undefined) return;

    recordProviderEvent({ message_uuid, channel: 2, event_type: status, delivery_status: newStatus, raw_payload: body });
    logger.info('[SmsWebhook] Status event enqueued', { message_uuid, status });
});


router.get('/api/email/webhooks/response', async (req, res) => {

    logger.info('[EmailWebhook] Raw query received', req.query);

    const { token } = req.query;

    if (!token) {
        return res.status(400).send('<h2>Invalid response link.</h2>');
    }

    let trigger_id, emp_id, option, email;
    try {
        const decrypted = decryptData(token);
        const payload   = JSON.parse(decrypted);

        trigger_id = payload.trigger_id;
        emp_id     = payload.emp_id;
        option     = payload.option;
        email      = payload.email;

        if (!trigger_id || !emp_id || !option || !email) {
            throw new Error('Missing required fields after decryption');
        }
    } catch (err) {
        logger.error('[EmailWebhook] Token decryption failed', { error: err.message });
        return res.status(400).send('<h2>Invalid or tampered response link.</h2>');
    }

    await addJob(Q.RESPONSE_INBOUND, {
        channel:       'email',
        contact_value: email,
        raw_reply:     String(option),
        trigger_id:    parseInt(trigger_id),
        emp_id:        parseInt(emp_id),
    });

    logger.info('[EmailWebhook] Email response decrypted and queued', { trigger_id, emp_id, option });

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
