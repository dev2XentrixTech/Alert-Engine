const { encryptData } = require('./utilities');

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

        const payload = JSON.stringify({
            trigger_id: template.triggerId,
            emp_id:     template.emp_id,
            option:     n,
            email:      template.contact_value,
        });
        const token = encryptData(payload);

        return `<a href="${process.env.API_BASE_URL}/api/email/webhooks/response?token=${encodeURIComponent(token)}" 
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

module.exports = {
    buildTwoWayEmail,
    buildTwoWaySmsText,
};
