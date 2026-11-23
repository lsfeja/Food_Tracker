import type { Day } from "./days";
import { addNutrients, type Nutrients, zeroNutrients } from "./nutrients";
import { budgetConfig, type NutritionTargets, type UserSettings } from "./settings";
import { type BudgetDayInput, type BudgetResult, type DayPlan, simulateBudget, type WeekSummary } from "./weeklyBudget";

/** Raw totals of one day. */
export interface DayTotals {
  eaten: Nutrients;
  /** Active calories from activities, before the counted percentage. */
  activeCalories: number;
  /** A rest day is planned (Plan tab). */
  restDay?: boolean;
  /** Vacation: not tracked. */
  untracked?: boolean;
}

export interface CalorieBudget {
  eaten: number;
  /** Tagesziel. */
  total: number;
  remaining: number;
  isOver: boolean;
  /** Eaten share of the total (above 1 = over budget). */
  progress: number;
}

export interface DayBudget {
  day: Day;
  calories: CalorieBudget;
  eaten: Nutrients;
  /** Counted active kcal of the day. */
  active: number;
  targets: NutritionTargets;
  plan: DayPlan | null;
  week: WeekSummary | null;
}

export const emptyTotals = (): DayTotals => ({ eaten: zeroNutrients(), activeCalories: 0 });

export function calorieBudget(total: number, eaten: number): CalorieBudget {
  const remaining = total - eaten;
  return { eaten, total, remaining, isOver: remaining < 0, progress: total > 0 ? eaten / total : eaten > 0 ? 1 : 0 };
}

export function budgetInputs(totals: Record<Day, DayTotals>): Record<Day, BudgetDayInput> {
  const inputs: Record<Day, BudgetDayInput> = {};
  for (const [day, t] of Object.entries(totals)) {
    inputs[day] = { eaten: t.eaten.kcal, active: t.activeCalories, restDay: t.restDay, untracked: t.untracked };
  }
  return inputs;
}

/** Weekly budget for the days from `from` to `to` (see weeklyBudget.ts). */
export function budgetRange(
  settings: Pick<UserSettings, "targets" | "budget">,
  totals: Record<Day, DayTotals>,
  today: Day,
  from: Day,
  to: Day,
): BudgetResult {
  return simulateBudget(budgetInputs(totals), budgetConfig(settings), today, from, to);
}

export function dayBudget(day: Day, totals: Record<Day, DayTotals>, result: BudgetResult, targets: NutritionTargets): DayBudget {
  const dayTotals = totals[day] ?? emptyTotals();
  const plan = result.days[day] ?? null;
  const week = plan ? result.weeks[plan.week] : null;
  return {
    day,
    calories: calorieBudget(plan?.target ?? 0, dayTotals.eaten.kcal),
    eaten: dayTotals.eaten,
    active: plan?.active ?? 0,
    targets,
    plan,
    week,
  };
}

/** Budget of one day; `totals` must reach back to `inputStart(day)`. */
export function budgetFor(day: Day, settings: Pick<UserSettings, "targets" | "budget">, totals: Record<Day, DayTotals>, today: Day): DayBudget {
  return dayBudget(day, totals, budgetRange(settings, totals, today, day, day), settings.targets);
}

export interface EntryLike {
  day: Day;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ActivityLike {
  day: Day;
  activeKcal: number;
}

/** Groups entries and activities into per-day totals. */
export function totalsByDay(entries: EntryLike[], activities: ActivityLike[]): Record<Day, DayTotals> {
  const result: Record<Day, DayTotals> = {};
  for (const entry of entries) {
    const totals = (result[entry.day] ??= emptyTotals());
    totals.eaten = addNutrients(totals.eaten, entry);
  }
  for (const activity of activities) {
    const totals = (result[activity.day] ??= emptyTotals());
    totals.activeCalories += activity.activeKcal;
  }
  return result;
}

