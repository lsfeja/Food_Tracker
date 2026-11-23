-- Body weight: one value per day (the latest saved), optional body fat percentage.
CREATE TABLE body_weights (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                                 -- YYYY-MM-DD
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,                                 -- NULL = not measured
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
