// one-way-call.js
require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
});

async function makeOutboundCall(toNumber) {
  try {
    const response = await vonage.voice.createOutboundCall({
      to: [{ type: 'phone', number: toNumber }],
      from: { type: 'phone', number: process.env.VONAGE_NUMBER },
      ncco: [
        {
          action: 'talk',
          text: 'Hello! This is an automated message from our service. Thank you for being our customer. Goodbye!',
          language: 'en-IN',   // Indian English — change to en-US, en-GB as needed
          style: 0,
        }
      ]
    });

    console.log(`Call initiated → UUID: ${response.uuid}`);
  } catch (err) {
    console.error('Call failed:', err.message);
  }
}

// Run directly: node one-way-call.js
makeOutboundCall(process.env.TARGET_NUMBER);