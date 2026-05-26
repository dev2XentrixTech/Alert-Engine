/**
 * ─────────────────────────────────────────────────────────────────────────────
 * test-services.js
 *
 * Interactive CLI to manually test all three channels (Email, WhatsApp, Voice)
 * — both one-way and two-way — using the exact same service functions that
 * the workers use in production.
 *
 * Also includes a lightweight Express server that listens for the inbound
 * webhooks so you can verify the full round-trip in one terminal.
 *
 * Usage:
 *   node test-services.js
 *
 * Then pick a test from the menu. For two-way tests keep the script running
 * so it can receive the webhook callbacks from Vonage (via ngrok).
 *
 * Prerequisites:
 *   - .env file with all variables filled in
 *   - ngrok tunnel pointing to the port below (default 3001)
 *   - API_BASE_URL in .env set to your ngrok URL
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const express  = require('express');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

// ─── Services ────────────────────────────────────────────────────────────────
const { sendEmail }                            = require('./src/services/emailService');
const { sendOneWayWhatsapp, sendTwoWayWhatsapp } = require('./src/services/vonage/whatsappService');
const { makeOneWayCall, makeTwoWayCall }       = require('./src/services/vonage/voiceService');

// ─── Config from .env ────────────────────────────────────────────────────────
const TARGET_PHONE  = 918317280673;
const TARGET_EMAIL  = process.env.MAIL_TEST_TO    || process.env.MAIL_USER;
const WEBHOOK_PORT  = parseInt(process.env.TEST_WEBHOOK_PORT) || 3001;
const BASE_URL      = process.env.API_BASE_URL    || `http://localhost:${WEBHOOK_PORT}`;

// ─── Shared IVR context for two-way tests ────────────────────────────────────
const IVR_CONTEXT = {
    text:          'This is a test alert from the notification system.',
    num_options:   2,
    option_1_text: 'Safe',
    option_2_text: 'Need help',
    option_3_text: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK SERVER  — mirrors exactly what app.js exposes but self-contained
// so you do not need to spin up the full service stack
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Email response (user clicks button in email) ──────────────────────────
app.get('/api/email/webhooks/response', (req, res) => {
    const { trigger_id, emp_id, option } = req.query;
    log('EMAIL', `Response received | trigger_id=${trigger_id} emp_id=${emp_id} option=${option}`);
    res.send('<h2>✅ Test: Response recorded. You may close this tab.</h2>');
});

// ── WhatsApp inbound (user replies to a two-way WhatsApp) ────────────────
app.post('/webhook/inbound', (req, res) => {
    res.status(200).end();
    const { from, text } = req.body || {};
    log('WHATSAPP', `Inbound from ${from}: "${text}"`);
});

// ── WhatsApp status (submitted → delivered → read) ───────────────────────
app.post('/webhook/status', (req, res) => {
    res.status(200).end();
    const { message_uuid, status, timestamp } = req.body || {};
    log('WHATSAPP', `Status: ${status} | UUID: ${message_uuid} | ${timestamp}`);
});

// ── Voice answer (Vonage fetches NCCO when call is answered) ─────────────
app.all('/api/voice/webhooks/answer', (req, res) => {
    const params = req.method === 'GET' ? req.query : req.body;
    const { call_uuid, text, num_options, option_1_text, option_2_text, option_3_text } = params;

    log('VOICE', `/answer hit | call_uuid=${call_uuid}`);

    const n = parseInt(num_options) || 2;
    const optTexts = [option_1_text, option_2_text, option_3_text];
    const optLines = Array.from({ length: n }, (_, i) => `Press ${i + 1} for ${optTexts[i] || `option ${i + 1}`}.`);
    const prompt   = `${text}. ${optLines.join(' ')} Press hash to confirm.`;

    res.json([
        { action: 'talk', text: prompt, language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN', bargeIn: true },
        {
            action: 'input', type: ['dtmf'],
            dtmf: { maxDigits: 1, submitOnHash: true, timeOut: 10 },
            eventUrl: [`${BASE_URL}/api/voice/webhooks/dtmf?call_uuid=${encodeURIComponent(call_uuid)}`],
        },
    ]);
});

// ── Voice DTMF (user presses a digit) ────────────────────────────────────
app.post('/api/voice/webhooks/dtmf', (req, res) => {
    const digit     = req.body?.dtmf?.digits || req.body?.dtmf || '';
    const call_uuid = req.query.call_uuid || '';
    const parts     = call_uuid.split('-');
    const triggerId = parts[0];
    const empId     = parts[1];

    log('VOICE', `DTMF digit="${digit}" | trigger_id=${triggerId} emp_id=${empId}`);

    res.json([{
        action: 'talk',
        text:   digit ? `Thank you. You pressed ${digit}. Goodbye.` : 'No input received. Goodbye.',
        language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
    }]);
});

// ── Voice event stream (ringing → answered → completed) ──────────────────
app.all('/api/voice/webhooks/event', (req, res) => {
    res.status(200).end();
    const data   = req.method === 'GET' ? req.query : (req.body || {});
    log('VOICE', `Event: ${data.status} | uuid=${data.uuid}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function log(channel, msg) {
    const ts = new Date().toLocaleTimeString();
    console.log(`\n[${ts}] [${channel}] ${msg}`);
}

function hr() {
    console.log('\n' + '─'.repeat(65));
}

function printResult(channel, label, result) {
    hr();
    console.log(`✅  ${channel} — ${label}`);
    console.log('   Result:', JSON.stringify(result, null, 2).split('\n').join('\n   '));
    hr();
}

function printError(channel, label, err) {
    hr();
    console.error(`❌  ${channel} — ${label} FAILED`);
    console.error('   Error:', err.message || err);
    hr();
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function testEmailOneWay() {
    console.log(`\n📧  Sending one-way email to: ${TARGET_EMAIL}`);
    const [ok, info] = await sendEmail(
        TARGET_EMAIL,
        '[TEST] One-Way Alert',
        '<h2>🚨 Test Alert</h2><p>This is a <b>one-way</b> notification from the alert system. No reply needed.</p>'
    );
    if (ok) printResult('EMAIL', 'One-Way', { messageId: info.messageId });
    else     printError('EMAIL', 'One-Way', info);
}

async function testEmailTwoWay() {
    // Simulate what buildTwoWayEmail does: inject clickable option buttons
    const triggerId = 999;
    const empId     = 1;
    const optionsHtml = [1, 2].map(n => {
        const label = n === 1 ? IVR_CONTEXT.option_1_text : IVR_CONTEXT.option_2_text;
        return `<a href="${BASE_URL}/api/email/webhooks/response?trigger_id=${triggerId}&emp_id=${empId}&option=${n}"
                   style="display:inline-block;margin:6px;padding:10px 22px;background:#1a73e8;color:#fff;
                          text-decoration:none;border-radius:4px;font-weight:bold">
                    ${label}
                </a>`;
    }).join('\n');

    const body = `
        <h2>🚨 Test Two-Way Alert</h2>
        <p>${IVR_CONTEXT.text}</p>
        <br/>
        <p><strong>Please click one of the options below:</strong></p>
        <div>${optionsHtml}</div>
        <br/><p style="color:#888;font-size:12px">trigger_id=${triggerId} | emp_id=${empId}</p>
    `;

    console.log(`\n📧  Sending two-way email to: ${TARGET_EMAIL}`);
    const [ok, info] = await sendEmail(TARGET_EMAIL, '[TEST] Two-Way Alert — Click to Respond', body);
    if (ok) {
        printResult('EMAIL', 'Two-Way', { messageId: info.messageId });
        console.log('   👆 Click a button in the email — webhook will log the response here.');
    } else {
        printError('EMAIL', 'Two-Way', info);
    }
}

async function testWhatsAppOneWay() {
    console.log(`\n💬  Sending one-way WhatsApp to: ${TARGET_PHONE}`);
    try {
        const result = await sendOneWayWhatsapp({
            to:   TARGET_PHONE,
            text: '🚨 Test Alert: This is a one-way notification from the alert system. No reply needed.',
        });
        printResult('WHATSAPP', 'One-Way', result);
    } catch (err) {
        printError('WHATSAPP', 'One-Way', err);
    }
}

async function testWhatsAppTwoWay() {
    console.log(`\n💬  Sending two-way WhatsApp to: ${TARGET_PHONE}`);
    try {
        const result = await sendTwoWayWhatsapp({
            to:         TARGET_PHONE,
            text:       `🚨 Test Alert: ${IVR_CONTEXT.text}`,
            ivrContext: IVR_CONTEXT,
        });
        printResult('WHATSAPP', 'Two-Way', result);
        console.log('   👆 Reply with 1 or 2 on WhatsApp — inbound webhook will log here.');
    } catch (err) {
        printError('WHATSAPP', 'Two-Way', err);
    }
}

async function testVoiceOneWay() {
    console.log(`\n📞  Making one-way call to: ${TARGET_PHONE}`);
    try {
        const result = await makeOneWayCall({
            to:   TARGET_PHONE,
            text: 'Hello! This is a one-way test alert from the notification system. Stay safe. Goodbye.',
        });
        printResult('VOICE', 'One-Way', { uuid: result.uuid, status: result.status });
    } catch (err) {
        printError('VOICE', 'One-Way', err);
    }
}

async function testVoiceTwoWay() {
    const callUuid = `999-1-${uuidv4()}`; // trigger_id=999, emp_id=1
    console.log(`\n📞  Making two-way IVR call to: ${TARGET_PHONE}`);
    console.log(`    call_uuid: ${callUuid}`);
    try {
        const result = await makeTwoWayCall({
            to:       TARGET_PHONE,
            callUuid,
            ivrContext: IVR_CONTEXT,
        });
        printResult('VOICE', 'Two-Way IVR', { uuid: result.uuid, status: result.status });
        console.log('   👆 Answer the call and press a digit — /dtmf webhook will log here.');
    } catch (err) {
        printError('VOICE', 'Two-Way IVR', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE MENU
// ─────────────────────────────────────────────────────────────────────────────
const MENU = `
┌─────────────────────────────────────────────┐
│        Alert Notification — Service Tester  │
├──────┬──────────────────────────────────────┤
│  1   │ Email      — One-Way                 │
│  2   │ Email      — Two-Way (with buttons)  │
│  3   │ WhatsApp   — One-Way                 │
│  4   │ WhatsApp   — Two-Way (reply prompt)  │
│  5   │ Voice Call — One-Way (TTS)           │
│  6   │ Voice Call — Two-Way (IVR + DTMF)   │
│  7   │ Run ALL tests sequentially           │
│  q   │ Quit                                 │
└──────┴──────────────────────────────────────┘
Pick a test: `;

async function runAll() {
    await testEmailOneWay();
    await new Promise(r => setTimeout(r, 1500));
    await testEmailTwoWay();
    await new Promise(r => setTimeout(r, 1500));
    await testWhatsAppOneWay();
    await new Promise(r => setTimeout(r, 1500));
    await testWhatsAppTwoWay();
    await new Promise(r => setTimeout(r, 1500));
    await testVoiceOneWay();
    await new Promise(r => setTimeout(r, 3000)); // voice needs a bit more time
    await testVoiceTwoWay();
}

const tests = {
    '1': testEmailOneWay,
    '2': testEmailTwoWay,
    '3': testWhatsAppOneWay,
    '4': testWhatsAppTwoWay,
    '5': testVoiceOneWay,
    '6': testVoiceTwoWay,
    '7': runAll,
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
app.listen(WEBHOOK_PORT, () => {
    console.log('\n🚀  Webhook receiver running on port', WEBHOOK_PORT);
    console.log(`    Base URL : ${BASE_URL}`);
    console.log(`    Target ☎ : ${TARGET_PHONE}`);
    console.log(`    Target 📧 : ${TARGET_EMAIL}`);

    if (!process.env.API_BASE_URL || process.env.API_BASE_URL.includes('localhost')) {
        console.warn('\n⚠️   API_BASE_URL looks like localhost. Voice/WhatsApp webhooks from Vonage');
        console.warn('    will not reach you unless you set it to your ngrok URL.\n');
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const ask = () => {
        rl.question(MENU, async (choice) => {
            choice = choice.trim().toLowerCase();
            if (choice === 'q') {
                console.log('\nGoodbye!\n');
                rl.close();
                process.exit(0);
            }
            if (tests[choice]) {
                try { await tests[choice](); } catch (e) { console.error(e); }
            } else {
                console.log('Invalid choice. Try 1-7 or q.');
            }
            ask();
        });
    };

    ask();
});
