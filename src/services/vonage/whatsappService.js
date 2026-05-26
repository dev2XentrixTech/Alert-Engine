require('dotenv').config();
const { Vonage }      = require('@vonage/server-sdk');
const { WhatsAppText } = require('@vonage/messages');

// ─── Sandbox vs Production configuration ─────────────────────────────────────
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

const FROM_NUMBER = process.env.VONAGE_WHATSAPP_NUMBER; // e.g. "14157386102"

/**
 * Send a one-way WhatsApp text message. No reply expected.
 *
 * @param {string} to   - E.164 phone number e.g. "918317280673"
 * @param {string} text - Message body
 * @returns {{ messageUUID: string }} Vonage response
 */
async function sendOneWayWhatsapp({ to, text }) {
    const result = await vonage.messages.send(
        new WhatsAppText({ from: FROM_NUMBER, to, text })
    );
    return result; // { messageUUID }
}

/**
 * Send a two-way WhatsApp message with numbered options appended.
 * The options are appended here as plain text so the user can reply "1", "2", etc.
 * The reply is captured by the inbound webhook and routed to the response-inbound queue.
 *
 * @param {string}   to          - E.164 phone number
 * @param {string}   text        - Base alert message
 * @param {object}   ivrContext  - { num_options, option_1_text, option_2_text, option_3_text }
 * @returns {{ messageUUID: string }}
 */
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
    return result; // { messageUUID }
}

module.exports = { sendOneWayWhatsapp, sendTwoWayWhatsapp };
