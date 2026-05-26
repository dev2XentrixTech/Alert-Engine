require('dotenv').config();
const express = require('express');
const { Vonage } = require('@vonage/server-sdk');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const vonage = new Vonage({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
});

const responseLog = [];

// ─── STEP 1: Trigger outbound call ──────────────────────────────────────────
app.get('/call', async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ error: 'Provide ?to=PHONE_NUMBER' });

  try {
    const response = await vonage.voice.createOutboundCall({
      to: [{ type: 'phone', number: to }],
      from: { type: 'phone', number: process.env.VONAGE_NUMBER },
      answer_url: [`${process.env.BASE_URL}/answer`],
      event_url: [`${process.env.BASE_URL}/webhooks/event`],
    });

    console.log(`IVR call started → UUID: ${response.uuid} → To: ${to}`);
    res.json({ success: true, call_uuid: response.uuid });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.all('/answer', (req, res) => {

    const { from, to, uuid } = req.query;
    console.log(`/answer | from: ${from} | to: ${to} | uuid: ${uuid}`);

    res.json([
      {
        action: 'talk',
        text: 'Hello! Press 1 for yes, press 2 for no.',
        language: 'en-IN',
        bargeIn: true,
      },
      {
        action: 'input',
        type: ['dtmf'],
        dtmf: {
          maxDigits: 1,
          submitOnHash: false,
          timeOut: 10,
        },
        eventUrl: [`${process.env.BASE_URL}/webhooks/dtmf`],
      }
    ]);
});

// ─── STEP 3: Receive keypress ────────────────────────────────────────────────
app.post('/webhooks/dtmf', (req, res) => {
    const body = req.body || {};
    const { uuid, dtmf, from, to } = body;
    const digit = dtmf?.digits;
  
    console.log(`DTMF | UUID: ${uuid} | User: ${to} | Pressed: "${digit}"`);
  
    const optionMap = {
      '1': 'Satisfied with service',
      '2': 'Needs support',
      '3': 'Opted out',
    };
  
    const selectedOption = optionMap[digit] || 'No input / Invalid';
  
    responseLog.push({
      call_uuid: uuid,
      phone_number: to,
      digit_pressed: digit || 'none',
      option: selectedOption,
      timestamp: new Date().toISOString(),
    });
  
    console.log(`Logged: ${to} → "${selectedOption}"`);

  let confirmationText;
  if (digit === '1') {
    confirmationText = 'Thank you for your positive feedback! Have a great day.';
  } else if (digit === '2') {
    confirmationText = 'We will have our support team reach out to you shortly. Thank you.';
  } else if (digit === '3') {
    confirmationText = 'You have been removed from our call list. Goodbye.';
  } else {
    confirmationText = 'We did not receive your input. Please call us back if you need assistance. Goodbye.';
  }

  res.json([
    {
      action: 'talk',
      text: confirmationText,
      language: 'en-IN',
    }
  ]);
});

// ─── Event webhook — FIXED to handle GET and POST ───────────────────────────
app.all('/webhooks/event', (req, res) => {
  // First event comes as GET with query params, rest come as POST with body
  const data = req.method === 'GET' ? req.query : (req.body || {});
  const { status, uuid, from, to } = data;

  console.log(`Event [${req.method}] | status: ${status} | uuid: ${uuid} | ${from} → ${to}`);

  res.status(200).end();
});

// ─── View responses ──────────────────────────────────────────────────────────
app.get('/responses', (req, res) => {
  res.json({ total: responseLog.length, responses: responseLog });
});

app.listen(3000, () => {
  console.log('   IVR server running on http://localhost:3000');
  console.log(`   Make a call: http://localhost:3000/call?to=919XXXXXXXXX`);
  console.log(`   View responses: http://localhost:3000/responses`);
});