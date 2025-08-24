-- Create pricing_options table for better pricing structure management
CREATE TABLE pricing_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    unit_type ENUM('hour', 'day', 'night', 'week', 'month', 'session') NOT NULL,
    duration INT NOT NULL DEFAULT 1,
    minimum_units INT NOT NULL DEFAULT 1,
    maximum_units INT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

-- Add index for faster lookups
CREATE INDEX idx_pricing_options_listing_id ON pricing_options(listing_id);

-- Add comment
COMMENT ON TABLE pricing_options IS 'Stores different pricing options for each listing';
COMMENT ON COLUMN pricing_options.unit_type IS 'Type of unit for pricing (hour, day, night, etc.)';
COMMENT ON COLUMN pricing_options.duration IS 'Duration in units (e.g., 1 for 1 hour, 2 for 2 hours)';
COMMENT ON COLUMN pricing_options.minimum_units IS 'Minimum number of units that can be booked';
COMMENT ON COLUMN pricing_options.maximum_units IS 'Maximum number of units that can be booked, NULL for unlimited';




