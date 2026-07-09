require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
});


function resolveAudioUrl(audioPath) {
    if (!audioPath) return '';
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) return audioPath;
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
    const basePath   = (process.env.BASE_PATH  || '').trim();
    const filePath   = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
    return `${backendUrl}${basePath}${filePath}`;
}

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


async function makeTwoWayCall({ to, callUuid, ivrContext }) {
    const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

    const answerParams = new URLSearchParams({
        call_uuid:    callUuid,
        text:         ivrContext.text,
        audio_url:    ivrContext.audio_url || '',  
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
