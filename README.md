# Sessionly

An AI-powered scheduling and billing agent for therapy practices. This project demonstrates a safety-bounded agent architecture: language is classified into a small set of intents, while deterministic server tools own all availability, booking, payment, and escalation mutations.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3001`.

The app starts with a demo therapist and clients. Data is stored locally in `data/sessionly.json` and is intentionally ignored by Git. Delete that file to reset the demo.

## What to demo

- Send “I need an appointment Friday evening” and select a shown time.
- Send “cancel my appointment” or “reschedule my appointment to 2026-09-10 at 17:00”.
- Send “I feel hopeless” to demonstrate the medical/safety guardrail and therapist escalation.
- Open the Billing tab and generate a payment link for a completed booking.
- Call `POST /webhook/whatsapp` with `{ "from": "+15551234567", "text": "book Friday" }` to emulate WhatsApp ingestion.

## Architecture

`HTTP / WhatsApp webhook → conversation state → intent policy → backend tool → storage / adapter → reply`

The tool layer exposes availability, booking, cancellation, rescheduling, payment-link creation, and therapist escalation. The included `CalendarGateway`, `PaymentGateway`, and `Messenger` use demo implementations so the project works without credentials; their interfaces isolate Google Calendar, Razorpay, and WhatsApp integrations for production.

## API

- `GET /api/dashboard`
- `GET /api/conversations`, `GET /api/conversations/:clientId`
- `POST /api/messages` — `{ clientId, text }`
- `POST /api/bookings/:id/payment-link`
- `POST /api/jobs/send-confirmations`
- `GET|POST /webhook/whatsapp`
- `POST /webhook/razorpay` 
