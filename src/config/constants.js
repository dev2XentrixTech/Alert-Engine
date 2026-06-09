const ALERT_TYPE = {
  ALL_IN:     1,
  SEQUENTIAL: 2,
};

const ALERT_FLOW = { 
  ONE_WAY: 1, 
  TWO_WAY: 2 
};

const CHANNEL = {
  EMAIL:     'email',
  SMS:       'sms',
  WHATSAPP:  'whatsapp',
  VOICE:     'voice_call',
  PUSH:      'app',
};

const triggerStatus = {
  PENDING: 1,
  PROCESSING: 2,
  COMPLETED: 3,
  FAILED: 4
};

// ── QUEUE_STATUS ──────────────────────────────────────────────────────────────
// Written by OUR workers (triggerCron, emailWorker, smsWorker, voiceWorker).
// Tracks where a dispatch is in OUR internal pipeline.
// Column: trigger_dispatch_log.queue_status
const QUEUE_STATUS = {
  QUEUED:           1,  // Row created, BullMQ job enqueued. Worker hasn't run yet.
  DISPATCHED:       2,  // Worker called Vonage API successfully. Provider accepted.
  DISPATCH_FAILED:  3,  // All BullMQ retries exhausted. Never reached Vonage.
};

// ── DELIVERY_STATUS ───────────────────────────────────────────────────────────
// Written by logWriteWorker from Vonage STATUS WEBHOOKS only.
// Tracks what Vonage confirmed about network delivery.
// Column: trigger_dispatch_log.delivery_status  (NULL = no webhook received yet)
const DELIVERY_STATUS = {
  DELIVERED: 1,  // Network confirmed delivery:
                 //   SMS/WA:  "submitted" or "delivered" webhook
                 //   Voice:   "ringing"/"answered"/"completed"/"busy"/"rejected"
                 //   Email:   not available (SMTP has no DLR)
  FAILED:    2,  // Network delivery failed:
                 //   SMS/WA:  "rejected" or "failed" webhook
                 //   Voice:   "failed" webhook
};

// ── READ (event-log only) ─────────────────────────────────────────────────────
// WhatsApp "read" webhook — stored only in dispatch_event_log.event_type.
// Never written to trigger_dispatch_log.
const READ_EVENT = 'read';

// Raw provider event strings — what Vonage actually sends in webhook bodies.
// Stored as-is in dispatch_event_log.event_type for faithful audit records.
// These are NOT the same as QUEUE_STATUS or DELIVERY_STATUS codes.
const PROVIDER_EVENT = {
  // Messages API (SMS + WhatsApp)
  SUBMITTED: 'submitted',
  DELIVERED: 'delivered',
  READ:      'read',
  REJECTED:  'rejected',
  FAILED:    'failed',

  // Voice API call lifecycle
  RINGING:   'ringing',
  STARTED:   'started',
  ANSWERED:  'answered',
  COMPLETED: 'completed',
  BUSY:      'busy',
};


const SEQ_STATUS = { 
  PENDING: 1, 
  DISPATCHED: 2, 
  COMPLETED: 3, 
  FAILED: 4, 
  FINAL_WAIT: 5, 
  CANCELLED: 6 
};

// Maps channel string → channel ID
const CHANNEL_STR_TO_ID = {
  email: 1, 
  sms: 2, 
  whatsapp: 3, 
  voice_call: 4, 
  app: 5
};

// Maps contact string → contact type ID  
const CONTACT_STR_TO_ID = {
  official: 1, 
  personal: 2, 
  emergency: 3
};

module.exports = { 
  ALERT_TYPE, 
  CHANNEL,
  ALERT_FLOW, 
  triggerStatus,
  QUEUE_STATUS,
  DELIVERY_STATUS,
  READ_EVENT,
  PROVIDER_EVENT,
  SEQ_STATUS,
  CHANNEL_STR_TO_ID, 
  CONTACT_STR_TO_ID
};
