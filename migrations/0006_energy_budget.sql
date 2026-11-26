-- Calorie target v4: cleaned + smoothed activity, weekly balance, calibration over weight.
-- The old weekly-budget columns stay (no data is lost); the app no longer reads them.
ALTER TABLE settings ADD COLUMN alpha REAL NOT NULL DEFAULT 0.2;                 -- EWMA weight of yesterday
ALTER TABLE settings ADD COLUMN carry_enabled INTEGER NOT NULL DEFAULT 1;        -- weekly balance on/off
ALTER TABLE settings ADD COLUMN carry_cap_kcal REAL NOT NULL DEFAULT 300;        -- max. balance per day
ALTER TABLE settings ADD COLUMN sport_factors TEXT NOT NULL DEFAULT '{}';        -- overrides, JSON
ALTER TABLE settings ADD COLUMN calib_interval_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE settings ADD COLUMN calib_max_step_kcal REAL NOT NULL DEFAULT 100;
ALTER TABLE settings ADD COLUMN calib_damping REAL NOT NULL DEFAULT 0.5;
ALTER TABLE settings ADD COLUMN kcal_per_kg REAL NOT NULL DEFAULT 7700;

-- Settings per day: a row is valid from `day` until the next row. Baseline changes
-- (calibration) or a new deficit never rewrite past days.
CREATE TABLE budget_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                                 -- YYYY-MM-DD, valid from
  baseline_kcal REAL NOT NULL,
  goal_kcal REAL NOT NULL,                           -- negative = deficit
  alpha REAL NOT NULL,
  active_enabled INTEGER NOT NULL,
  carry_enabled INTEGER NOT NULL,
  carry_cap_kcal REAL NOT NULL,
  sport_factors TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
INSERT INTO budget_history (user_id, day, baseline_kcal, goal_kcal, alpha, active_enabled, carry_enabled, carry_cap_kcal, sport_factors, created_at)
  SELECT user_id, '1970-01-01', target_kcal, goal_kcal, 0.2, active_enabled, 1, 300, '{}', CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM settings;

-- Power meter (Strava device_watts): rides with power count fully.
ALTER TABLE activities ADD COLUMN has_power INTEGER NOT NULL DEFAULT 0;
-- Re-read the activity history once (summary pages only, calories are kept) to fill it.
UPDATE backfill_state SET status = 'running', next_page = 1, imported_count = 0, paused_until = NULL, last_error = NULL
  WHERE status = 'completed' AND fixed_before IS NOT NULL;
