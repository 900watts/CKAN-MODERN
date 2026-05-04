-- ============================================
-- CKAN Modern — AI Credit System Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table (stores tier info)
--    If you already have a profiles table, just ADD the tier column instead.
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tier text DEFAULT 'free' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, tier)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. AI usage log (tracks every request for auditing)
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  model text NOT NULL,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  total_tokens int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage (user_id, created_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert" ON ai_usage FOR INSERT WITH CHECK (true);

-- 3. Helper: get today's usage count for a user
CREATE OR REPLACE FUNCTION get_daily_ai_usage(p_user_id uuid)
RETURNS int AS $$
  SELECT COUNT(*)::int FROM ai_usage
  WHERE user_id = p_user_id
  AND created_at >= CURRENT_DATE;
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. AI config table (stores API keys, only authenticated users can read)
CREATE TABLE IF NOT EXISTS ai_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read config" ON ai_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert your Silicon Flow key here (replace sk-xxx with your real key)
-- INSERT INTO ai_config (key, value) VALUES ('silicon_flow_key', 'sk-xxx');

-- 5. Function to log AI usage (callable by authenticated users)
CREATE OR REPLACE FUNCTION log_ai_usage(p_model text)
RETURNS int AS $$
DECLARE
  daily_count int;
BEGIN
  -- Check daily limit first
  SELECT COUNT(*)::int INTO daily_count FROM ai_usage
  WHERE user_id = auth.uid() AND created_at >= CURRENT_DATE;

  IF daily_count >= 20 THEN
    RETURN -1;  -- Signal: limit reached
  END IF;

  -- Log the usage
  INSERT INTO ai_usage (user_id, model)
  VALUES (auth.uid(), p_model);

  RETURN 20 - daily_count - 1;  -- Return remaining
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
