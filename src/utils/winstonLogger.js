const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({ 
        filename: path.join(__dirname, '../../logs/error.log'), 
        level: 'error' 
    }),
    new winston.transports.File({ 
        filename: path.join(__dirname, '../../logs/app.log') 
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        // ANSI escape codes for premium coloring
        const gray = '\x1b[90m';
        const reset = '\x1b[0m';
        const bright = '\x1b[1m';
        const cyan = '\x1b[36m';
        const green = '\x1b[32m';
        const yellow = '\x1b[33m';
        const magenta = '\x1b[35m';
        const red = '\x1b[31m';

        // Detect prefixes/tags in the message to apply custom high-end colors
        let processedMessage = message;
        if (typeof processedMessage !== 'string') {
          try {
            processedMessage = JSON.stringify(processedMessage);
          } catch (e) {
            processedMessage = String(processedMessage);
          }
        }
        
        const tags = [
          { pattern: /\[EMAIL\]/gi, color: cyan },
          { pattern: /\[SMS\]/gi, color: yellow },
          { pattern: /\[WHATSAPP\]/gi, color: green },
          { pattern: /\[VOICE\]/gi, color: magenta },
          { pattern: /\[SmsWebhook\]/gi, color: yellow + bright },
          { pattern: /\[WhatsAppWebhook\]/gi, color: green + bright },
          { pattern: /\[VoiceWebhook\]/gi, color: magenta + bright },
          { pattern: /\[ResponseWorker\]/gi, color: cyan + bright },
          { pattern: /\[SequentialCron\]/gi, color: cyan },
          { pattern: /\[Cron\]/gi, color: cyan },
          { pattern: /\[RAW PAYLOAD\]/gi, color: bright + gray }
        ];

        for (const tag of tags) {
          processedMessage = processedMessage.replace(tag.pattern, (m) => `${tag.color}${m}${reset}`);
        }

        let msg = `${gray}${timestamp}${reset} [${level}]: ${processedMessage}`;

        if (Object.keys(metadata).length > 0) {
          if (metadata.stack) {
            msg += `\n${red}${metadata.stack}${reset}`;
          } else {
            try {
              // Pretty print and colorize JSON metadata lines
              const prettyMeta = JSON.stringify(metadata, null, 2)
                .split('\n')
                .map(line => `  ${gray}${line}${reset}`)
                .join('\n');
              msg += `\n${prettyMeta}`;
            } catch (e) {
              msg += ` ${gray}${JSON.stringify(metadata)}${reset}`;
            }
          }
        }
        return msg;
      })
    )
  }));
}

module.exports = logger;
