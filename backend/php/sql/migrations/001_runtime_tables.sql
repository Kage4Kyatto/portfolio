-- Runtime tables for Node API

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_rate_limits (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start BIGINT NOT NULL,
  last_attempt BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_auth_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  first_attempt_at BIGINT NOT NULL,
  last_attempt_at BIGINT NOT NULL,
  locked_until BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL,
  next_attempt_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  path TEXT NOT NULL,
  locale TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
