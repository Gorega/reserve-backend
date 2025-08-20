-- Add recurring pricing support to special_pricing table
-- This allows setting special prices for specific days of the week (e.g., every Friday and Saturday)

-- Add new columns for recurring pricing
ALTER TABLE special_pricing 
ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE COMMENT 'Whether this is a recurring weekly pattern',
ADD COLUMN day_of_week TINYINT NULL COMMENT 'Day of week (0=Sunday, 1=Monday, ..., 6=Saturday) for recurring pricing',
ADD COLUMN recurring_start_date DATE NULL COMMENT 'Start date for recurring pattern (optional)',
ADD COLUMN recurring_end_date DATE NULL COMMENT 'End date for recurring pattern (optional)';

-- Update the unique constraint to handle both specific dates and recurring patterns
DROP INDEX unique_listing_pricing_date ON special_pricing;

-- Create separate unique constraints for specific dates and recurring patterns
ALTER TABLE special_pricing 
ADD CONSTRAINT unique_listing_pricing_specific_date 
    UNIQUE (listing_id, pricing_option_id, date, is_recurring) 
    WHERE is_recurring = FALSE;

ALTER TABLE special_pricing 
ADD CONSTRAINT unique_listing_pricing_recurring_day 
    UNIQUE (listing_id, pricing_option_id, day_of_week, is_recurring) 
    WHERE is_recurring = TRUE;

-- Add indexes for better performance
CREATE INDEX idx_special_pricing_recurring ON special_pricing(is_recurring);
CREATE INDEX idx_special_pricing_day_of_week ON special_pricing(day_of_week);
CREATE INDEX idx_special_pricing_recurring_dates ON special_pricing(recurring_start_date, recurring_end_date);

-- Add check constraints to ensure data integrity
ALTER TABLE special_pricing 
ADD CONSTRAINT chk_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6));

ALTER TABLE special_pricing 
ADD CONSTRAINT chk_recurring_logic CHECK (
    (is_recurring = FALSE AND day_of_week IS NULL AND date IS NOT NULL) OR
    (is_recurring = TRUE AND day_of_week IS NOT NULL AND date IS NULL)
);

ALTER TABLE special_pricing 
ADD CONSTRAINT chk_recurring_date_range CHECK (
    recurring_start_date IS NULL OR recurring_end_date IS NULL OR recurring_start_date <= recurring_end_date
);

-- Add comments for the new columns
COMMENT ON COLUMN special_pricing.is_recurring IS 'TRUE for recurring weekly patterns, FALSE for specific dates';
COMMENT ON COLUMN special_pricing.day_of_week IS 'Day of week for recurring pricing: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN special_pricing.recurring_start_date IS 'Optional start date for when the recurring pattern should begin';
COMMENT ON COLUMN special_pricing.recurring_end_date IS 'Optional end date for when the recurring pattern should end';

-- Update table comment
COMMENT ON TABLE special_pricing IS 'Stores special pricing for specific dates or recurring weekly patterns that override default pricing options';