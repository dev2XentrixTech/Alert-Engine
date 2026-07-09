require('dotenv').config();
const { Vonage }      = require('@vonage/server-sdk');
const { WhatsAppText } = require('@vonage/messages');

// Sandbox: uses https://messages-sandbox.nexmo.com as the API host.
// Production: standard Vonage endpoint (no apiHost override needed).
//
// Control via IS_SANDBOX=true in your .env
const vonageConfig = {
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey:    process.env.VONAGE_PRIVATE_KEY_PATH,
};

const vonageOptions = process.env.IS_SANDBOX === 'true'
    ? { apiHost: 'https://messages-sandbox.nexmo.com' }
    : {};

const vonage = new Vonage(vonageConfig, vonageOptions);

const FROM_NUMBER = process.env.VONAGE_WHATSAPP_NUMBER;


async function sendOneWayWhatsapp({ to, text }) {
    const result = await vonage.messages.send(
        new WhatsAppText({ from: FROM_NUMBER, to, text })
    );
    return result; 
}

async function sendTwoWayWhatsapp({ to, text, ivrContext }) {
    const n = parseInt(ivrContext.num_options) || 2;
    const optionLines = [];
    for (let i = 1; i <= n; i++) {
        const label = ivrContext[`option_${i}_text`] || `Option ${i}`;
        optionLines.push(`${i}. ${label}`);
    }

    const fullText =
        `${text}\n\n` +
        `Please reply with a number:\n` +
        optionLines.join('\n') +
        `\n\nReply with ${Array.from({ length: n }, (_, i) => i + 1).join(', ')}`;

    const result = await vonage.messages.send(
        new WhatsAppText({ from: FROM_NUMBER, to, text: fullText })
    );
    return result; 
}

module.exports = { sendOneWayWhatsapp, sendTwoWayWhatsapp };
