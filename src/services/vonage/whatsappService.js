require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey:    process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

async function sendWhatsapp({ to, text }) {
  return vonage.messages.send({
    message_type: 'text',
    text,
    to,
    from:    process.env.VONAGE_WHATSAPP_NUMBER,
    channel: 'whatsapp',
  });
}

module.exports = { sendWhatsapp };
