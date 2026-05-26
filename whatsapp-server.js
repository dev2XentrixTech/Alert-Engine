require('dotenv').config();
const express = require('express');
const { Vonage } = require('@vonage/server-sdk');
const { WhatsAppText } = require('@vonage/messages');
const { verifySignature } = require('@vonage/jwt');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Sandbox uses a different host — remove apiHost block in production
const vonageConfig = { 
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
};
const vonageOptions = process.env.IS_SANDBOX === 'true'
  ? { apiHost: 'https://messages-sandbox.nexmo.com' }
  : {};

const vonage = new Vonage(vonageConfig, vonageOptions);

// In-memory response log — replace with DB in production
const responseLog = [];

// Track who has been sent a menu and is awaiting a reply
const pendingMenu = new Map(); // phone → { sent_at }

// ─── JWT verification ────────────────────────────────────────────────────────
const verifyJWT = (req) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || !verifySignature(token, process.env.VONAGE_API_SIGNATURE_SECRET)) {
      throw new Error('Invalid token');
    }
  } catch (err) {
    console.warn('JWT check skipped in sandbox/dev:', err.message);
    // Remove the above line and throw err in production
  }
};

// ─── Helper: send a WhatsApp text message ───────────────────────────────────
async function sendWhatsApp(to, text) {
  const { messageUUID } = await vonage.messages.send(
    new WhatsAppText({
      from: process.env.VONAGE_WHATSAPP_NUMBER,
      to,
      text,
    })
  );
  console.log(` Sent to ${to} → UUID: ${messageUUID}`);
  return messageUUID;
}


// ════════════════════════════════════════════════════════════════════════
// ONE-WAY: Send a single message — no reply expected
// Trigger: GET /send?to=919XXXXXXXXX&text=Hello
// ════════════════════════════════════════════════════════════════════════
app.get('/send', async (req, res) => {
  const { to, text } = req.query;
  if (!to) return res.status(400).json({ error: 'Provide ?to=PHONE_NUMBER' });

  const message = text || 'Hello! This is a one-way notification from our service.';

  try {
    const uuid = await sendWhatsApp(to, message);
    console.log(` One-way message sent to ${to}`);
    res.json({ success: true, message_uuid: uuid });
  } catch (err) {
    console.error(' Send failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════════════
// TWO-WAY STEP 1: Send menu message — user replies with 1, 2, or 3
// Trigger: GET /send-menu?to=919XXXXXXXXX
// ════════════════════════════════════════════════════════════════════════
app.get('/send-menu', async (req, res) => {
  const { to } = req.query;
  if (!to) return res.status(400).json({ error: 'Provide ?to=PHONE_NUMBER' });

  const menuText =
    `Hello! Please reply with a number:\n\n` +
    `1 Satisfied with the service\n` +
    `2 Need support\n` +
    `3 Remove me from this list\n\n` +
    `Reply with 1, 2, or 3`;

  try {
    await sendWhatsApp(to, menuText);
    pendingMenu.set(to, { sent_at: new Date().toISOString() });
    console.log(` Menu sent to ${to} — awaiting reply`);
    res.json({ success: true, message: `Menu sent to ${to}` });
  } catch (err) {
    console.error(' Menu send failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════════════
// TWO-WAY STEP 2: Receive inbound message / reply
// Vonage POSTs here when the user sends any WhatsApp message to your number
// ════════════════════════════════════════════════════════════════════════
app.post('/webhook/inbound', async (req, res) => {
  verifyJWT(req);
  console.log("Inbound: ", req.body);
  const { from, text, message_uuid, timestamp } = req.body;
  const reply = text?.trim();

  console.log(`\n Inbound WhatsApp from ${from}: "${reply}"`);

  const optionMap = {
    '1': 'Satisfied with service',
    '2': 'Needs support',
    '3': 'Opted out',
  };

  const isAwaitingReply = pendingMenu.has(from);
  const selectedOption = optionMap[reply];

  if (isAwaitingReply && selectedOption) {
    // ── Valid menu reply ──────────────────────────────────────────────
    responseLog.push({
      phone_number: from,
      digit_pressed: reply,
      option: selectedOption,
      message_uuid,
      timestamp: timestamp || new Date().toISOString(),
    });

    pendingMenu.delete(from);
    console.log(`Logged: ${from} → "${selectedOption}"`);

    // Send confirmation based on choice
    const confirmations = {
      '1': ' Thank you for your feedback! Glad you are satisfied.',
      '2': ' Our support team will reach out to you shortly.',
      '3': ' You have been removed from our list. Take care!',
    };

    try {
      await sendWhatsApp(from, confirmations[reply]);
    } catch (err) {
      console.error('Confirmation failed:', err.message);
    }

  } else if (isAwaitingReply && !selectedOption) {
    // ── Invalid reply — re-prompt ─────────────────────────────────────
    console.log(`Invalid reply "${reply}" from ${from} — re-prompting`);
    try {
      await sendWhatsApp(from, `Sorry, I didn't understand "${reply}".\nPlease reply with 1, 2, or 3 only.`);
    } catch (err) {
      console.error('Re-prompt failed:', err.message);
    }

  } else {
    // ── Unsolicited message — user messaged first ─────────────────────
    console.log(`Unsolicited message from ${from}`);
    try {
      await sendWhatsApp(from, `Hi! Thanks for reaching out.\n\nReply *MENU* to see options, or just tell us how we can help.`);
    } catch (err) {
      console.error('Auto-reply failed:', err.message);
    }
  }

  res.status(200).end(); // always 200 or Vonage retries
});


// ─── Status webhook ──────────────────────────────────────────────────────────
app.post('/webhook/status', (req, res) => {
  
  console.log("Status: ", req.body);

  const { message_uuid, status, timestamp } = req.body;
  console.log(`📊 Status: ${status} | UUID: ${message_uuid} | ${timestamp}`);
  res.status(200).end();
});

// ─── View all tracked responses ──────────────────────────────────────────────
app.get('/responses', (req, res) => {
  res.json({
    total: responseLog.length,
    responses: responseLog,
  });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n WhatsApp server running on port ${PORT}`);
  console.log(`   One-way send:   http://localhost:${PORT}/send?to=919XXXXXXXXX&text=Hello`);
  console.log(`   Send menu:      http://localhost:${PORT}/send-menu?to=919XXXXXXXXX`);
  console.log(`   View responses: http://localhost:${PORT}/responses\n`);
});