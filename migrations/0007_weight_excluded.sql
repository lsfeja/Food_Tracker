-- Weigh-ins can be excluded from the trend and the calibration (e.g. after a blood plasma
-- donation, travel or illness); they stay visible.
ALTER TABLE body_weights ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
