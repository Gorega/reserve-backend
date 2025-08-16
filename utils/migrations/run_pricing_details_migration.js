const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

/**
 * Run the pricing details migration
 */
async function runMigration() {
  const pool = db.getPool();
  const connection = await pool.getConnection();

  try {
    console.log('Starting pricing_details migration...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add_pricing_details_to_listings.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL statements by semicolon
    const statements = sql.split(';').filter(statement => statement.trim());
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.trim().substring(0, 100)}...`);
        await connection.query(statement);
        console.log('Statement executed successfully');
      }
    }
    
    console.log('Migration completed successfully');
    
    // Optional: Convert existing pricing data to JSON format
    console.log('Converting existing pricing data to new format...');
    
    const [listings] = await connection.query(`
      SELECT id, price_per_hour, price_per_day, price_per_half_night, unit_type 
      FROM listings 
      WHERE price_per_hour IS NOT NULL OR price_per_day IS NOT NULL OR price_per_half_night IS NOT NULL
    `);
    
    console.log(`Found ${listings.length} listings with pricing data to convert`);
    
    for (const listing of listings) {
      const pricingOptions = [];
      
      // Add hour pricing if exists
      if (listing.price_per_hour) {
        pricingOptions.push({
          id: `price-hour-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          price: parseFloat(listing.price_per_hour),
          unit_type: 'hour',
          duration: 1
        });
      }
      
      // Add day pricing if exists
      if (listing.price_per_day) {
        pricingOptions.push({
          id: `price-day-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          price: parseFloat(listing.price_per_day),
          unit_type: 'day',
          duration: 1
        });
      }
      
      // Add night pricing if exists
      if (listing.price_per_half_night) {
        pricingOptions.push({
          id: `price-night-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          price: parseFloat(listing.price_per_half_night),
          unit_type: 'night',
          duration: 1
        });
      }
      
      if (pricingOptions.length > 0) {
        const pricingDetailsJson = JSON.stringify(pricingOptions);
        await connection.query(
          'UPDATE listings SET pricing_details = ? WHERE id = ?',
          [pricingDetailsJson, listing.id]
        );
        console.log(`Updated pricing details for listing ${listing.id}`);
      }
    }
    
    console.log('Data conversion completed successfully');
    
  } catch (error) {
    console.error('Error running migration:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
