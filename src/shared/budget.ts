import { addDays, type Day, diffDays, weekStart } from "./days";
import { addNutrients, type Nutrients, zeroNutrients } from "./nutrients";
import { type BudgetSettings, effectiveWeeklyLimit, type NutritionTargets, type UserSettings } from "./settings";

/** Raw totals of one day. */
export interface DayTotals {
  eaten: Nutrients;
  /** Active calories from activities, before the counted percentage. */
  activeCalories: number;
}

export interface CalorieBudget {
  /** Daily target, or in weekly mode the allowance derived from the weekly limit. */
  baseTarget: number;
  /** Counted active calories (after percentage). */
  activeBonus: number;
  eaten: number;
  total: number;
  remaining: number;
  isOver: boolean;
  /** Eaten share of the total (above 1 = over budget). */
  progress: number;
}

export interface WeeklyBalance {
  weekStart: Day;
  limit: number;
  activeBonus: number;
  eaten: number;
  daysRemaining: number;
  total: number;
  remaining: number;
}

export interface DayBudget {
  day: Day;
  calories: CalorieBudget;
  eaten: Nutrients;
  targets: NutritionTargets;
  weekly: WeeklyBalance | null;
}

export const emptyTotals = (): DayTotals => ({ eaten: zeroNutrients(), activeCalories: 0 });

export function calorieBudget(baseTarget: number, activeBonus: number, eaten: number): CalorieBudget {
  const total = baseTarget + activeBonus;
  const remaining = total - eaten;
  return {
    baseTarget,
    activeBonus,
    eaten,
    total,
    remaining,
    isOver: remaining < 0,
    progress: total > 0 ? eaten / total : eaten > 0 ? 1 : 0,
  };
}

/** Share of raw active calories added to the budget. */
export function countedActiveCalories(raw: number, budget: BudgetSettings): number {
  if (!budget.activeCaloriesEnabled || raw <= 0) return 0;
  const percent = Math.min(Math.max(budget.activeCaloriesPercent, 50), 100);
  return Math.round((raw * percent) / 100);
}

/**
 * Budget for `day`. Remaining = target + counted active − eaten. Weekly mode (rolling,
 * Monday-based): allowance = (limit + counted active of earlier days − eaten on earlier
 * days) ÷ days left including today.
 */
export function budgetFor(day: Day, settings: Pick<UserSettings, "targets" | "budget">, totalsByDay: Record<Day, DayTotals>): DayBudget {
  const totals = totalsByDay[day] ?? emptyTotals();
  const activeToday = countedActiveCalories(totals.activeCalories, settings.budget);
  const { targets } = settings;

  if (!settings.budget.weeklyModeEnabled) {
    return {
      day,
      calories: calorieBudget(targets.kcal, activeToday, totals.eaten.kcal),
      eaten: totals.eaten,
      targets,
      weekly: null,
    };
  }

  const start = weekStart(day);
  const elapsed = diffDays(start, day);
  let previousEaten = 0;
  let previousActive = 0;
  for (let index = 0; index < elapsed; index++) {
    const previous = totalsByDay[addDays(start, index)] ?? emptyTotals();
    previousEaten += previous.eaten.kcal;
    previousActive += countedActiveCalories(previous.activeCalories, settings.budget);
  }
  const daysRemaining = Math.max(7 - elapsed, 1);
  const limit = effectiveWeeklyLimit(settings.budget, targets.kcal);
  const allowance = Math.round(Math.max((limit + previousActive - previousEaten) / daysRemaining, 0));
  const activeBonus = previousActive + activeToday;
  const eaten = previousEaten + totals.eaten.kcal;

  return {
    day,
    calories: calorieBudget(allowance, activeToday, totals.eaten.kcal),
    eaten: totals.eaten,
    targets,
    weekly: {
      weekStart: start,
      limit,
      activeBonus,
      eaten,
      daysRemaining,
      total: limit + activeBonus,
      remaining: limit + activeBonus - eaten,
    },
  };
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
