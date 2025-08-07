# Database Migrations

This directory contains database migration scripts to update the database schema.

## Running Migrations

To run a migration, use the following command from the project root:

```bash
node utils/migrations/run_migration.js <migration_file>
```

For example:

```bash
node utils/migrations/run_migration.js add_is_read_to_messages.sql
```

## Available Migrations

1. `add_is_read_to_messages.sql` - Adds the `is_read` column to the messages table for read receipts

## Creating New Migrations

1. Create a new SQL file in this directory with a descriptive name
2. Add SQL statements to the file
3. Run the migration using the command above

## Troubleshooting

If you encounter any issues running migrations:

1. Make sure your .env file is properly configured with database credentials
2. Check that the database user has privileges to alter tables
3. Verify that the migration file exists and contains valid SQL 