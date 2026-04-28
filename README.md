# alert-notification-ms

Standalone alert dispatch microservice for AlertEm. Handles up to 100K recipients per trigger across five channels with per-channel backpressure, isolated DLQs, sequential/all-in delivery modes, and async batch logging.

This service is **completely separate** from the main `alert-system` app — its own process, its own DB pool, its own Redis connection.

---

## Folder Structure

```
alert-notification-ms/
├── server.js                        # Entry: init queues → start workers → start HTTP
├── app.js                           # Express (webhook routes only)
├── package.json
├── .env.example
└── src/
    ├── config/
    │   ├── queueNames.js            # All queue/DLQ name constants (single source of truth)
    │   ├── channelConfig.js         # Per-channel concurrency + rate limiter settings
    │   └── constants.js             # ALERT_TYPE, CHANNEL, LOG_TABLE enums
    ├── queues/
    │   ├── redisConnection.js       # Shared BullMQ Redis connection config
    │   ├── queueFactory.js          # initQueues() + getQueue() — all Queue objects
    │   ├── queueManager.js          # addJob(name, data, opts) helper
    │   └── workerFactory.js         # startAllWorkers() — wires registry → BullMQ Workers
    ├── workers/
    │   ├── resolverWorker.js        # Expands template → per-employee per-channel jobs
    │   ├── logWorker.js             # Batch-flush log entries to MySQL
    │   ├── responseWorker.js        # Processes inbound Vonage webhook payloads
    │   ├── dlqDrainWorker.js        # Drains DLQs to log_failed table every 10 min
    │   └── channels/
    │       ├── emailWorker.js
    │       ├── smsWorker.js
    │       ├── whatsappWorker.js
    │       ├── voiceWorker.js
    │       └── pushWorker.js
    ├── services/
    │   ├── employeeResolver.js      # Fetches employees by grp_ids / emp_ids
    │   ├── emailService.js          # Nodemailer wrapper
    │   ├── pushService.js           # FCM HTTP v1 push sender
    │   └── vonage/
    │       ├── smsService.js
    │       ├── whatsappService.js
    │       └── voiceService.js
    ├── routes/
    │   └── webhookRoutes.js         # POST /webhook/response (Vonage inbound)
    ├── db/
    │   ├── connection.js            # MySQL2 pool
    │   └── migrations/
    │       └── 001_log_tables.sql   # All log tables + push_tokens schema
    └── utils/
        ├── logger.js                # enqueueLog() — all workers use this
        ├── sequentialNext.js        # Advances sequential alert to next channel
        └── retryPolicy.js           # channelRetry + logRetry configs
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Runtime | Node.js |
| HTTP | Express v4 (webhook only) |
| Queue / Workers | BullMQ (Redis-backed) |
| Database | MySQL2 (connection pool) |
| Email | Nodemailer |
| SMS / WhatsApp / Voice | Vonage Server SDK v3 |
| Push | FCM HTTP v1 |

---

## Queue Topology

```
[main app] ──addJob──▶ alert-dispatch
                            │
                     resolverWorker
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
        channel:email  channel:sms  channel:whatsapp  channel:voice  channel:push
              │             │              │
           (fail)        (fail)         (fail)
              ▼             ▼              ▼
          dlq:email     dlq:sms     dlq:whatsapp  dlq:voice  dlq:push
                                                        │
                                               dlqDrainWorker (10min)
                                                        │
                                                  log_failed (MySQL)

[Vonage webhook] ──▶ POST /webhook/response
                            │
                     response:inbound
                            │
                     responseWorker

All workers ──enqueueLog──▶ log:write
                                │
                           logWorker (batch flush 500ms / 100 records)
                                │
                    log_email / log_sms / log_whatsapp / log_voice / log_push / log_response / log_trigger
```

---

## Key Architecture Decisions

### 1. Registry-Driven Workers (Open/Closed Principle)
`channelConfig.js` is the single registry for all channel settings (queue name, DLQ name, concurrency, rate limiter). `workerFactory.js` and `queueFactory.js` iterate over it — **adding a new channel requires only a new entry in `channelConfig.js` and a new handler file**. No other files change.

### 2. Per-Channel DLQs
Each channel has its own DLQ (`dlq:email`, `dlq:sms`, etc.). This means:
- SMS failures (Vonage API errors) can be retried independently from email failures (SMTP timeouts)
- You can purge, inspect, or replay one channel's failures without touching others
- DLQ entries store only `{ trigger_id, emp_id, channel, error_message }` — never the full payload — keeping Redis memory bounded

### 3. DLQ Memory Safety
Three layers prevent Redis OOM under heavy failure load:
1. `removeOnFail: { count: 500 }` on every DLQ — rolling window, old entries evicted automatically
2. `dlqDrainWorker.js` runs every 10 minutes — moves DLQ entries to `log_failed` in MySQL, then removes them from Redis
3. DLQ jobs store only a pointer (IDs + error), not the full employee/template payload

### 4. Async Batch Logging
All workers call `enqueueLog()` which adds a job to `log:write`. The `logWorker` accumulates entries in a memory buffer and flushes via batch `INSERT` every 500ms or when 100 entries accumulate. This completely decouples the hot notification path from DB write latency.

### 5. Sequential vs All-In Alert Types
Controlled by `alert_type` on the template:
- `alert_type = 1` (ALL_IN): resolver fans out all channel jobs simultaneously for each employee
- `alert_type = 2` (SEQUENTIAL): resolver enqueues only the first channel job. Each channel worker calls `sequentialNext()` on success, which increments `channelIndex` and enqueues the next channel job

For channels that support delivery receipts (SMS, WhatsApp, Voice), sequential advancement can be deferred to the `responseWorker` by setting `SMS_SEQUENTIAL_ON_RECEIPT=true`. The `responseWorker` calls `sequentialNext()` when it receives a `delivered`/`answered` status from Vonage.

### 6. Backpressure Per Channel
BullMQ `limiter` on each Worker caps throughput at the channel level:

| Channel | Max jobs/sec | Concurrency |
|---|---|---|
| email | 50 | 10 |
| sms | 200 | 20 |
| whatsapp | 100 | 15 |
| voice | 30 | 5 |
| push | 500 | 50 |

These are tuned to avoid hammering SMTP servers or Vonage rate limits. Adjust in `channelConfig.js`.

### 7. Webhook Security
`POST /webhook/response` validates the Vonage HMAC-SHA256 signature before doing anything. The handler does the absolute minimum: validate → enqueue → return 200. All processing is async in `responseWorker`.

---

## Database Schema

Run `src/db/migrations/001_log_tables.sql` against your MySQL database.

Tables created:
- `log_trigger` — one row per alert trigger dispatch
- `log_email`, `log_sms`, `log_whatsapp`, `log_voice`, `log_push` — per-send records
- `log_response` — inbound delivery receipts and replies
- `log_failed` — durable record of all DLQ failures (written by dlqDrainWorker)
- `push_tokens` — device token registry (`emp_id`, `device_token`, `platform`)

All log tables share the same columns: `id`, `trigger_id`, `emp_id`, `status`, `error_message`, `channel`, `created_at`.

---

## How to Integrate with the Main App

The main `alert-system` app triggers a dispatch by calling the microservice's queue directly (shared Redis) or via HTTP. The simplest approach is shared Redis:

```js
// In alert-system's triggerAlertController.js
const { Queue } = require('bullmq');
const dispatchQueue = new Queue('alert-dispatch', { connection: { url: process.env.REDIS_URL } });

await dispatchQueue.add('alert-dispatch', {
  template_id: template.id,
  trigger_id:  trigger.id,
});
```

The microservice picks it up from Redis — no HTTP call needed between services.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP server port (default: 4000) |
| `REDIS_URL` | Redis connection URL |
| `DB_HOST/PORT/USER/PASS/NAME` | MySQL connection |
| `VONAGE_API_KEY` / `VONAGE_API_SECRET` | Vonage credentials |
| `VONAGE_SIGNATURE_SECRET` | HMAC validation for webhooks |
| `VONAGE_FROM_NUMBER` | SMS sender ID |
| `VONAGE_WHATSAPP_NUMBER` | WhatsApp sender number |
| `VONAGE_VOICE_NUMBER` | Voice caller ID |
| `SMTP_HOST/PORT/USER/PASS` | Nodemailer SMTP config |
| `FCM_PROJECT_ID` / `FCM_ACCESS_TOKEN` | Firebase push credentials |
| `SMS_SEQUENTIAL_ON_RECEIPT` | `true` = wait for Vonage DLR before advancing sequential flow |
| `WHATSAPP_SEQUENTIAL_ON_RECEIPT` | Same for WhatsApp |
| `VOICE_SEQUENTIAL_ON_RECEIPT` | Same for Voice |

---

## Getting Started

```bash
cd alert-notification-ms
npm install
cp .env.example .env
# fill in .env values

# Run migrations
mysql -u root -p alertem < src/db/migrations/001_log_tables.sql

# Start
npm start
```
