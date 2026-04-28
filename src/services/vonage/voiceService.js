require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey:       process.env.VONAGE_API_KEY,
  apiSecret:    process.env.VONAGE_API_SECRET,
});

async function makeVoiceCall({ to, text }) {
  return vonage.voice.createOutboundCall({
    to:   [{ type: 'phone', number: to }],
    from: { type: 'phone', number: process.env.VONAGE_VOICE_NUMBER },
    ncco: [{ action: 'talk', text }],
  });
}

module.exports = { makeVoiceCall };
