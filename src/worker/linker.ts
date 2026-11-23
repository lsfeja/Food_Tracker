import { addDays, type Day } from "../shared/days";
import { matchActivities } from "../shared/matcher";
import { isSport, sportFromActivityType } from "../shared/workout";

type Row = Record<string, unknown>;

interface LinkState {
  id: string;
  day: Day;
  position: number;
  sport: string;
  status: string;
  completed_at: number | null;
  linked_activity_key: string | null;
  link_manual: number;
  auto_link_suppressed: number;
  completed_by_link: number;
}

const snapshot = (s: LinkState) =>
  JSON.stringify([s.status, s.completed_at, s.linked_activity_key, s.link_manual, s.auto_link_suppressed, s.completed_by_link]);

/** Removes a link; reverts "done" if the link had completed the session. */
export function clearLink(s: LinkState) {
  s.linked_activity_key = null;
  s.link_manual = 0;
  if (s.completed_by_link) {
    s.status = "planned";
    s.completed_at = null;
    s.completed_by_link = 0;
  }
}

/** A new link marks a planned session done. */
export function markDoneByLink(s: LinkState, at: number | null) {
  if (s.status !== "planned") return;
  s.status = "done";
  s.completed_at = at ?? Date.now();
  s.completed_by_link = 1;
}

export function updateLinkStatement(db: D1Database, s: LinkState): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE planned_sessions SET status = ?, completed_at = ?, linked_activity_key = ?, link_manual = ?, auto_link_suppressed = ?, completed_by_link = ?
       WHERE id = ?`,
    )
    .bind(s.status, s.completed_at, s.linked_activity_key, s.link_manual, s.auto_link_suppressed, s.completed_by_link, s.id);
}

export async function loadLinkState(db: D1Database, userId: string, sessionId: string): Promise<LinkState | null> {
  return db.prepare("SELECT * FROM planned_sessions WHERE id = ? AND user_id = ?").bind(sessionId, userId).first<LinkState>();
}

/**
 * Re-runs automatic matching (same day, same match group, day order, each activity
 * once) for `days`. Returns true if anything changed.
 */
export async function autoLink(db: D1Database, userId: string, days: Day[]): Promise<boolean> {
  const unique = [...new Set(days)].sort();
  if (!unique.length) return false;
  const from = unique[0];
  const to = addDays(unique[unique.length - 1], 1);
  const [sessionResult, activityResult] = await db.batch([
    db.prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND day >= ? AND day < ?").bind(userId, from, to),
    db.prepare("SELECT source, external_id, type, start_at, day FROM activities WHERE user_id = ? AND day >= ? AND day < ?").bind(userId, from, to),
  ]);
  const sessions = (sessionResult.results ?? []) as unknown as LinkState[];
  if (!sessions.length) return false;
  const activities = ((activityResult.results ?? []) as Row[]).map((a) => ({
    key: `${a.source}:${a.external_id}`,
    sport: sportFromActivityType(String(a.type)),
    start: Number(a.start_at),
    day: String(a.day),
  }));

  // Manual links to an activity on another day stay while that activity exists.
  const foreign = sessions.filter((s) => s.link_manual && s.linked_activity_key && !activities.some((a) => a.key === s.linked_activity_key));
  const kept = new Set<string>();
  if (foreign.length) {
    const keys = foreign.map((s) => s.linked_activity_key as string);
    const existing = await db
      .prepare(`SELECT source || ':' || external_id AS key FROM activities WHERE user_id = ? AND source || ':' || external_id IN (${keys.map(() => "?").join(", ")})`)
      .bind(userId, ...keys)
      .all<{ key: string }>();
    const found = new Set((existing.results ?? []).map((r) => r.key));
    for (const s of foreign) if (found.has(s.linked_activity_key as string)) kept.add(s.id);
  }

  const statements: D1PreparedStatement[] = [];
  for (const day of unique) {
    const daySessions = sessions.filter((s) => s.day === day && !kept.has(s.id));
    if (!daySessions.length) continue;
    const dayActivities = activities.filter((a) => a.day === day);
    const result = matchActivities(
      daySessions.map((s) => ({
        id: s.id,
        sport: isSport(s.sport) ? s.sport : "custom",
        order: Number(s.position),
        linkedKey: s.linked_activity_key,
        autoLinkSuppressed: Number(s.auto_link_suppressed) === 1,
        isSkipped: s.status === "skipped",
      })),
      dayActivities,
    );
    for (const session of daySessions) {
      const before = snapshot(session);
      if (result.unlinks.includes(session.id)) clearLink(session);
      const key = result.links[session.id];
      if (key) {
        session.linked_activity_key = key;
        session.link_manual = 0;
        markDoneByLink(session, dayActivities.find((a) => a.key === key)?.start ?? null);
      }
      if (snapshot(session) !== before) statements.push(updateLinkStatement(db, session));
    }
  }
  if (statements.length) await db.batch(statements);
  return statements.length > 0;
}
