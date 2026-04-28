require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey:    process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

async function sendSms({ to, text }) {
  return vonage.sms.send({ to, from: process.env.VONAGE_FROM_NUMBER || 'AlertEm', text });
}

module.exports = { sendSms };
