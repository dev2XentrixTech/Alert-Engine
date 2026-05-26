/**
 * Appends reply options to any outgoing message when the alert is two-way.
 * Each channel formats it slightly differently for best UX.
 */

function buildOptionsText(template) {
    const lines = ['\n\nPlease reply with:'];
    for (let i = 1; i <= template.num_options; i++) {
        lines.push(`  ${i}. ${template[`option_${i}_text`]}`);
    }
    return lines.join('\n');
}

function buildTwoWayEmail(subject, body, template) {
    const optionsHtml = Array.from({ length: template.num_options }, (_, i) => {
        const n = i + 1;
        const label = template[`option_${n}_text`];
        // The response link hits our API endpoint
        return `<a href="${process.env.API_BASE_URL}/api/email/webhooks/response?trigger_id=${template.triggerId}&emp_id=${template.emp_id}&option=${n}" 
                   style="display:inline-block;margin:6px;padding:10px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold">
                    ${label}
                </a>`;
    }).join('\n');

    const appendedBody = `${body}
        <br/><br/>
        <p style="font-family:sans-serif;color:#333;"><strong>Please respond by clicking one of the options below:</strong></p>
        <div style="margin-top:8px;">${optionsHtml}</div>
    `;
    return { subject, body: appendedBody };
}

function buildTwoWaySmsText(smsText, template) {
    return smsText + buildOptionsText(template);
}

/**
 * NOTE: For WhatsApp, text building is now handled inside
 * whatsappService.sendTwoWayWhatsapp() which uses the WhatsAppText SDK class.
 * This function is kept for reference only and is no longer called.
 */
function buildTwoWayWhatsappText(whatsappText, template) {
    return whatsappText + buildOptionsText(template);
}

/**
 * NOTE: For two-way IVR calls this is NOT used — the answer webhook
 * (voiceWebhookRoutes.js /api/voice/webhooks/answer) builds the prompt
 * dynamically from the NCCO context. This is kept for one-way TTS only.
 */
function buildTwoWayVoiceText(voiceText, template) {
    const lines = [voiceText, ' Please press:'];
    for (let i = 1; i <= template.num_options; i++) {
        lines.push(`Press ${i} for ${template[`option_${i}_text`]}.`);
    }
    return lines.join(' ');
}

module.exports = {
    buildTwoWayEmail,
    buildTwoWaySmsText,
    buildTwoWayWhatsappText,
    buildTwoWayVoiceText,
};
