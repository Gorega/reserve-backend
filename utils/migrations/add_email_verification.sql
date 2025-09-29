-- Migration: Add email verification fields to users table
-- This migration adds email verification functionality to the users table

ALTER TABLE users 
ADD COLUMN email_verified BOOLEAN DEFAULT FALSE AFTER profile_image,
ADD COLUMN verification_token VARCHAR(255) NULL AFTER email_verified,
ADD COLUMN verification_token_expires DATETIME NULL AFTER verification_token,
ADD COLUMN verification_sent_at TIMESTAMP NULL AFTER verification_token_expires;

-- Add index for verification token lookups
ALTER TABLE users 
ADD INDEX idx_users_verification_token (verification_token),
ADD INDEX idx_users_email_verified (email_verified);

-- Update existing users to have verified emails (optional - for existing users)
-- Uncomment the line below if you want existing users to be automatically verified
-- UPDATE users SET email_verified = TRUE WHERE email IS NOT NULL;

-- Note: New users will have email_verified = FALSE by default and will need to verify their email