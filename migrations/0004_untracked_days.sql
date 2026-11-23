-- V3: vacation days ("not tracked"): no budget, no balance, not in the active average.
-- Activities on these days still count in the sport statistics.
CREATE TABLE untracked_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                                 -- YYYY-MM-DD
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
