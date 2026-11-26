-- Calibration of the baseline over body weight: every decision (applied or declined) with the
-- old/new value, the reason and the numbers behind it.
CREATE TABLE calibrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                                 -- YYYY-MM-DD of the decision
  decision TEXT NOT NULL,                            -- accepted | declined
  old_baseline REAL NOT NULL,
  new_baseline REAL NOT NULL,                        -- proposed value
  adjustment REAL NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',                -- JSON: window, days, weigh-ins, kcal, kg
  created_at INTEGER NOT NULL
);
CREATE INDEX calibrations_user_day ON calibrations(user_id, day);
