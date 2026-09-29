-- BUILT 2026-09-29 · jobcreation schema-7 · Cars for Homes: donor pledges and applications.
-- Applied to the D1 database "jobcreation" (bound to the Pages project as JOURNAL_DB) on 2026-09-29,
-- together with schema-1 to schema-6. Run after the earlier schema files.

CREATE TABLE IF NOT EXISTS car_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- donor | applicant
  name TEXT NOT NULL,
  contact TEXT NOT NULL,              -- phone or email, as given
  location TEXT NOT NULL,             -- city and state
  car TEXT,                           -- donor: year, make, model
  mileage TEXT,                       -- donor
  runs TEXT,                          -- donor: Yes | Needs work | No
  title TEXT,                         -- donor: clear title | loan | not sure
  license TEXT,                       -- applicant: Yes | No
  dui TEXT,                           -- applicant: No | Yes
  insurance TEXT,                     -- applicant: Yes | Not yet
  situation TEXT,                     -- applicant: their situation
  status TEXT NOT NULL DEFAULT 'new', -- new | contacted | matched | given | declined
  notes TEXT,                         -- staff notes
  ip TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_car_signups_kind ON car_signups (kind, created_at);
