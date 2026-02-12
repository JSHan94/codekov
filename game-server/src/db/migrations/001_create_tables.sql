-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Player loadouts (equipped items)
CREATE TABLE IF NOT EXISTS player_loadouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  equipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_loadouts_player
  ON player_loadouts(player_id);

CREATE INDEX IF NOT EXISTS idx_player_loadouts_equipped
  ON player_loadouts(player_id, equipped) WHERE equipped = true;

-- Raid logs
CREATE TABLE IF NOT EXISTS raid_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('survived', 'died')),
  loot_gained JSONB NOT NULL DEFAULT '[]',
  duration_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raid_logs_player
  ON raid_logs(player_id);

-- RLS policies (service role bypasses RLS)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_loadouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE raid_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own data
CREATE POLICY "Users can read own profile"
  ON players FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can read own loadout"
  ON player_loadouts FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Users can read own raid logs"
  ON raid_logs FOR SELECT
  USING (auth.uid() = player_id);
