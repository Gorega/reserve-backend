require('dotenv').config({ path: '../../.env' });
const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

async function runMigration(migrationFile) {
  try {
    console.log(`Running migration: ${migrationFile}`);
    
    // Read the SQL file
    const filePath = path.join(__dirname, migrationFile);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split into individual statements (if multiple)
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.trim()}`);
        await db.query(statement);
        console.log('Statement executed successfully');
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Check if migration file is provided
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Please provide a migration file name');
  console.log('Usage: node run_migration.js <migration_file>');
  process.exit(1);
}

// Run the migration
runMigration(migrationFile)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  }); 