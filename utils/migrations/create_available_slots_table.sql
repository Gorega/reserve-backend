-- Create available_slots table for optimized availability management
CREATE TABLE IF NOT EXISTS available_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
    price_override DECIMAL(10,2) NULL,
    booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
    slot_duration INT NULL, -- in minutes
    is_available BOOLEAN DEFAULT TRUE,
    original_availability_id INT NULL, -- Reference to the original availability record
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
    FOREIGN KEY (original_availability_id) REFERENCES availability(id) ON DELETE CASCADE,
    INDEX idx_available_slots_listing_datetime (listing_id, start_datetime, end_datetime),
    INDEX idx_available_slots_listing_available (listing_id, is_available),
    INDEX idx_available_slots_datetime_range (start_datetime, end_datetime)
);

-- Create stored procedure to populate available_slots from availability
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS populate_available_slots(IN listing_id_param INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE avail_id INT;
    DECLARE avail_listing_id INT;
    DECLARE avail_date DATE;
    DECLARE avail_start_time TIME;
    DECLARE avail_end_time TIME;
    DECLARE avail_end_date DATE;
    DECLARE avail_is_overnight BOOLEAN;
    DECLARE avail_booking_type VARCHAR(20);
    DECLARE avail_slot_duration INT;
    DECLARE avail_price_override DECIMAL(10,2);
    DECLARE start_datetime_val DATETIME;
    DECLARE end_datetime_val DATETIME;
    
    -- Cursor to iterate through availability records
    DECLARE availability_cursor CURSOR FOR 
        SELECT id, listing_id, date, start_time, end_time, end_date, is_overnight, 
               booking_type, slot_duration, price_override
        FROM availability 
        WHERE listing_id = listing_id_param AND is_available = TRUE;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Clear existing available_slots for this listing
    DELETE FROM available_slots WHERE listing_id = listing_id_param;
    
    OPEN availability_cursor;
    
    read_loop: LOOP
        FETCH availability_cursor INTO avail_id, avail_listing_id, avail_date, 
              avail_start_time, avail_end_time, avail_end_date, avail_is_overnight,
              avail_booking_type, avail_slot_duration, avail_price_override;
        
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Calculate start and end datetime
        SET start_datetime_val = CONCAT(avail_date, ' ', avail_start_time);
        
        IF avail_is_overnight AND avail_end_date IS NOT NULL THEN
            SET end_datetime_val = CONCAT(avail_end_date, ' ', avail_end_time);
        ELSE
            SET end_datetime_val = CONCAT(avail_date, ' ', avail_end_time);
        END IF;
        
        -- Insert into available_slots
        INSERT INTO available_slots 
        (listing_id, start_datetime, end_datetime, slot_type, price_override, 
         booking_type, slot_duration, original_availability_id, is_available)
        VALUES 
        (avail_listing_id, start_datetime_val, end_datetime_val, 'regular', 
         avail_price_override, avail_booking_type, avail_slot_duration, avail_id, TRUE);
        
    END LOOP;
    
    CLOSE availability_cursor;
    
END //
DELIMITER ;
