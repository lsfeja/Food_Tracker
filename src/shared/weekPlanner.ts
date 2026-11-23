import { addDays, type Day, weekdayIndex } from "./days";
import { resetContent, type WorkoutContent } from "./workout";

export interface TemplateSession {
  id: string;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  order: number;
  content: WorkoutContent;
}

export interface PlanItem {
  day: Day;
  order: number;
  content: WorkoutContent;
}

/** Template sessions → concrete sessions of the week starting `weekStart`, appended after `nextOrder` per day. */
export function instantiateTemplate(template: TemplateSession[], weekStart: Day, nextOrder: Record<Day, number> = {}): PlanItem[] {
  const next = { ...nextOrder };
  return [...template]
    .filter((session) => session.weekday >= 0 && session.weekday <= 6)
    .sort((a, b) => a.weekday - b.weekday || a.order - b.order)
    .map((session) => {
      const day = addDays(weekStart, session.weekday);
      const order = next[day] ?? 0;
      next[day] = order + 1;
      return { day, order, content: resetContent(session.content) };
    });
}

/** A week's sessions → template sessions (weekday from day, orders renumbered, progress removed). */
export function templateFromWeek(items: PlanItem[], makeId: () => string): TemplateSession[] {
  const counters: Record<number, number> = {};
  return [...items]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order))
    .map((item) => {
      const weekday = weekdayIndex(item.day);
      const order = counters[weekday] ?? 0;
      counters[weekday] = order + 1;
      return { id: makeId(), weekday, order, content: resetContent(item.content) };
    });
}

/** Order of `ids` after moving `id` in front of `target` (or to the end). */
export function reorder<T>(ids: T[], id: T, target: T | null): T[] {
  const result = ids.filter((value) => value !== id);
  const index = target === null ? -1 : result.indexOf(target);
  if (index >= 0) result.splice(index, 0, id);
  else result.push(id);
  return result;
}
