-- Foodtracker schema. Every table is scoped to a user (Cloudflare Access email).
-- Days are local calendar dates ('YYYY-MM-DD'); timestamps are epoch milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_kcal REAL NOT NULL DEFAULT 2200,
  target_protein REAL NOT NULL DEFAULT 140,
  target_carbs REAL NOT NULL DEFAULT 220,
  target_fat REAL NOT NULL DEFAULT 70,
  weekly_mode INTEGER NOT NULL DEFAULT 0,
  weekly_limit_kcal REAL NOT NULL DEFAULT 0,       -- 0 = 7 × daily target
  active_enabled INTEGER NOT NULL DEFAULT 1,
  active_percent REAL NOT NULL DEFAULT 100,         -- 50…100
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Food catalog, nutrients per 100 g.
CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  kcal_100g REAL NOT NULL DEFAULT 0,
  protein_100g REAL NOT NULL DEFAULT 0,
  carbs_100g REAL NOT NULL DEFAULT 0,
  fat_100g REAL NOT NULL DEFAULT 0,
  serving_g REAL,
  source TEXT NOT NULL DEFAULT 'custom',            -- custom | openFoodFacts | label
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_amount_g REAL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX foods_user ON foods(user_id, hidden);
CREATE INDEX foods_barcode ON foods(user_id, barcode);

-- Logged items: absolute nutrient snapshot (editing a food never rewrites history).
CREATE TABLE food_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  logged_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  grams REAL,
  kcal REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',            -- manual | barcode | label | ai (planned)
  is_estimated INTEGER NOT NULL DEFAULT 0,          -- e.g. AI estimates (planned)
  note TEXT,
  food_id TEXT REFERENCES foods(id) ON DELETE SET NULL
);
CREATE INDEX entries_user_day ON food_entries(user_id, day);

-- OAuth connections to activity providers (strava now, garmin planned).
-- Tokens are AES-GCM encrypted with TOKEN_ENCRYPTION_KEY.
CREATE TABLE connections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  athlete_id TEXT,
  athlete_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,                      -- epoch seconds
  scope TEXT NOT NULL DEFAULT '',
  last_sync_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Imported activities (strava now, garmin planned).
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  start_at INTEGER NOT NULL,
  day TEXT NOT NULL,                                -- local day of the start
  duration_s REAL NOT NULL DEFAULT 0,
  distance_m REAL NOT NULL DEFAULT 0,
  elevation_m REAL NOT NULL DEFAULT 0,
  is_indoor INTEGER NOT NULL DEFAULT 0,
  active_kcal REAL NOT NULL DEFAULT 0,
  kcal_estimated INTEGER NOT NULL DEFAULT 0,
  details_complete INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, source, external_id)
);
CREATE INDEX activities_user_day ON activities(user_id, day);

-- One-time history import progress per provider.
CREATE TABLE backfill_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',              -- idle | running | paused | completed | failed
  fixed_before INTEGER,                             -- epoch seconds
  next_page INTEGER NOT NULL DEFAULT 1,
  imported_count INTEGER NOT NULL DEFAULT 0,
  oldest_at INTEGER,
  expected_total INTEGER,
  paused_until INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- API rate limits are per provider application, shared by all users.
CREATE TABLE rate_limits (
  provider TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL DEFAULT 0,          -- epoch ms, 15-min window
  window_count INTEGER NOT NULL DEFAULT 0,
  day_start INTEGER NOT NULL DEFAULT 0,             -- epoch ms, UTC day
  day_count INTEGER NOT NULL DEFAULT 0,
  short_limit INTEGER NOT NULL DEFAULT 100,
  daily_limit INTEGER NOT NULL DEFAULT 1000,
  blocked_until INTEGER NOT NULL DEFAULT 0          -- epoch ms, 0 = not blocked
);

-- Training calendar. `details` is JSON (strength / endurance / general payload).
CREATE TABLE planned_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  sport TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',           -- planned | done | skipped
  details TEXT NOT NULL DEFAULT '{}',
  completed_at INTEGER,
  linked_activity_key TEXT,                         -- "<source>:<external_id>"
  link_manual INTEGER NOT NULL DEFAULT 0,
  auto_link_suppressed INTEGER NOT NULL DEFAULT 0,
  completed_by_link INTEGER NOT NULL DEFAULT 0,
  template_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_day ON planned_sessions(user_id, day, position);

CREATE TABLE workout_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX workout_templates_user ON workout_templates(user_id);

-- `sessions` is JSON: [{ id, weekday (0 = Mon … 6 = Sun), order, content }]
CREATE TABLE week_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sessions TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX week_templates_user ON week_templates(user_id);

CREATE TABLE yearly_goals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  sport TEXT NOT NULL,                              -- all | cycling | ride | indoorRide | run | swim | other
  distance_km REAL,
  hours REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, year, sport)
);
