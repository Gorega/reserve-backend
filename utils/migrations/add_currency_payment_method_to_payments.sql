-- Migration: Add currency and payment_method fields to payments table
-- This migration adds the missing currency and payment_method fields

ALTER TABLE payments 
ADD COLUMN currency VARCHAR(10) DEFAULT 'ILS' AFTER lahza_access_code,
ADD COLUMN payment_method VARCHAR(50) NULL AFTER currency;

-- Add index for faster lookups by currency
CREATE INDEX idx_payments_currency ON payments(currency);

-- Update existing payments to have default payment_method based on method
UPDATE payments 
SET payment_method = method 
WHERE payment_method IS NULL;