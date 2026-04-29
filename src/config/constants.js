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

const LOG_TABLE = {
  email:    'log_email',
  sms:      'log_sms',
  whatsapp: 'log_whatsapp',
  voice:    'log_voice',
  push:     'log_push',
  response: 'log_response',
  trigger:  'log_trigger',
};

module.exports = { ALERT_TYPE, CHANNEL, LOG_TABLE, ALERT_FLOW };
