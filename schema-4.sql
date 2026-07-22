-- Run after schema.sql, schema-part2.sql, and schema-part3.sql.
-- Adds a required organizer phone number and a precise meeting point
-- (address + optional lat/lng) so the "Get Directions" button can point
-- at an exact pin, not just a city name.

ALTER TABLE events ADD COLUMN organizer_phone TEXT;
ALTER TABLE events ADD COLUMN meeting_address TEXT;
ALTER TABLE events ADD COLUMN meeting_lat REAL;
ALTER TABLE events ADD COLUMN meeting_lng REAL;
