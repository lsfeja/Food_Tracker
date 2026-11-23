-- V3: weekly budget with filling up.
-- target_kcal now means the base (rest + everyday movement, without workouts).
ALTER TABLE settings ADD COLUMN rest_day_active_pct REAL NOT NULL DEFAULT 75;   -- rest-day minimum: base + % of Ø active
ALTER TABLE settings ADD COLUMN max_daily_deficit REAL NOT NULL DEFAULT 700;    -- max kcal below base + Ø active
ALTER TABLE settings ADD COLUMN carry_over_pct REAL NOT NULL DEFAULT 70;        -- share of unplaced cuts moved to next week

-- The 4-week active average needs exact calories: let the regular sync fetch the
-- details of recent activities once more (history imports only had estimates).
UPDATE activities SET details_complete = 0
WHERE start_at >= (CAST(strftime('%s', 'now') AS INTEGER) - 30 * 86400) * 1000;
