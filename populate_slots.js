const db = require('./config/database');

async function populateAvailableSlots() {
  try {
    console.log('🔄 Creating available_slots table if not exists...');
    
    // Create the available_slots table
    await db.query(`
      CREATE TABLE IF NOT EXISTS available_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        listing_id INT NOT NULL,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
        price_override DECIMAL(10,2) NULL,
        booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
        slot_duration INT NULL,
        unit_type ENUM('hour', 'day', 'night') NULL,
        is_available BOOLEAN DEFAULT TRUE,
        original_availability_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
        INDEX idx_available_slots_listing_datetime (listing_id, start_datetime, end_datetime),
        INDEX idx_available_slots_listing_available (listing_id, is_available),
        INDEX idx_available_slots_datetime_range (start_datetime, end_datetime)
      )
    `);
    
    console.log('✅ Table created successfully');
    
    // Clear existing slots for listing 3
    await db.query('DELETE FROM available_slots WHERE listing_id = ?', [3]);
    console.log('🗑️ Cleared existing slots for listing 3');
    
    // Get availability data for listing 3
    const availabilityData = await db.query(`
      SELECT id, listing_id, date, start_time, end_time, end_date, is_overnight, 
             booking_type, slot_duration, price_override
      FROM availability 
      WHERE listing_id = ? AND is_available = TRUE
    `, [3]);
    
    console.log(`📊 Found ${availabilityData.length} availability records for listing 3`);
    
    // Insert slots from availability data
    for (const avail of availabilityData) {
      const startDatetime = `${avail.date} ${avail.start_time}`;
      const endDatetime = avail.is_overnight && avail.end_date 
        ? `${avail.end_date} ${avail.end_time}`
        : `${avail.date} ${avail.end_time}`;
      
      // Determine unit_type based on booking_type or time
      let unitType = 'day'; // default
      if (avail.booking_type === 'night' || avail.is_overnight) {
        unitType = 'night';
      } else if (avail.booking_type === 'hourly') {
        unitType = 'hour';
      }
      
      await db.query(`
        INSERT INTO available_slots 
        (listing_id, start_datetime, end_datetime, slot_type, price_override, 
         booking_type, slot_duration, unit_type, original_availability_id, is_available)
        VALUES (?, ?, ?, 'regular', ?, ?, ?, ?, ?, TRUE)
      `, [
        avail.listing_id,
        startDatetime,
        endDatetime,
        avail.price_override,
        avail.booking_type,
        avail.slot_duration,
        unitType,
        avail.id
      ]);
    }
    
    console.log(`✅ Inserted ${availabilityData.length} slots into available_slots table`);
    
    // Verify the data
    const insertedSlots = await db.query(`
      SELECT * FROM available_slots 
      WHERE listing_id = ? 
      ORDER BY start_datetime
    `, [3]);
    
    console.log(`🔍 Verification: ${insertedSlots.length} slots found in available_slots table`);
    console.log('📋 Sample slots:');
    insertedSlots.slice(0, 3).forEach((slot, index) => {
      console.log(`  ${index + 1}. ${slot.start_datetime} to ${slot.end_datetime} (${slot.unit_type})`);
    });
    
  } catch (error) {
    console.error('❌ Error populating available_slots:', error);
  } finally {
    process.exit(0);
  }
}

populateAvailableSlots();