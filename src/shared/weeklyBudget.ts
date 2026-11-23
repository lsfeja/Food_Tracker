/**
 * Weekly budget with "filling up" (V3).
 *
 * - A = average counted active kcal per tracked day over the 4 completed weeks before
 *   the week (fixed for the whole week).
 * - Planned demand N = base (rest + everyday movement) + A. Standard daily target
 *   T = N + goal (slider). Weekly plan = T × tracked days.
 * - Activity deviation of a day (actual − A):
 *   - more: added at once to that day and the rest of the week, spread over at least
 *     3 tracked days (Sat → Sat, Sun, Mon; Sun → Sun, Mon, Tue), never further;
 *   - less: on a rest day from the start of the day over that day and the rest of the
 *     week, on other days only after the day ended, over the following days.
 * - Food: what is eaten below/above a finished day's target moves to the following days
 *   of the week; at the end of the week the balance moves to the next week.
 * - Limits: a day never drops below max(base + 25 % A, N − max daily deficit); rest
 *   days never below base + rest-day % of A. Cuts that don't fit go to the next week,
 *   but only `carryOverPct` of them; extra calories carry over in full.
 * - Untracked (vacation) days are skipped everywhere.
 * - Days without food entries count as "not logged": their food balance isn't moved.
 */
import { addDays, type Day, weekDays, weekStart } from "./days";

export const FLOOR_ACTIVE_SHARE = 0.25;
export const MAX_GOAL_SURPLUS = 750;
/** Weeks simulated before the first requested week (carry-over chain). */
export const CHAIN_WEEKS = 8;
const AVERAGE_DAYS = 28;
const EPS = 1e-6;

export interface BudgetConfig {
  /** Grundumsatz: rest + everyday movement, without workouts. */
  baseKcal: number;
  /** Slider: negative = deficit, positive = surplus (kcal/day). */
  goalKcal: number;
  activeEnabled: boolean;
  /** 50…100: share of Strava kcal that counts. */
  activePercent: number;
  /** Rest-day minimum: base + this % of A. */
  restDayActivePct: number;
  /** Lowest target below N = base + A. */
  maxDailyDeficit: number;
  /** Share of an unplaceable cut moved to the next week. */
  carryOverPct: number;
}

export interface BudgetDayInput {
  /** Eaten kcal (0 = nothing logged). */
  eaten: number;
  /** Raw Strava active kcal. */
  active: number;
  restDay?: boolean;
  untracked?: boolean;
}

export interface WeekParams {
  /** A: average counted active kcal per tracked day (4 weeks). */
  average: number;
  /** N = base + A. */
  demand: number;
  /** Slider value after limits. */
  goal: number;
  /** T = N + goal. */
  standard: number;
  /** Lowest target of a normal day. */
  floor: number;
  /** Lowest target of a rest day. */
  restMinimum: number;
  /** Allowed slider range for this week. */
  goalRange: { min: number; max: number };
}

export interface DayPlan {
  day: Day;
  week: Day;
  restDay: boolean;
  /** Tagesziel (ring total). */
  target: number;
  /** Lowest allowed target of this day. */
  minimum: number;
  eaten: number;
  /** Counted active kcal. */
  active: number;
  remaining: number;
}

export interface WeekSummary {
  start: Day;
  params: WeekParams;
  trackedDays: number;
  /** T × tracked days. */
  plan: number;
  /** From the previous week (food balance, cuts). */
  carryIn: number;
  /** Extra activity from the previous weekend. */
  spillIn: number;
  /** Sum of all day targets (after all adjustments so far). */
  total: number;
  eaten: number;
  /** Base + counted active of the days so far ("filled up"). */
  filled: number;
  /** Planned fill of the days so far (N per day). */
  filledPlan: number;
  /** Targets of today and the following days minus what was eaten today. */
  remaining: number;
  /** Days from today to Sunday (tracked). */
  daysRemaining: number;
  /** To the next week; only final once the week is over. */
  carryOut: number;
  /** Cuts that didn't fit (before the carry-over share). */
  unplaced: number;
}

export interface BudgetResult {
  days: Record<Day, DayPlan>;
  weeks: Record<Day, WeekSummary>;
}

export const countedActive = (raw: number, config: Pick<BudgetConfig, "activeEnabled" | "activePercent">) =>
  config.activeEnabled && raw > 0 ? (raw * Math.min(Math.max(config.activePercent, 50), 100)) / 100 : 0;

/** A for the week starting `start`: the 4 completed weeks before it, vacation days excluded. */
export function activeAverage(inputs: Record<Day, BudgetDayInput>, start: Day, config: BudgetConfig): number {
  let sum = 0;
  let days = 0;
  for (let offset = AVERAGE_DAYS; offset >= 1; offset--) {
    const input = inputs[addDays(start, -offset)];
    if (input?.untracked) continue;
    days++;
    sum += countedActive(input?.active ?? 0, config);
  }
  return days > 0 ? sum / days : 0;
}

export function weekParams(config: BudgetConfig, average: number): WeekParams {
  const base = config.baseKcal;
  const demand = base + average;
  const maxDeficit = Math.max(config.maxDailyDeficit, 0);
  const floor = Math.max(base + FLOOR_ACTIVE_SHARE * average, demand - maxDeficit);
  const minGoal = Math.min(floor - demand, 0);
  const goal = Math.min(Math.max(config.goalKcal, minGoal), MAX_GOAL_SURPLUS);
  const restMinimum = Math.max(floor, base + (Math.min(Math.max(config.restDayActivePct, 0), 100) / 100) * average);
  return { average, demand, goal, standard: demand + goal, floor, restMinimum, goalRange: { min: minGoal, max: MAX_GOAL_SURPLUS } };
}

interface WeekState {
  carryIn: number;
  spillIn: Record<Day, number>;
}

function simulateWeek(
  start: Day,
  inputs: Record<Day, BudgetDayInput>,
  config: BudgetConfig,
  today: Day,
  state: WeekState,
): { days: DayPlan[]; summary: WeekSummary; next: WeekState } {
  const params = weekParams(config, activeAverage(inputs, start, config));
  const days = weekDays(start);
  const tracked = days.filter((d) => !inputs[d]?.untracked);
  const target: Record<Day, number> = {};
  const minimum: Record<Day, number> = {};
  for (const d of tracked) {
    target[d] = params.standard;
    minimum[d] = inputs[d]?.restDay ? params.restMinimum : params.floor;
  }

  /** Spreads `amount` evenly; cuts stop at each day's minimum. Returns what didn't fit. */
  const distribute = (amount: number, eligible: Day[]): number => {
    if (Math.abs(amount) < EPS) return 0;
    if (!eligible.length) return amount;
    if (amount > 0) {
      for (const d of eligible) target[d] += amount / eligible.length;
      return 0;
    }
    let rest = -amount;
    let open = eligible.filter((d) => target[d] - minimum[d] > EPS);
    while (rest > EPS && open.length) {
      const share = rest / open.length;
      const stillOpen: Day[] = [];
      for (const d of open) {
        const take = Math.min(target[d] - minimum[d], share);
        target[d] -= take;
        rest -= take;
        if (target[d] - minimum[d] > EPS) stillOpen.push(d);
      }
      open = stillOpen;
    }
    return -rest;
  };

  let unplaced = 0; // cuts that didn't fit (negative)
  let extraCarry = 0; // food left over at the end of the week (positive)
  const spillOut: Record<Day, number> = {};

  // Rest-day minimum above the standard target (large slider): take it from the other days.
  let raised = 0;
  for (const d of tracked) {
    if (target[d] < minimum[d]) {
      raised += minimum[d] - target[d];
      target[d] = minimum[d];
    }
  }
  if (raised > 0) unplaced += distribute(-raised, tracked.filter((d) => target[d] > minimum[d] + EPS));

  // Carried balance from the previous week, spread over the whole week.
  unplaced += Math.min(distribute(state.carryIn, tracked), 0);
  // Extra activity of the previous weekend.
  for (const [d, amount] of Object.entries(state.spillIn)) if (d in target) target[d] += amount;

  const after = (d: Day) => tracked.filter((x) => x > d);
  const fromDay = (d: Day) => tracked.filter((x) => x >= d);

  /** At least 3 tracked days from `d`, past Sunday if needed (looking at the following days' vacation flags). */
  const surplusWindow = (d: Day): Day[] => {
    const window = fromDay(d);
    let next = addDays(start, 7);
    let guard = 0;
    while (window.length < 3 && guard++ < 14) {
      if (!inputs[next]?.untracked) window.push(next);
      next = addDays(next, 1);
    }
    return window;
  };

  for (const d of days) {
    if (d > today) break;
    const input = inputs[d];
    if (input?.untracked) continue;
    const complete = d < today;
    const active = countedActive(input?.active ?? 0, config);
    const deviation = active - params.average;

    if (deviation > EPS) {
      const window = surplusWindow(d);
      const share = deviation / window.length;
      for (const x of window) {
        if (x in target) target[x] += share;
        else spillOut[x] = (spillOut[x] ?? 0) + share;
      }
    } else if (deviation < -EPS) {
      if (input?.restDay) unplaced += distribute(deviation, fromDay(d));
      else if (complete) unplaced += distribute(deviation, after(d));
    }

    if (complete && (input?.eaten ?? 0) > 0) {
      const balance = target[d] - input!.eaten;
      const following = after(d);
      if (balance > 0) {
        if (following.length) distribute(balance, following);
        else extraCarry += balance;
      } else {
        unplaced += distribute(balance, following);
      }
    }
  }

  const carryOut = extraCarry + (unplaced * Math.min(Math.max(config.carryOverPct, 0), 100)) / 100;

  const todayIndex = tracked.filter((d) => d >= today);
  let eaten = 0;
  let filled = 0;
  let filledDays = 0;
  const plans: DayPlan[] = tracked.map((d) => {
    const input = inputs[d];
    const dayEaten = input?.eaten ?? 0;
    const active = countedActive(input?.active ?? 0, config);
    eaten += dayEaten;
    if (d <= today) {
      filled += config.baseKcal + active;
      filledDays++;
    }
    return {
      day: d,
      week: start,
      restDay: Boolean(input?.restDay),
      target: target[d],
      minimum: minimum[d],
      eaten: dayEaten,
      active,
      remaining: target[d] - dayEaten,
    };
  });
  const total = tracked.reduce((sum, d) => sum + target[d], 0);
  const remaining =
    today < start ? total : todayIndex.reduce((sum, d) => sum + target[d], 0) - (todayIndex[0] === today ? (inputs[today]?.eaten ?? 0) : 0);

  return {
    days: plans,
    summary: {
      start,
      params,
      trackedDays: tracked.length,
      plan: params.standard * tracked.length,
      carryIn: state.carryIn,
      spillIn: Object.values(state.spillIn).reduce((a, b) => a + b, 0),
      total,
      eaten,
      filled,
      filledPlan: params.demand * filledDays,
      remaining: today > addDays(start, 6) ? total - eaten : remaining,
      daysRemaining: todayIndex.length,
      carryOut,
      unplaced,
    },
    next: { carryIn: carryOut, spillIn: spillOut },
  };
}

/**
 * Simulates the weeks from `from` to `to` (inclusive, any days; whole weeks are
 * computed), starting the carry-over chain CHAIN_WEEKS earlier. `today` decides which
 * days are finished. Needs inputs from 4 weeks before the chain start.
 */
export function simulateBudget(inputs: Record<Day, BudgetDayInput>, config: BudgetConfig, today: Day, from: Day, to: Day): BudgetResult {
  const days: Record<Day, DayPlan> = {};
  const weeks: Record<Day, WeekSummary> = {};
  const first = addDays(weekStart(from), -7 * CHAIN_WEEKS);
  const last = weekStart(to);
  let state: WeekState = { carryIn: 0, spillIn: {} };
  for (let start = first; start <= last; start = addDays(start, 7)) {
    const result = simulateWeek(start, inputs, config, today, state);
    state = result.next;
    if (start >= weekStart(from)) {
      weeks[start] = result.summary;
      for (const plan of result.days) days[plan.day] = plan;
    }
  }
  return { days, weeks };
}

/** First day of input data needed to simulate from `from`. */
export const inputStart = (from: Day): Day => addDays(weekStart(from), -7 * CHAIN_WEEKS - AVERAGE_DAYS);
