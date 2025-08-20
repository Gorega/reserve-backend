const db = require('../../config/database');

async function createSpecialPricingTable() {
  try {
    console.log('Creating special_pricing table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS special_pricing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        listing_id INT NOT NULL,
        date DATE NULL,
        price DECIMAL(10, 2) NOT NULL,
        pricing_option INT NOT NULL,
        reason VARCHAR(255) NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        day_of_week INT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
        FOREIGN KEY (pricing_option) REFERENCES pricing_options(id) ON DELETE CASCADE,
        
        INDEX idx_listing_date (listing_id, date),
        INDEX idx_listing_recurring (listing_id, is_recurring, day_of_week),
        INDEX idx_date_range (start_date, end_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await db.query(createTableSQL);
    console.log('✅ special_pricing table created successfully!');
    
    // Check if table exists and has data
    const [tables] = await db.query("SHOW TABLES LIKE 'special_pricing'");
    if (tables.length > 0) {
      console.log('✅ Table exists in database');
      
      const [count] = await db.query('SELECT COUNT(*) as count FROM special_pricing');
      console.log(`📊 Current records in special_pricing: ${count[0].count}`);
    } else {
      console.log('❌ Table was not created');
    }
    
  } catch (error) {
    console.error('❌ Error creating special_pricing table:', error.message);
    throw error;
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  createSpecialPricingTable()
    .then(() => {
      console.log('Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = createSpecialPricingTable;