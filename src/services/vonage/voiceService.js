require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
});

/**
 * Resolves a (potentially relative) audio file path to a fully-qualified public URL
 * that Vonage can reach.  Uses API_BASE_URL so http/https is controlled entirely
 * by the environment — no code changes needed when going to production.
 *
 * Examples:
 *   '/uploads/alert-audio/file.ogg'  →  'https://abc.ngrok.app/uploads/alert-audio/file.ogg'
 *   'https://cdn.example.com/a.mp3'  →  'https://cdn.example.com/a.mp3'  (unchanged)
 *
 * @param {string} audioPath - Relative path or full URL
 * @returns {string} Fully-qualified URL
 */
function resolveAudioUrl(audioPath) {
    if (!audioPath) return '';
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) return audioPath;
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
    const basePath   = (process.env.BASE_PATH  || '').trim();
    // const basePath   = (process.env.BASE_PATH  || '').trim().replace(/\/$/, '');
    const filePath   = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
    return `${backendUrl}${basePath}${filePath}`;
}

/**
 * One-way outbound call.
 * If audioUrl is provided, streams the audio file instead of TTS.
 * Falls back to TTS (text) when no audio URL is given.
 *
 * @param {string} to       - E.164 phone number e.g. "918317280673"
 * @param {string} text     - TTS message to speak (used when no audioUrl)
 * @param {string} audioUrl - Optional relative/absolute path of the audio file
 *                            (e.g. "/uploads/alert-audio/file.ogg").  The server
 *                            base URL is prepended automatically.
 * @returns Vonage call object { uuid, ... }
 */
async function makeOneWayCall({ to, text, audioUrl }) {
    let messageAction;
    if (audioUrl) {
        messageAction = {
            action: 'stream',
            streamUrl: [resolveAudioUrl(audioUrl)],
            level: 0,
            bargeIn: false,
        };
    } else {
        messageAction = {
            action: 'talk',
            text,
            language: process.env.VONAGE_VOICE_LANGUAGE || 'en-IN',
            style: 0,
        };
    }

    return vonage.voice.createOutboundCall({
        to:   [{ type: 'phone', number: to }],
        from: { type: 'phone', number: process.env.VONAGE_NUMBER },
        ncco: [messageAction],
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
    const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

    // We embed everything Vonage needs to serve the NCCO in the answer_url,
    // so our stateless answer handler can reconstruct the prompt without a DB hit.
    const answerParams = new URLSearchParams({
        call_uuid:    callUuid,
        text:         ivrContext.text,
        audio_url:    ivrContext.audio_url || '',   // empty string if not provided
        num_options:  ivrContext.num_options,
        option_1_text: ivrContext.option_1_text || '',
        option_2_text: ivrContext.option_2_text || '',
        option_3_text: ivrContext.option_3_text || '',
    });

    console.log(answerParams);

    return vonage.voice.createOutboundCall({
        to: [{ type: 'phone', number: to }],
        from: { type: 'phone', number: process.env.VONAGE_NUMBER },
        answer_url: [`${base}/api/voice/webhooks/answer?${answerParams.toString()}`],
        event_url: [`${base}/api/voice/webhooks/event`],
    });
}

module.exports = { makeOneWayCall, makeTwoWayCall, resolveAudioUrl };
