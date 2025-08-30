-- Migration: Add datetime columns to availability table for unified date/time handling
-- This migration adds start_datetime and end_datetime columns to match the bookings table structure

ALTER TABLE availability 
ADD COLUMN start_datetime DATETIME NULL AFTER end_date,
ADD COLUMN end_datetime DATETIME NULL AFTER start_datetime;

-- Update existing records to populate the new datetime columns
-- For same-day availability (is_overnight = 0)
UPDATE availability 
SET 
    start_datetime = CONCAT(date, ' ', start_time),
    end_datetime = CONCAT(date, ' ', end_time)
WHERE is_overnight = 0;

-- For overnight availability (is_overnight = 1)
UPDATE availability 
SET 
    start_datetime = CONCAT(date, ' ', start_time),
    end_datetime = CONCAT(COALESCE(end_date, date), ' ', end_time)
WHERE is_overnight = 1;

-- Add indexes for the new datetime columns
ALTER TABLE availability 
ADD INDEX idx_availability_datetime (listing_id, start_datetime, end_datetime);

-- Optional: After verifying data integrity, you can drop the old columns
-- ALTER TABLE availability 
-- DROP COLUMN date,
-- DROP COLUMN start_time,
-- DROP COLUMN end_time,
-- DROP COLUMN end_date;

-- Note: Keep the old columns for now to ensure backward compatibility
-- They can be removed in a future migration after full testing