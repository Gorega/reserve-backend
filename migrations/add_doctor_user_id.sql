-- Migration: Add doctor_user_id to listings table
-- Date: 2026-01-09
-- Description: Add support for linking doctor listings to specific doctor users

ALTER TABLE listings 
ADD COLUMN doctor_user_id INT NULL AFTER is_doctor_listing,
ADD CONSTRAINT fk_listings_doctor_user 
    FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_listings_doctor_user_id ON listings(doctor_user_id);

-- Add index for is_doctor_listing for better filtering
CREATE INDEX idx_listings_is_doctor_listing ON listings(is_doctor_listing);
