-- Add pricing_details column to listings table
ALTER TABLE listings ADD COLUMN pricing_details JSON DEFAULT NULL AFTER price_per_half_night;

-- Update the comment
COMMENT ON COLUMN listings.pricing_details IS 'JSON array of pricing options with unit_type, price, duration';
