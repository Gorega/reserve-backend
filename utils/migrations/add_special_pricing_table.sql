-- Create special_pricing table for date-specific pricing
CREATE TABLE special_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    pricing_option_id INT NOT NULL,
    date DATE NOT NULL,
    special_price DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    reason VARCHAR(255) NULL COMMENT 'Reason for special pricing (e.g., holiday, weekend, event)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
    FOREIGN KEY (pricing_option_id) REFERENCES pricing_options(id) ON DELETE CASCADE,
    UNIQUE KEY unique_listing_pricing_date (listing_id, pricing_option_id, date)
);

-- Add indexes for faster lookups
CREATE INDEX idx_special_pricing_listing_id ON special_pricing(listing_id);
CREATE INDEX idx_special_pricing_date ON special_pricing(date);
CREATE INDEX idx_special_pricing_listing_date ON special_pricing(listing_id, date);
CREATE INDEX idx_special_pricing_active ON special_pricing(is_active);

-- Add comments
COMMENT ON TABLE special_pricing IS 'Stores special pricing for specific dates that override default pricing options';
COMMENT ON COLUMN special_pricing.date IS 'The specific date for which this special price applies';
COMMENT ON COLUMN special_pricing.special_price IS 'The special price that overrides the default pricing option price';
COMMENT ON COLUMN special_pricing.is_active IS 'Whether this special pricing is currently active';
COMMENT ON COLUMN special_pricing.reason IS 'Optional reason for the special pricing (holidays, events, etc.)';