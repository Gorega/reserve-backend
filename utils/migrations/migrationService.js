const fs = require('fs');
const path = require('path');
const db = require('../../config/database');
const migrationTracker = require('./migrationTracker');

/**
 * Migration service to run database migrations
 */
class MigrationService {
  constructor() {
    this.migrationsDir = path.join(__dirname);
  }

  /**
   * Run a specific migration file
   * @param {string} migrationFile - Migration file name
   * @returns {Promise<void>}
   */
  async runMigration(migrationFile) {
    try {
      console.log(`Running migration: ${migrationFile}`);
      
      // Read the SQL file
      const filePath = path.join(this.migrationsDir, migrationFile);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Split into individual statements (if multiple)
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      // Get a connection from the pool
      const pool = db.getPool();
      const connection = await pool.getConnection();
      
      try {
        // Execute each statement
        for (const statement of statements) {
          if (statement.trim()) {
            console.log(`Executing: ${statement.trim()}`);
            await connection.query(statement);
            console.log('Statement executed successfully');
          }
        }
        
        // Mark migration as executed
        await migrationTracker.markAsExecuted(migrationFile);
        
        console.log(`Migration ${migrationFile} completed successfully`);
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error(`Migration ${migrationFile} failed:`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   * @returns {Promise<Array>} - Array of executed migration names
   */
  async runPendingMigrations() {
    try {
      // Initialize migration tracker
      await migrationTracker.initialize();
      
      // Get pending migrations
      const pendingMigrations = await migrationTracker.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to run');
        return [];
      }
      
      console.log(`Found ${pendingMigrations.length} pending migrations`);
      
      // Run each pending migration
      const executedMigrations = [];
      for (const migration of pendingMigrations) {
        try {
          await this.runMigration(migration);
          executedMigrations.push(migration);
        } catch (error) {
          console.error(`Failed to run migration ${migration}:`, error);
          throw error;
        }
      }
      
      console.log(`Successfully ran ${executedMigrations.length} migrations`);
      return executedMigrations;
    } catch (error) {
      console.error('Error running pending migrations:', error);
      throw error;
    }
  }

  /**
   * Run specific migrations for pricing details
   * This is a specialized method for the pricing details migration
   * @returns {Promise<void>}
   */
  async runPricingDetailsMigration() {
    try {
      const pool = db.getPool();
      const connection = await pool.getConnection();

      try {
        console.log('Starting pricing_details migration...');
        
        // Check if the migration has already been run
        const executed = await migrationTracker.getExecutedMigrations();
        const migrationFile = 'add_pricing_details_to_listings.sql';
        
        if (executed.includes(migrationFile)) {
          console.log('Pricing details migration has already been run');
          return;
        }
        
        // Read the SQL file
        const sqlPath = path.join(this.migrationsDir, migrationFile);
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
        
        // Convert existing pricing data to JSON format
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
        
        // Mark migration as executed
        await migrationTracker.markAsExecuted(migrationFile);
        
        console.log('Data conversion completed successfully');
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error running pricing details migration:', error);
      throw error;
    }
  }
}

module.exports = new MigrationService();






