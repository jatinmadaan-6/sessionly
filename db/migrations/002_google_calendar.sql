ALTER TABLE therapists ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS google_calendar_id TEXT NOT NULL DEFAULT 'primary';
