import { budgetInputs } from "../../shared/budget";
import { type CalibrationCheck, calibrationCheck, calibrationDue, nextCalibration } from "../../shared/calibration";
import { addDays, type Day } from "../../shared/days";
import { budgetParamsFor } from "../../shared/settings";
import type { CalibrationDTO } from "../../shared/api";
import { useCalibrations } from "../api/calibration";
import { useSettings, useTotals } from "../api/nutrition";
import { useWeights } from "../api/weight";
import { useToday } from "../lib/useToday";

export interface CalibrationState {
  loading: boolean;
  /** 14 days since the last decision (or none yet). */
  due: boolean;
  next: Day;
  check: CalibrationCheck | null;
  log: CalibrationDTO[];
  today: Day;
}

/** Calibration of the baseline: due date, the current check and the log. */
export function useCalibration(): CalibrationState {
  const settings = useSettings();
  const today = useToday();
  const interval = settings.budget.calibration.intervalDays;
  const totals = useTotals(addDays(today, -interval), addDays(today, 1));
  const weights = useWeights();
  const log = useCalibrations();
  const lastDecision = log.data?.[0]?.day ?? null;
  const ready = Boolean(totals.data && weights.data && log.data);
  const check = ready ? calibrationCheck(budgetInputs(totals.data!), weights.data!, today, budgetParamsFor(settings), settings.budget.calibration) : null;
  return {
    loading: !ready,
    due: ready && calibrationDue(lastDecision, today, interval),
    next: nextCalibration(lastDecision, today, interval),
    check,
    log: log.data ?? [],
    today,
  };
}
