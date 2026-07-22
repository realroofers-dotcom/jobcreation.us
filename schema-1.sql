-- Run this once against your D1 database:
-- npx wrangler d1 execute JOURNAL_DB --file=schema.sql
-- (or paste it into the D1 console in the Cloudflare dashboard)

CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL,
  donor_name TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  amount REAL NOT NULL,
  fair_market_value REAL NOT NULL DEFAULT 0,
  deductible_amount REAL NOT NULL,
  method TEXT NOT NULL,
  notes TEXT,
  receipt_number TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_created_at ON journal (created_at);
CREATE INDEX IF NOT EXISTS idx_journal_category ON journal (category);
