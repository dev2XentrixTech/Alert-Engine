const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  applicationId:  '40df5676-1b47-45fa-b33c-7cbad50eacd5',
  privateKey: './private.key'
});

const text = "👋Hello from Vonage";

vonage.messages
  .send({
    text: text,
    message_type: "text",
    to: 918317280673,
    from: 46790965228,
    channel: "sms",
  })
  .then((resp) => console.log(resp.message_uuid))
  .catch((err) => console.error(err));