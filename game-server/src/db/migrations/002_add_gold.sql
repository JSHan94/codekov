-- Add gold column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 0;
