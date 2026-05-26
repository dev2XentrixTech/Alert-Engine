const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  applicationId:  '',
  privateKey: './private.key'
});

const text = "👋Hello from Vonage";

vonage.messages
  .send({
    text: text,
    message_type: "text",
    to: 9183173,
    from: 46790965228,
    channel: "sms",
  })
  .then((resp) => console.log(resp.message_uuid))
  .catch((err) => console.error(err));
