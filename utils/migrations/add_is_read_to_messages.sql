-- Add is_read column to messages table
ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE AFTER message; 