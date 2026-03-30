-- ═══════════════════════════════════════════════════════════
--  CKAN Modern — Supabase Database Schema
--  Run this in Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
  points INTEGER NOT NULL DEFAULT 100,
  silicon_flow_key TEXT,              -- optional user-provided API key
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Points transaction log
CREATE TABLE IF NOT EXISTS points_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,            -- positive = earned, negative = spent
  action TEXT NOT NULL,               -- 'ai_chat', 'mod_search', 'paste_install', etc.
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dispatch pairing codes
CREATE TABLE IF NOT EXISTS dispatch_pairs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,           -- 6-digit pairing code
  paired BOOLEAN NOT NULL DEFAULT false,
  node_name TEXT,                      -- name of the paired PC
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dispatch command queue
CREATE TABLE IF NOT EXISTS dispatch_commands (
  id BIGSERIAL PRIMARY KEY,
  pair_id BIGINT NOT NULL REFERENCES dispatch_pairs(id) ON DELETE CASCADE,
  command TEXT NOT NULL,               -- 'install', 'uninstall', 'update'
  args JSONB NOT NULL DEFAULT '{}',   -- { identifier: "ModName", version: "1.0" }
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- AI chat history (optional, for context persistence)
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,                          -- which model was used
  points_cost INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
--  Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Points log: users see their own
CREATE POLICY "Users can view own points log"
  ON points_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own points log"
  ON points_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Dispatch: users manage their own pairs
CREATE POLICY "Users can view own dispatch pairs"
  ON dispatch_pairs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dispatch pairs"
  ON dispatch_pairs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dispatch pairs"
  ON dispatch_pairs FOR UPDATE USING (auth.uid() = user_id);

-- Dispatch commands: users see commands for their pairs
CREATE POLICY "Users can view own dispatch commands"
  ON dispatch_commands FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM dispatch_pairs WHERE dispatch_pairs.id = dispatch_commands.pair_id
    AND dispatch_pairs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own dispatch commands"
  ON dispatch_commands FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM dispatch_pairs WHERE dispatch_pairs.id = pair_id
    AND dispatch_pairs.user_id = auth.uid()
  ));

-- Chat history: users see their own
CREATE POLICY "Users can view own chat history"
  ON chat_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat history"
  ON chat_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
--  Auto-create profile on signup (trigger)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, tier, points)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1), 'User'),
    'free',
    100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
--  Indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_points_log_user ON points_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_pairs_code ON dispatch_pairs(code) WHERE NOT paired;
CREATE INDEX IF NOT EXISTS idx_dispatch_commands_status ON dispatch_commands(pair_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id, created_at DESC);

-- Enable Realtime for dispatch (so the desktop node gets live command updates)
ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_commands;

-- ═══════════════════════════════════════════════════════════
--  Mod Installations (sync installed mods across devices)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mod_installations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  instance_id TEXT,                   -- optional: which game instance
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, identifier)
);

ALTER TABLE mod_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mod installations"
  ON mod_installations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mod installations"
  ON mod_installations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own mod installations"
  ON mod_installations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mod_installations_user ON mod_installations(user_id);

-- avatar_url for OAuth users (GitHub, Google, Discord)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
