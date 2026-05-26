require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey:    process.env.VONAGE_PRIVATE_KEY_PATH,
});

/**
 * One-way outbound call.
 * Speaks the given text and hangs up. No input expected.
 *
 * @param {string} to   - E.164 phone number e.g. "918317280673"
 * @param {string} text - TTS message to speak
 * @returns Vonage call object { uuid, ... }
 */
async function makeOneWayCall({ to, text }) {
    return vonage.voice.createOutboundCall({
        to:   [{ type: 'phone', number: to }],
        from: { type: 'phone', number: process.env.VONAGE_NUMBER },
        ncco: [
            {
                action:   'talk',
                text,
                language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
                style:    0,
            },
        ],
    });
}

/**
 * Two-way IVR outbound call.
 * Vonage will hit the answer_url to fetch the NCCO (which we serve dynamically),
 * then hit dtmf_url when the user presses a key.
 *
 * The answer_url and dtmf_url must be publicly reachable (ngrok / production URL).
 *
 * @param {string} to          - E.164 phone number
 * @param {string} callUuid    - A pre-generated ID to correlate the call back to a job
 *                               (we embed it in the answer_url query string)
 * @param {object} ivrContext  - { text, num_options, option_1_text, ... }
 * @returns Vonage call object { uuid, ... }
 */
async function makeTwoWayCall({ to, callUuid, ivrContext }) {
    const base = process.env.API_BASE_URL; // e.g. https://abc.ngrok-free.app

    // We embed everything Vonage needs to serve the NCCO in the answer_url,
    // so our stateless answer handler can reconstruct the prompt without a DB hit.
    const answerParams = new URLSearchParams({
        call_uuid:    callUuid,
        text:         ivrContext.text,
        num_options:  ivrContext.num_options,
        option_1_text: ivrContext.option_1_text || '',
        option_2_text: ivrContext.option_2_text || '',
        option_3_text: ivrContext.option_3_text || '',
    });

    console.log(answerParams);

    return vonage.voice.createOutboundCall({
        to:         [{ type: 'phone', number: to }],
        from:       { type: 'phone', number: process.env.VONAGE_NUMBER },
        answer_url: [`${base}/api/voice/webhooks/answer?${answerParams.toString()}`],
        event_url:  [`${base}/api/voice/webhooks/event`],
    });
}

module.exports = { makeOneWayCall, makeTwoWayCall };
