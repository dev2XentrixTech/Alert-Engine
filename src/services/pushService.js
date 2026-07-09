require('dotenv').config();

async function sendPush({ device_token, platform, title, body }) {
  const payload = {
    message: {
      token:        device_token,
      notification: { title, body },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.FCM_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FCM error: ${err}`);
  }

  return res.json();
}

module.exports = { sendPush };
