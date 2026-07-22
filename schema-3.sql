-- Run this AFTER schema.sql and schema-part2.sql.
-- Adds an end_date column so multi-day trips (Vegas, Spain, Argentina, Colombia, etc.)
-- can have a date range instead of a single day. "trip" is just a value you'll now
-- pass into the existing `type` column - no schema change needed for that part,
-- since type was already a free-form TEXT column.

ALTER TABLE events ADD COLUMN end_date TEXT;
