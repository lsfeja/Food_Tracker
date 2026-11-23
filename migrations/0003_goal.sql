-- V3: goal slider (kcal/day; negative = deficit, positive = surplus), limited by the
-- weekly budget's floor when the budget is computed.
ALTER TABLE settings ADD COLUMN goal_kcal REAL NOT NULL DEFAULT 0;
