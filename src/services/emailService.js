require('dotenv').config();
const nodeMailer = require('nodemailer');

const transportor = nodeMailer.createTransport(
    {
        secure:true,
        host:process.env.MAIL_HOST,
        port:process.env.MAIL_PORT,
        auth:{
            user:process.env.MAIL_USER,
            pass:process.env.MAIL_PASS
        }
    }
)

async function sendEmail(to, subject, message){

    try {

        const info = await transportor.sendMail({
            from:`"${process.env.MAIL_FROM}" <${process.env.MAIL_USER}>`,
            to:to,
            subject:subject,
            html:message
        });

        console.log(info);
        return [true, info];

    } catch (error) {
        return [false, error];
    }

}

module.exports = { sendEmail };