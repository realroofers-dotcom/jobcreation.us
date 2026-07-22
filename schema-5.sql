-- Run after the earlier schema files.
-- members: a lightweight profile keyed by email, tracking the sweep ("broom") count.
-- event_rsvps: one row per person per event, recording whether they swept and what they paid.

CREATE TABLE IF NOT EXISTS members (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sweep_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  member_email TEXT NOT NULL,
  is_sweep INTEGER NOT NULL DEFAULT 0,
  fee_charged REAL NOT NULL DEFAULT 0,
  stripe_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON event_rsvps (event_id);
