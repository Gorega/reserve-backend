const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

/**
 * Migration tracker to keep track of which migrations have been run
 */
class MigrationTracker {
  constructor() {
    this.tableName = 'migrations';
    this.migrationsDir = path.join(__dirname);
  }

  /**
   * Initialize the migration tracker
   * Creates the migrations table if it doesn't exist
   */
  async initialize() {
    try {
      const pool = db.getPool();
      const connection = await pool.getConnection();

      try {
        // Check if migrations table exists
        const [tables] = await connection.query(`
          SELECT TABLE_NAME 
          FROM information_schema.TABLES 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        `, [process.env.DB_NAME, this.tableName]);

        // Create migrations table if it doesn't exist
        if (tables.length === 0) {
          console.log('Creating migrations table...');
          await connection.query(`
            CREATE TABLE ${this.tableName} (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL UNIQUE,
              executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          console.log('Migrations table created successfully');
        }
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error initializing migration tracker:', error);
      throw error;
    }
  }

  /**
   * Get all migrations that have been run
   * @returns {Promise<Array>} - Array of migration names
   */
  async getExecutedMigrations() {
    try {
      const results = await db.query(`SELECT name FROM ${this.tableName} ORDER BY executed_at`);
      return results.map(row => row.name);
    } catch (error) {
      console.error('Error getting executed migrations:', error);
      throw error;
    }
  }

  /**
   * Get all available migration files
   * @returns {Promise<Array>} - Array of migration file names
   */
  async getAvailableMigrations() {
    try {
      const files = fs.readdirSync(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.error('Error getting available migrations:', error);
      throw error;
    }
  }

  /**
   * Get pending migrations (available but not yet executed)
   * @returns {Promise<Array>} - Array of migration file names
   */
  async getPendingMigrations() {
    const executed = await this.getExecutedMigrations();
    const available = await this.getAvailableMigrations();
    
    return available.filter(file => !executed.includes(file));
  }

  /**
   * Mark a migration as executed
   * @param {string} migrationName - Migration file name
   * @returns {Promise<void>}
   */
  async markAsExecuted(migrationName) {
    try {
      await db.query(`INSERT INTO ${this.tableName} (name) VALUES (?)`, [migrationName]);
      console.log(`Migration ${migrationName} marked as executed`);
    } catch (error) {
      console.error(`Error marking migration ${migrationName} as executed:`, error);
      throw error;
    }
  }
}

module.exports = new MigrationTracker();




