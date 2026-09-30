-- BUILT 2026-09-30 · jobcreation schema-8 · Cars for Homeless: full application + donor chooses the recipient.
-- Applied to D1 "jobcreation" (JOURNAL_DB) on 2026-09-30. Additive only (new columns); run after schema-7-cars.sql.

ALTER TABLE car_signups ADD COLUMN email TEXT;
ALTER TABLE car_signups ADD COLUMN dob TEXT;                  -- applicant date of birth (YYYY-MM-DD); staff only, never public
ALTER TABLE car_signups ADD COLUMN birth_state TEXT;          -- applicant state (or country) of birth
ALTER TABLE car_signups ADD COLUMN license_state TEXT;        -- state that issued the license (no license number is collected)
ALTER TABLE car_signups ADD COLUMN reason_category TEXT;      -- job loss, eviction, medical, family, disaster, other
ALTER TABLE car_signups ADD COLUMN plan_forward TEXT;         -- applicant's plan forward
ALTER TABLE car_signups ADD COLUMN need_car TEXT;             -- why they need a car
ALTER TABLE car_signups ADD COLUMN insurance_plan TEXT;       -- how they will pay for insurance
ALTER TABLE car_signups ADD COLUMN consents TEXT;             -- JSON: background, drug_test, insured_licensed, share_story, truthful + timestamp
ALTER TABLE car_signups ADD COLUMN public_blurb TEXT;         -- staff-edited story shown to donors once approved
ALTER TABLE car_signups ADD COLUMN chosen_applicant_id INTEGER; -- donor: the approved applicant the donor chose (NULL = Foundation suggests)
-- status now also uses 'approved' (checks done; shown to donors) alongside new | contacted | matched | given | declined.

-- Added 2026-09-30 (same day): donor car photo + donor's estimated value (for the deduction display).
CREATE TABLE IF NOT EXISTS car_photos ( id INTEGER PRIMARY KEY AUTOINCREMENT, signup_id INTEGER NOT NULL, created_at TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_car_photos_signup ON car_photos (signup_id);
ALTER TABLE car_signups ADD COLUMN est_value REAL;           -- donor's estimated fair market value (private-party guide value)
