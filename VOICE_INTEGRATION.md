# Voice Call Integration — Documentation

## Architecture Overview

```
[Worker] voiceWorker.js
    │
    ├─ isTwoWay = false ──► makeOneWayCall()  ──► Vonage (inline NCCO, no webhooks needed)
    │
    └─ isTwoWay = true  ──► makeTwoWayCall()  ──► Vonage (answer_url → IVR flow)
                                                        │
                            ┌───────────────────────────┘
                            │
                  Vonage hits answer_url
                            │
                            ▼
              GET /api/voice/webhooks/answer
              (Serves NCCO: speak options + listen for DTMF)
                            │
                  User presses a digit
                            │
                            ▼
              POST /api/voice/webhooks/dtmf
              (Queues response → response-inbound → responseWorker)
                            │
              Speaks confirmation → call ends
                            │
                            ▼
              POST /api/voice/webhooks/event
              (Logs: ringing → started → answered → completed)
```

---

## File Changes

| File | What changed |
|---|---|
| `src/services/vonage/voiceService.js` | Completely rewritten. Exports `makeOneWayCall` and `makeTwoWayCall` |
| `src/workers/channels/voiceWorker.js` | Routes to correct call type based on `isTwoWay` flag |
| `src/routes/voiceWebhookRoutes.js` | **NEW** — IVR answer, DTMF capture, and event logging |
| `src/routes/webhookRoutes.js` | All existing webhook paths renamed to channel-namespaced URLs |
| `app.js` | Mounts `voiceWebhooks`; adds `urlencoded` middleware for Vonage voice payloads |

---

## Environment Variables Required

Add these to your `.env`:

```env
# Vonage Application credentials (for voice — uses JWT auth, NOT API key/secret)
VONAGE_APPLICATION_ID=40df5676-1b47-45fa-b33c-7cbad50eacd5
VONAGE_PRIVATE_KEY_PATH=./private.key

# Your Vonage virtual number for outbound calls
VONAGE_VOICE_NUMBER=46790965228

# Your public base URL (ngrok in dev, your domain in prod)
API_BASE_URL=https://abc.ngrok-free.app

# Language code for TTS (optional, defaults to en-IN)
VONAGE_VOICE_LANGUAGE=en-IN
```

> **Important**: Voice calls require **Application credentials** (JWT), not API key + secret.
> Your `private.key` file must be in the project root or at the path you specify.

---

## Webhook Endpoints — Full Reference

### Voice Webhooks

| Method | Path | Called by | Purpose |
|---|---|---|---|
| `GET / POST` | `/api/voice/webhooks/answer` | Vonage | Serves NCCO (the script for the call) |
| `POST` | `/api/voice/webhooks/dtmf` | Vonage | Receives digit pressed by user |
| `GET / POST` | `/api/voice/webhooks/event` | Vonage | Lifecycle events (ringing, answered, completed) |

### SMS Webhooks

| Method | Path | Called by | Purpose |
|---|---|---|---|
| `POST` | `/api/sms/webhooks/inbound` | Vonage | User replies to a two-way SMS |

### WhatsApp Webhooks

| Method | Path | Called by | Purpose |
|---|---|---|---|
| `POST` | `/api/whatsapp/webhooks/inbound` | Vonage | User replies to a two-way WhatsApp message |

### Email Webhooks

| Method | Path | Called by | Purpose |
|---|---|---|---|
| `GET` | `/api/email/webhooks/response` | Browser (user clicks email button) | User clicks an option button in the alert email |

---

## How to Configure in Vonage Dashboard

Go to your Vonage Application → **Capabilities → Voice** and set:

| Field | Value |
|---|---|
| **Answer URL** | `https://your-domain.com/api/voice/webhooks/answer` |
| **Event URL** | `https://your-domain.com/api/voice/webhooks/event` |
| **Method** | GET (for Answer), POST (for Event) |

> The Answer URL set in the dashboard is a **fallback**. For two-way calls, `voiceService.js`
> overrides it per-call by passing `answer_url` directly in `createOutboundCall`. This is intentional —
> it allows us to embed IVR context in the URL without a DB lookup.

For SMS inbound, go to **Numbers → Your Number → SMS Settings** and set:

| Field | Value |
|---|---|
| **Inbound Webhook URL** | `https://your-domain.com/api/sms/webhooks/inbound` |
| **HTTP Method** | POST |

For WhatsApp inbound, go to **Messages API → Inbound Webhook** and set:

| Field | Value |
|---|---|
| **Inbound URL** | `https://your-domain.com/api/whatsapp/webhooks/inbound` |

---

## How the Two-Way IVR Call Works (Step by Step)

### 1. Dispatch (voiceWorker.js)

```
job.data = {
  isTwoWay: true,
  contact_value: "918317280673",
  voice_call_text: "Flood alert in your area.",
  num_options: 2,
  option_1_text: "Safe",
  option_2_text: "Need help",
  triggerId: 7,
  emp_id: 3,
}
```

Worker generates `callUuid = "7-3-{random-uuid}"` and calls `makeTwoWayCall()`.

### 2. Vonage Makes the Call

Vonage hits `answer_url`:
```
GET /api/voice/webhooks/answer?call_uuid=7-3-abc...&text=Flood+alert...&num_options=2&option_1_text=Safe&option_2_text=Need+help
```

### 3. Answer Handler Responds with NCCO

```json
[
  {
    "action": "talk",
    "text": "Flood alert in your area. Press 1 for Safe. Press 2 for Need help. Press hash to confirm.",
    "bargeIn": true
  },
  {
    "action": "input",
    "type": ["dtmf"],
    "dtmf": { "maxDigits": 1, "submitOnHash": true, "timeOut": 10 },
    "eventUrl": ["https://your-domain.com/api/voice/webhooks/dtmf?call_uuid=7-3-abc..."]
  }
]
```

### 4. User Presses a Digit

Vonage hits:
```
POST /api/voice/webhooks/dtmf?call_uuid=7-3-abc...
Body: { "dtmf": { "digits": "1" }, "uuid": "vonage-call-uuid", "to": "918317280673" }
```

### 5. DTMF Handler Parses and Queues

Splits `call_uuid = "7-3-abc..."` → `trigger_id = 7`, `emp_id = 3`.

Pushes to `response-inbound` BullMQ queue:
```json
{ "channel": "voice_call", "contact_value": "918317280673", "raw_reply": "1", "trigger_id": 7, "emp_id": 3 }
```

### 6. responseWorker.js Processes

Same pipeline as SMS/WhatsApp/Email:
- Looks up `dispatch_log` to get `sent_at` → computes `response_time_seconds`
- Resolves `"1"` → option number `1`
- Inserts into `trigger_response_log`

---

## Webhook Payload Reference

### `/api/voice/webhooks/dtmf` — Vonage DTMF Body
```json
{
  "uuid": "9fe99eac-22be-4b61-9385-58f0591bee3b",
  "conversation_uuid": "CON-636408e4-...",
  "to": "918317280673",
  "from": "46790965228",
  "dtmf": { "digits": "2", "timed_out": false }
}
```

### `/api/voice/webhooks/event` — Vonage Event Body
```json
{ "status": "answered", "uuid": "...", "from": "46790965228", "to": "918317280673" }
```
Status sequence: `ringing` → `started` → `answered` → `completed`

### `/api/sms/webhooks/inbound` — Vonage SMS Inbound
```json
{ "msisdn": "918317280673", "to": "46790965228", "text": "1", "message-id": "..." }
```

### `/api/whatsapp/webhooks/inbound` — Vonage WhatsApp Inbound
```json
{ "from": "918317280673", "message": { "content": { "text": "yes" } } }
```
