# Sessionly

Sessionly is a safety-bounded scheduling and billing agent for therapy practices. It handles administrative workflows only: appointment availability, booking, rescheduling, cancellation, reminders, payments, and escalation. It never provides medical advice, diagnoses, or clinical support.

## Production architecture

`WhatsApp/API → signature + idempotency → agent policy → deterministic tools → repository/provider adapters`

- The agent only interprets language and selects a workflow; it cannot write data directly.
- Six deterministic tools own availability, booking, cancellation, rescheduling, payment-link creation, and therapist escalation.
- `LocalStore` is free/offline developer mode. Setting `DATABASE_URL` switches the exact same API to `PostgresStore`.
- Webhooks use HMAC validation when a provider secret is configured, and persist event IDs to prevent duplicate delivery effects.
- The job handler is transport-independent and can be called by cron locally or a queue worker in deployment.

## Run locally — no accounts required

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The default storage is `data/sessionly.json`, which is Git-ignored.

## Use free PostgreSQL locally

```bash
docker compose up -d
copy .env.example .env
npm run migrate
npm run dev
```

The included Docker database is local-only. For hosted development, a free Supabase or Neon database works by setting `DATABASE_URL`; no code changes are needed.

## Test and build

```bash
npm test
npm run build
```

Tests exercise booking state, duplicate slot prevention, rescheduling, cancellation, payment links, safety escalation, API input validation, signed WhatsApp webhooks, and webhook idempotency.

## Optional providers

The app works without credentials. Add provider secrets only when connecting a real account:

- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — Cloud API verification and signed webhook payloads
- `RAZORPAY_WEBHOOK_SECRET` — signed payment events
- `DATABASE_URL` — PostgreSQL persistence

Provider-specific adapters are deliberately ports, so credentials and side effects stay outside agent policy. Never commit `.env`.
