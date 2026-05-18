require('dotenv').config();
// const { sendSms } = require('./src/services/vonage/smsService');
// const { sendWhatsapp } = require('./src/services/vonage/whatsappService');
// const { sendVoiceCall } = require('./src/services/vonage/voiceService');
const { sendEmail } = require('./src/services/emailService');

const testPhone = process.argv[2]; 

async function runTest() {
    // if (!testPhone) {
    //     console.error('Please provide a phone number. Example: node test-vonage.js +919876543210');
    //     process.exit(1);
    // }

    console.log(`Starting Vonage tests for ${testPhone}...`);

    // try {
    //     console.log('\n--- 1. Testing SMS ---');
    //     // const smsResult = await sendSms({ to: testPhone, text: 'This is a test SMS from Alert Notification MS.' });
    //     const smsResult = await sendWhatsapp({ to: testPhone, text: 'This is a test SMS from Alert Notification MS.' });
    //     console.dir(smsResult, { depth: null });
    //     console.log(' SMS sent successfully.');
    // } catch (err) {
    //     console.error(' SMS failed:', err.message);
    // }

    // try {
    //     console.log('\n--- 2. Testing WhatsApp ---');
    //     // You can add options here if you are testing TWO_WAY messages
    //     const waResult = await sendWhatsapp({ to: `${testPhone}`, text: 'This is a test WhatsApp from Alert Notification MS.' });
    //     console.dir(waResult, { depth: null });
    //     console.log(' WhatsApp sent successfully.');
    // } catch (err) {
    //     console.error(' WhatsApp failed:', err.message);
    // }

    // try {
    //     console.log('\n--- 3. Testing Voice Call ---');
    //     const voiceResult = await sendVoiceCall({ to: testPhone, text: 'This is a test voice call from Alert Notification MS.' });
    //     console.dir(voiceResult, { depth: null });
    //     console.log(' Voice Call sent successfully.');
    // } catch (err) {
    //     console.error(' Voice Call failed:', err.message);
    // }

    try {
        console.log('\n--- 2. Testing Email ---');
        // You can add options here if you are testing TWO_WAY messages
        // isSent = await sendEmail(email, subject, htmlMessage);
        const waResult = await sendEmail('saurabh@xentrixtechnologies.com', 'test mail', 'Testing');
        console.dir(waResult, { depth: null });
        console.log(' Email sent successfully.');
    } catch (err) {
        console.error(' WhatsApp failed:', err.message);
    }

    console.log('\nAll tests complete.');
    process.exit(0);
}

runTest();
