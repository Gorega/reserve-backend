-- Migration: Add Lahza payment gateway fields to payments table
-- This migration adds the necessary fields for Lahza payment integration

ALTER TABLE payments 
ADD COLUMN lahza_reference VARCHAR(255) NULL AFTER transaction_id,
ADD COLUMN lahza_access_code VARCHAR(255) NULL AFTER lahza_reference;

-- Add index for faster lookups by Lahza reference
CREATE INDEX idx_payments_lahza_reference ON payments(lahza_reference);

-- Update existing payments to have lahza_reference same as transaction_id if they exist
-- This is for backward compatibility with existing Lahza payments
UPDATE payments 
SET lahza_reference = transaction_id 
WHERE transaction_id IS NOT NULL 
  AND lahza_reference IS NULL 
  AND transaction_id LIKE '%lahza%' OR transaction_id LIKE '%booking_%';