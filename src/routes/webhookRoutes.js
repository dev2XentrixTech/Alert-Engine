const { Router } = require('express');
const crypto     = require('crypto');
const { addJob } = require('../queues/queueManager');
const Q          = require('../config/queueNames');

const router = Router();

function validateVonageSignature(req) {
  const secret    = process.env.VONAGE_SIGNATURE_SECRET;
  const signature = req.headers['x-vonage-signature'] || req.headers['x-nexmo-signature'];
  if (!secret || !signature) return false;

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

router.post('/webhook/response', async (req, res) => {
  if (!validateVonageSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  await addJob(Q.RESPONSE_INBOUND, req.body);
  return res.status(200).json({ ok: true });
});

module.exports = router;
