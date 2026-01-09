CREATE TABLE IF NOT EXISTS available_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  listing_id INT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
  price_override DECIMAL(10,2) NULL,
  booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
  slot_duration INT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  original_availability_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  INDEX idx_listing_datetime (listing_id, start_datetime, end_datetime),
  INDEX idx_availability (listing_id, is_available),
  INDEX idx_slot_type (slot_type)
);

SET @exist := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'available_slots' AND column_name = 'origin_listing_id');
SET @sql := IF(@exist = 0, 'ALTER TABLE available_slots ADD COLUMN origin_listing_id INT NULL, ADD CONSTRAINT fk_available_slots_origin_listing FOREIGN KEY (origin_listing_id) REFERENCES listings (id) ON DELETE CASCADE', 'SELECT "Column exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
