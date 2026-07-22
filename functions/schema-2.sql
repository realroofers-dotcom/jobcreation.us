-- Run this AFTER schema.sql (the journal table) - it adds two more tables.
-- npx wrangler d1 execute JOURNAL_DB --file=schema-part2.sql
-- (or paste into the D1 console in the Cloudflare dashboard)

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  member_name TEXT NOT NULL,
  member_email TEXT NOT NULL,
  plan TEXT NOT NULL,                 -- monthly | annual | waived
  fee_amount REAL NOT NULL,           -- 0 if waived
  pledge_text TEXT NOT NULL,
  agreed_at TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active | canceled | waived
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships (member_email);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships (status);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,                 -- hike | gala | training
  title TEXT NOT NULL,
  city TEXT,
  event_date TEXT,
  fee_amount REAL NOT NULL DEFAULT 0,
  fair_market_value REAL NOT NULL DEFAULT 0,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_events_active ON events (active);
