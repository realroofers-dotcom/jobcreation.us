-- Run after the earlier schema files.
-- Stores a reference to the attendee's photo in R2 (the actual image bytes
-- live in R2, not the database - this column just points at the object).

ALTER TABLE event_rsvps ADD COLUMN photo_key TEXT;
