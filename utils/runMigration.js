const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * Simple migration runner
 * Executes SQL migration files
 */
async function runMigration(migrationFile) {
  try {
    // Load environment variables
    require('dotenv').config();
    
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL by semicolons and execute each statement
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`Running migration: ${migrationFile}`);
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        await db.query(statement);
        console.log(`✓ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log(`✅ Migration ${migrationFile} completed successfully!`);
    
  } catch (error) {
    console.error(`❌ Migration failed:`, error.message);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: node runMigration.js <migration-file>');
    console.error('Example: node runMigration.js add_email_verification.sql');
    process.exit(1);
  }
  
  runMigration(migrationFile)
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };