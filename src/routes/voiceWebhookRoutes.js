const { Router } = require('express');
const { addJob } = require('../queues/queueManager');
const Q = require('../config/queueNames');
const logger = require('../utils/winstonLogger');
const { resolveAudioUrl } = require('../services/vonage/voiceService');
const { DELIVERY_STATUS, PROVIDER_EVENT } = require('../config/constants');

const router = Router();

router.all('/api/voice/webhooks/answer', (req, res) => {

    logger.info('[ =========== ANSWER ==================== ]');
    const params = req.method === 'GET' ? req.query : req.body;
    logger.info('[ VOICE WEBHOOKS EVENT ]:', params);

    const {
        call_uuid,
        text,
        audio_url,
        num_options,
        option_1_text,
        option_2_text,
        option_3_text,
    } = params;

    logger.info('[VoiceWebhook] /answer hit', { call_uuid, from: params.from, has_audio: !!audio_url });

    const n = parseInt(num_options) || 2;
    const optionLines = [];
    const optTexts = [option_1_text, option_2_text, option_3_text];
    for (let i = 0; i < n; i++) {
        optionLines.push(`Press ${i + 1} for ${optTexts[i] || `option ${i + 1}`}.`);
    }

    let mainAction;
    if (audio_url) {
        mainAction = {
            action: 'stream',
            streamUrl: [resolveAudioUrl(audio_url)],
            level: 0,
            bargeIn: false,
        };
    } else {
        const prompt = `${text}. ${optionLines.join(' ')}`;
        mainAction = {
            action: 'talk',
            text: prompt,
            language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
            bargeIn: true,
        };
    }

    const optionsAction = audio_url
        ? [
            {
                action: 'talk',
                text: `${optionLines.join(' ')}`,
                language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
                bargeIn: true,
            },
          ]
        : [];

    const ncco = [
        mainAction,
        ...optionsAction,
        {
            action: 'input',
            type: ['dtmf'],
            dtmf: {
                maxDigits: 1,
                submitOnHash: true,
                timeOut: 10,
            },
        
            eventUrl: [`${process.env.API_BASE_URL}/api/voice/webhooks/dtmf?call_uuid=${encodeURIComponent(call_uuid)}`],
        },
    ];

    res.json(ncco);
});

router.post('/api/voice/webhooks/dtmf', async (req, res) => {

    logger.info('[ =========== dtmf ==================== ]');

    const body = req.body || {};
    const digit = body.dtmf?.digits || body.dtmf || '';
    const uuid = body.uuid;
    
    const call_uuid = req.query.call_uuid || '';

    logger.info('[VoiceWebhook] /dtmf hit', { call_uuid, digit, uuid });

    // Parse trigger_id and emp_id from the call_uuid
    // Format: "{trigger_id}-{emp_id}-{uuidv4}"
    const parts = call_uuid.split('-');
    const triggerId = parseInt(parts[0]) || null;
    const empId = parseInt(parts[1]) || null;

    if (triggerId && empId && digit) {
        await addJob(Q.RESPONSE_INBOUND, {
            channel: 'voice_call',
            contact_value: body.to || null, 
            raw_reply: digit,
            trigger_id: triggerId,
            emp_id: empId,
        });
        logger.info('[VoiceWebhook] DTMF response queued', { trigger_id: triggerId, emp_id: empId, digit });
    }

    const confirmations = {
        '1': 'Thank you. Your response has been recorded. Goodbye.',
        '2': 'Thank you. Your response has been recorded. Goodbye.',
        '3': 'Thank you. Your response has been recorded. Goodbye.',
    };
    const confirmText = confirmations[digit]
        || 'We did not receive a valid input. Please try again later. Goodbye.';

    res.json([
        {
            action: 'talk',
            text: confirmText,
            language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
        },
    ]);
});


router.all('/api/voice/webhooks/event', (req, res) => {

    res.status(200).end();

    const data = req.method === 'GET' ? req.query : (req.body || {});
    const { status, uuid } = data;

    logger.info('[ VOICE WEBHOOKS EVENT ]:', data);
    logger.info('[VoiceWebhook] Call event', { status, uuid });

    if (!uuid || !status) return;

    // From a network/delivery perspective: if Vonage reached the destination
    // phone at all (it rang, was answered, was busy, or was declined), we
    // consider the alert DELIVERED. The network did its job.
    //
    // Only "failed" means Vonage could NOT route to the phone at all.
    // "ringing" / "started" are lifecycle events with no status meaning — skip.
    //
    // event_type  = raw Vonage string → stored in dispatch_event_log
    // dispatchStatus = our code → stored in trigger_dispatch_log

    let dispatchStatus;

    if (status === PROVIDER_EVENT.FAILED) {
        dispatchStatus = DELIVERY_STATUS.FAILED;

    } else if (status === PROVIDER_EVENT.STARTED) {
        return; 


    } else {
        // ringing / answered / completed / busy / rejected → DELIVERED
        dispatchStatus = DELIVERY_STATUS.DELIVERED;
    }

    addJob(Q.LOG_WRITE, {
        message_uuid:    uuid,
        channel:         4,
        delivery_status: dispatchStatus,   
        event_type:      status,      
        raw_payload:     data,
    }).catch(err => logger.error('[VoiceWebhook] Failed to enqueue log-write', { error: err.message, uuid }));
});

module.exports = router;
