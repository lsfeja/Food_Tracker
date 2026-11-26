/**
 * Daily calorie target (spec "Kalorienziel-Berechnung"):
 *
 * - Active calories per activity are cleaned: the resting burn during the workout is
 *   already part of the baseline, so `net = max(0, kcal − baseline/1440 × moving min)`,
 *   then scaled by a sport factor (Strava overestimates some sports). A(d) = sum of a day.
 * - A_smooth is an EWMA of yesterday's A: `A_smooth(d) = α·A(d−1) + (1−α)·A_smooth(d−1)`.
 *   Today's workout counts from tomorrow, so the (rest) day after a hard session gets the
 *   most energy and the target never jumps during the day.
 * - target_base(d) = baseline + A_smooth(d) − deficit.
 * - Weekly balance (Mon–Sun): carry(d) = (Σ target_base − Σ eaten of the finished, logged
 *   days before d) / days left incl. d, capped at ±cap. Monday starts at 0, nothing crosses
 *   the week boundary. Days without entries and vacation days don't count; vacation days
 *   have no target and aren't days left. target(d) = target_base(d) + carry(d).
 *
 * Settings apply per day (`paramsFor`), so a changed baseline or deficit never rewrites
 * past days, while late activities always recompute. Pure: shared by app and tests.
 */
import { addDays, type Day, weekDays, weekStart } from "./days";

export const SPORT_FACTOR_KEYS = ["virtualRide", "ridePower", "ride", "run", "trailRun", "weightTraining", "other"] as const;
export type SportFactorKey = (typeof SPORT_FACTOR_KEYS)[number];
export type SportFactors = Record<SportFactorKey, number>;

export const DEFAULT_SPORT_FACTORS: SportFactors = {
  virtualRide: 1.0, // power-based, kJ ≈ kcal
  ridePower: 1.0,
  ride: 0.8, // estimated from heart rate / speed
  run: 0.9,
  trailRun: 0.9,
  weightTraining: 0.6, // Strava overestimates strength training
  other: 0.8,
};

/** Days the EWMA runs before the first requested week (initial value has faded by then). */
export const CHAIN_DAYS = 56;
/** The EWMA starts with the mean of this many days. */
export const INIT_DAYS = 28;

export interface BudgetParams {
  /** Daily need incl. everyday movement, without workouts. */
  baselineKcal: number;
  /** Positive = deficit, negative = surplus. */
  deficitKcal: number;
  /** EWMA weight of yesterday (0.2 ≈ 3 days half-life). */
  alpha: number;
  activeEnabled: boolean;
  /** Weekly balance on/off. */
  carryEnabled: boolean;
  /** Max. balance correction per day. */
  carryCapKcal: number;
  sportFactors: SportFactors;
}

export interface ActivityInput {
  /** Strava kcal (incl. resting burn during the workout). */
  kcal: number;
  movingS: number;
  /** Strava sport_type. */
  sport: string;
  /** Power meter (Strava device_watts). */
  hasPower: boolean;
}

export interface BudgetDayInput {
  /** Eaten kcal; 0 = no entries ("not tracked"). */
  eaten: number;
  /** Vacation day. */
  untracked?: boolean;
  activities?: ActivityInput[];
}

export interface DayPlan {
  day: Day;
  week: Day;
  untracked: boolean;
  baseline: number;
  /** A_smooth(d): smoothed training kcal that count today. */
  smoothedActive: number;
  deficit: number;
  /** baseline + A_smooth − deficit. */
  targetBase: number;
  /** Weekly balance applied to this day (after the cap). */
  carry: number;
  /** Balance before the cap. */
  carryRaw: number;
  capped: boolean;
  /** Tagesziel (0 on vacation days). */
  target: number;
  eaten: number;
  /** Has food entries. */
  logged: boolean;
  /** A(d): cleaned active kcal of this day (count from tomorrow). */
  active: number;
  remaining: number;
  /** After today: target_base and carry are estimates. */
  projected: boolean;
}

export interface WeekSummary {
  start: Day;
  /** Days without vacation. */
  trackedDays: number;
  /** Σ target_base of the week (estimates for days after today). */
  targetBase: number;
  /** Σ eaten of the logged days so far. */
  eaten: number;
  /** Σ (target_base − eaten) of the finished, logged days: what the balance spreads. */
  balance: number;
}

export interface BudgetResult {
  days: Record<Day, DayPlan>;
  weeks: Record<Day, WeekSummary>;
}

const RIDE_TYPES = new Set(["Ride", "MountainBikeRide", "GravelRide"]);

export function sportFactorKey(sport: string, hasPower: boolean): SportFactorKey {
  if (sport === "VirtualRide") return "virtualRide";
  if (RIDE_TYPES.has(sport)) return hasPower ? "ridePower" : "ride";
  if (sport === "Run") return "run";
  if (sport === "TrailRun") return "trailRun";
  if (sport === "WeightTraining") return "weightTraining";
  return "other";
}

/** Defaults with the user's overrides (invalid values ignored). */
export function sportFactors(overrides: Partial<Record<string, unknown>> = {}): SportFactors {
  const result = { ...DEFAULT_SPORT_FACTORS };
  for (const key of SPORT_FACTOR_KEYS) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2) result[key] = value;
  }
  return result;
}

/** active_clean of one activity. */
export function cleanActivity(activity: ActivityInput, baselineKcal: number, factors: SportFactors): number {
  const restingDuringWorkout = (baselineKcal / 1440) * (activity.movingS / 60);
  const net = Math.max(0, activity.kcal - restingDuringWorkout);
  return net * factors[sportFactorKey(activity.sport, activity.hasPower)];
}

/** A(d): cleaned active kcal of a day (0 when active calories are off). */
export function dayActive(input: BudgetDayInput | undefined, params: BudgetParams): number {
  if (!params.activeEnabled || !input?.activities) return 0;
  return input.activities.reduce((sum, a) => sum + cleanActivity(a, params.baselineKcal, params.sportFactors), 0);
}

/** One EWMA step: A_smooth of the next day. */
export const smoothStep = (alpha: number, previousActive: number, previousSmoothed: number) => alpha * previousActive + (1 - alpha) * previousSmoothed;

/** First day of input data needed to simulate from `from`. */
export const inputStart = (from: Day): Day => addDays(weekStart(from), -CHAIN_DAYS - INIT_DAYS);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Targets for the whole weeks from `from` to `to`. `today` decides which days are finished
 * (before today), the current one (today, its activities count from tomorrow) and estimates
 * (after today: no further activity beyond the smoothed level, eaten on target).
 * Needs inputs from `inputStart(from)`.
 */
export function simulateBudget(inputs: Record<Day, BudgetDayInput>, paramsFor: (day: Day) => BudgetParams, today: Day, from: Day, to: Day): BudgetResult {
  const first = weekStart(from);
  const last = addDays(weekStart(to), 6);
  const chainStart = addDays(first, -CHAIN_DAYS);

  const activeCache = new Map<Day, number>();
  const active = (day: Day) => {
    let value = activeCache.get(day);
    if (value === undefined) {
      value = dayActive(inputs[day], paramsFor(day));
      activeCache.set(day, value);
    }
    return value;
  };

  // EWMA, initialized with the mean of the 28 days before the chain.
  let initSum = 0;
  for (let i = 1; i <= INIT_DAYS; i++) initSum += active(addDays(chainStart, -i));
  const smoothed = new Map<Day, number>([[chainStart, initSum / INIT_DAYS]]);
  for (let day = addDays(chainStart, 1); day <= last; day = addDays(day, 1)) {
    const previous = addDays(day, -1);
    const previousSmoothed = smoothed.get(previous)!;
    // Days after today: assume activity at the smoothed level (no jump either way).
    const previousActive = previous <= today ? active(previous) : previousSmoothed;
    smoothed.set(day, smoothStep(paramsFor(day).alpha, previousActive, previousSmoothed));
  }

  const days: Record<Day, DayPlan> = {};
  const weeks: Record<Day, WeekSummary> = {};
  for (let start = first; start <= last; start = addDays(start, 7)) {
    const week = weekDays(start);
    let sollSoFar = 0;
    let eatenSoFar = 0;
    let todayCarry = 0;
    const summary: WeekSummary = { start, trackedDays: 0, targetBase: 0, eaten: 0, balance: 0 };

    for (const day of week) {
      const input = inputs[day];
      const params = paramsFor(day);
      const untracked = Boolean(input?.untracked);
      const eaten = input?.eaten ?? 0;
      const smoothedActive = params.activeEnabled ? smoothed.get(day)! : 0;
      const targetBase = params.baselineKcal + smoothedActive - params.deficitKcal;
      const projected = day > today;

      let carryRaw = 0;
      if (!untracked) {
        if (projected) carryRaw = todayCarry;
        else {
          const daysLeft = week.filter((d) => d >= day && !inputs[d]?.untracked).length;
          carryRaw = (sollSoFar - eatenSoFar) / daysLeft;
        }
      }
      const cap = Math.max(params.carryCapKcal, 0);
      const carry = params.carryEnabled && !untracked ? clamp(carryRaw, -cap, cap) : 0;
      if (day === today) todayCarry = carryRaw;
      const target = untracked ? 0 : targetBase + carry;

      days[day] = {
        day,
        week: start,
        untracked,
        baseline: params.baselineKcal,
        smoothedActive,
        deficit: params.deficitKcal,
        targetBase,
        carry,
        carryRaw: params.carryEnabled ? carryRaw : 0,
        capped: params.carryEnabled && !untracked && Math.abs(carryRaw) > cap + 1e-9,
        target,
        eaten,
        logged: eaten > 0,
        active: active(day),
        remaining: target - eaten,
        projected,
      };

      if (untracked) continue;
      summary.trackedDays++;
      summary.targetBase += targetBase;
      if (eaten > 0 && day <= today) summary.eaten += eaten;
      // Finished, logged days feed the balance of the following days.
      if (day < today && eaten > 0) {
        sollSoFar += targetBase;
        eatenSoFar += eaten;
      }
    }
    summary.balance = sollSoFar - eatenSoFar;
    weeks[start] = summary;
  }
  return { days, weeks };
}
