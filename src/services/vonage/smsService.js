require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonageConfig = {
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey:    process.env.VONAGE_PRIVATE_KEY_PATH,
};

const vonageOptions = {};

const vonage = new Vonage(vonageConfig, vonageOptions);

async function sendSms({ to, text }) {
    const response = await vonage.messages.send({
        message_type: 'text',
        channel: 'sms',
        to,
        from: process.env.VONAGE_NUMBER || process.env.VONAGE_FROM_NUMBER,
        text,
    });
    return response;
}

module.exports = { sendSms };
