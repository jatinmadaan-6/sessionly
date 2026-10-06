-- Sessionly production schema (PostgreSQL 15+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'pending_review');
CREATE TYPE conversation_state AS ENUM ('START', 'WAITING_DATE', 'WAITING_TIME', 'CONFIRMATION', 'ESCALATED');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

CREATE TABLE therapists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT UNIQUE,
  phone TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', session_minutes INTEGER NOT NULL DEFAULT 60,
  fee_paise INTEGER NOT NULL DEFAULT 150000, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), therapist_id UUID NOT NULL REFERENCES therapists(id),
  name TEXT NOT NULL, phone TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (therapist_id, phone)
);
CREATE TABLE conversations (
  client_id UUID PRIMARY KEY REFERENCES clients(id), state conversation_state NOT NULL DEFAULT 'START',
  pending_date DATE, escalated BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')), content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), therapist_id UUID NOT NULL REFERENCES therapists(id),
  client_id UUID NOT NULL REFERENCES clients(id), start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'confirmed', calendar_event_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE UNIQUE INDEX active_booking_slot ON bookings (therapist_id, start_time) WHERE status IN ('pending', 'confirmed');
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), booking_id UUID NOT NULL REFERENCES bookings(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0), status payment_status NOT NULL DEFAULT 'pending',
  provider_payment_id TEXT UNIQUE, payment_link TEXT, receipt_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE webhook_events (
  provider TEXT NOT NULL, event_id TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX bookings_reminder_idx ON bookings (start_time) WHERE status = 'confirmed';
