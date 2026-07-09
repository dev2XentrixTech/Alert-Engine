const ALERT_TYPE = {
  ONE_WAY: 1,
  TWO_WAY: 2
};

const ALERT_FLOW = { 
  ALL_IN:     1, 
  ESCALATION: 2 
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

const QUEUE_STATUS = {
  QUEUED:           1,  
  DISPATCHED:       2,  
  DISPATCH_FAILED:  3,  
};

const DELIVERY_STATUS = {
  DELIVERED: 1,  
  FAILED:    2,
};

const READ_EVENT = 'read';

const PROVIDER_EVENT = {
  SUBMITTED: 'submitted',
  DELIVERED: 'delivered',
  READ:      'read',
  REJECTED:  'rejected',
  FAILED:    'failed',

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

const CHANNEL_STR_TO_ID = {
  email: 1, 
  sms: 2, 
  whatsapp: 3, 
  voice_call: 4, 
  app: 5
};

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
