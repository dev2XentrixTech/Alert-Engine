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

const DISPATCH_STATUS = { 
  QUEUED: 1, 
  SENT: 2, 
  FAILED: 3, 
  DELIVERED: 4, 
  READ: 5 
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
  DISPATCH_STATUS, 
  SEQ_STATUS,
  CHANNEL_STR_TO_ID, 
  CONTACT_STR_TO_ID
};
