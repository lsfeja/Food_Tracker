import { budgetFor, countedActiveCalories, type DayTotals, emptyTotals } from "./budget";
import { addDays, type Day, weekStart } from "./days";
import type { Nutrients } from "./nutrients";
import { effectiveWeeklyLimit, type UserSettings } from "./settings";

export interface DayStat {
  day: Day;
  eaten: Nutrients;
  activeCalories: number;
  /** Total budget of the day (target/allowance + counted active). */
  budget: number;
  hasData: boolean;
}

export interface WeekStat {
  start: Day;
  eatenKcal: number;
  /** Weekly limit + counted active calories. */
  budget: number;
  loggedDays: number;
  averagePerLoggedDay: number;
}

/** `count` days ending with `today`, oldest first. */
export function dayStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: UserSettings): DayStat[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index - count + 1)).map((day) => {
    const dayTotals = totals[day] ?? emptyTotals();
    return {
      day,
      eaten: dayTotals.eaten,
      activeCalories: dayTotals.activeCalories,
      budget: budgetFor(day, settings, totals).calories.total,
      hasData: dayTotals.eaten.kcal > 0 || dayTotals.activeCalories > 0,
    };
  });
}

/** `count` Monday-based weeks ending with the week of `today`, oldest first. */
export function weekStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: UserSettings): WeekStat[] {
  const current = weekStart(today);
  const limit = effectiveWeeklyLimit(settings.budget, settings.targets.kcal);
  return Array.from({ length: count }, (_, index) => addDays(current, 7 * (index - count + 1))).map((start) => {
    let eaten = 0;
    let active = 0;
    let logged = 0;
    for (let offset = 0; offset < 7; offset++) {
      const dayTotals = totals[addDays(start, offset)] ?? emptyTotals();
      eaten += dayTotals.eaten.kcal;
      active += countedActiveCalories(dayTotals.activeCalories, settings.budget);
      if (dayTotals.eaten.kcal > 0) logged++;
    }
    return {
      start,
      eatenKcal: eaten,
      budget: limit + active,
      loggedDays: logged,
      averagePerLoggedDay: logged > 0 ? eaten / logged : 0,
    };
  });
}
