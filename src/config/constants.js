const ALERT_TYPE = {
  ALL_IN:     1,
  SEQUENTIAL: 2,
};

const CHANNEL = {
  EMAIL:     'email',
  SMS:       'sms',
  WHATSAPP:  'whatsapp',
  VOICE:     'voice',
  PUSH:      'push',
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

module.exports = { ALERT_TYPE, CHANNEL, LOG_TABLE };
