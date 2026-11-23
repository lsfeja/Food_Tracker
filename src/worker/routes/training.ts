import { Hono } from "hono";
import type { PlanWeekDTO, SessionDTO, WeekTemplateDTO, WorkoutTemplateDTO } from "../../shared/api";
import { addDays, type Day, weekDays } from "../../shared/days";
import type { TemplateSession } from "../../shared/weekPlanner";
import { instantiateTemplate, reorder, templateFromWeek } from "../../shared/weekPlanner";
import {
  displayTitle,
  newContent,
  parseContent,
  parseDetails,
  resetContent,
  sportFromActivityType,
  sportInfo,
  type WorkoutContent,
  withNewIds,
} from "../../shared/workout";
import { activityFromRow, newId, sessionFromRow } from "../db";
import type { AppContext } from "../env";
import { badRequest, jsonBody, notFound, num, requireDay, str } from "../http";
import { autoLink, clearLink, loadLinkState, markDoneByLink, updateLinkStatement } from "../linker";

export const training = new Hono<AppContext>();

type Row = Record<string, unknown>;

// MARK: Helpers

async function sessionsOn(db: D1Database, userId: string, day: Day): Promise<Row[]> {
  const result = await db.prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND day = ? ORDER BY position, created_at").bind(userId, day).all<Row>();
  return result.results ?? [];
}

async function nextPosition(db: D1Database, userId: string, day: Day): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM planned_sessions WHERE user_id = ? AND day = ?").bind(userId, day).first<{ next: number }>();
  return Number(row?.next ?? 0);
}

function positionStatements(db: D1Database, ids: string[]): D1PreparedStatement[] {
  return ids.map((id, index) => db.prepare("UPDATE planned_sessions SET position = ? WHERE id = ?").bind(index, id));
}

async function renumber(db: D1Database, userId: string, day: Day): Promise<void> {
  const rows = await sessionsOn(db, userId, day);
  if (rows.length) await db.batch(positionStatements(db, rows.map((r) => String(r.id))));
}

async function getSession(db: D1Database, userId: string, id: string): Promise<Row> {
  const row = await db.prepare("SELECT * FROM planned_sessions WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  if (!row) notFound("Session not found");
  return row;
}

async function sessionDTO(db: D1Database, id: string): Promise<SessionDTO> {
  const row = await db.prepare("SELECT * FROM planned_sessions WHERE id = ?").bind(id).first<Row>();
  if (!row) notFound("Session not found");
  return sessionFromRow(row);
}

function insertSession(db: D1Database, userId: string, day: Day, position: number, content: WorkoutContent, templateId: string | null, id = newId()) {
  return db
    .prepare(
      `INSERT INTO planned_sessions (id, user_id, day, position, sport, title, status, details, template_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
    )
    .bind(id, userId, day, position, content.sport, content.title, JSON.stringify(content.details), templateId, Date.now());
}

function requireContent(raw: unknown): WorkoutContent {
  const content = parseContent(raw);
  if (!content) badRequest("content with a valid sport is required");
  return content;
}

// MARK: Calendar

training.get("/plan/week/:start", async (c) => {
  const start = requireDay(c.req.param("start"), "start");
  const end = addDays(start, 7);
  const userId = c.get("userId");
  const db = c.env.DB;
  const [sessions, activities] = await db.batch([
    db.prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND day >= ? AND day < ? ORDER BY day, position, created_at").bind(userId, start, end),
    db.prepare("SELECT * FROM activities WHERE user_id = ? AND day >= ? AND day < ? ORDER BY start_at").bind(userId, start, end),
  ]);
  const result: PlanWeekDTO = {
    sessions: ((sessions.results ?? []) as Row[]).map(sessionFromRow),
    activities: ((activities.results ?? []) as Row[]).map(activityFromRow),
  };
  return c.json(result);
});

/** Session with the day's activities (for linking) and its linked activity. */
training.get("/sessions/:id", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const row = await getSession(db, userId, c.req.param("id"));
  const session = sessionFromRow(row);
  const day = await db.prepare("SELECT * FROM activities WHERE user_id = ? AND day = ? ORDER BY start_at").bind(userId, session.day).all<Row>();
  const dayActivities = (day.results ?? []).map(activityFromRow);
  let linked = dayActivities.find((a) => a.key === session.linkedActivityKey) ?? null;
  if (!linked && session.linkedActivityKey) {
    const row = await db
      .prepare("SELECT * FROM activities WHERE user_id = ? AND source || ':' || external_id = ?")
      .bind(userId, session.linkedActivityKey)
      .first<Row>();
    linked = row ? activityFromRow(row) : null;
  }
  const linkedElsewhere = await db
    .prepare("SELECT linked_activity_key AS key FROM planned_sessions WHERE user_id = ? AND day = ? AND id != ? AND linked_activity_key IS NOT NULL")
    .bind(userId, session.day, session.id)
    .all<{ key: string }>();
  return c.json({ session, dayActivities, linkedActivity: linked, otherLinkedKeys: (linkedElsewhere.results ?? []).map((r) => r.key) });
});

/** All strength sessions (exercise history, "last time", records). */
training.get("/strength-sessions", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id, day, status, details FROM planned_sessions WHERE user_id = ? AND sport = 'strength' ORDER BY day, position")
    .bind(c.get("userId"))
    .all<Row>();
  return c.json(
    (rows.results ?? []).map((r) => ({ id: String(r.id), day: String(r.day), status: String(r.status), details: parseDetails(String(r.details), "strength") })),
  );
});

training.post("/sessions", async (c) => {
  const body = await jsonBody<{ day?: string; content?: unknown; templateId?: string | null }>(c.req.raw);
  const day = requireDay(body.day);
  const content = requireContent(body.content);
  const userId = c.get("userId");
  const db = c.env.DB;
  const id = newId();
  await insertSession(db, userId, day, await nextPosition(db, userId, day), content, body.templateId ?? null, id).run();
  await autoLink(db, userId, [day]);
  return c.json(await sessionDTO(db, id), 201);
});

/** Updates content (title, sport, details) and/or status. */
training.patch("/sessions/:id", async (c) => {
  const body = await jsonBody<{ content?: unknown; status?: string; details?: unknown }>(c.req.raw);
  const userId = c.get("userId");
  const db = c.env.DB;
  const row = await getSession(db, userId, c.req.param("id"));
  const session = sessionFromRow(row);
  const statements: D1PreparedStatement[] = [];

  if (body.content !== undefined) {
    const content = requireContent(body.content);
    statements.push(
      db.prepare("UPDATE planned_sessions SET sport = ?, title = ?, details = ? WHERE id = ?").bind(content.sport, content.title, JSON.stringify(content.details), session.id),
    );
  } else if (body.details !== undefined) {
    // Set tracking: details only (keeps sport and title).
    const details = parseDetails(body.details, sportInfo[session.sport].category);
    statements.push(db.prepare("UPDATE planned_sessions SET details = ? WHERE id = ?").bind(JSON.stringify(details), session.id));
  }

  if (body.status !== undefined) {
    if (!["planned", "done", "skipped"].includes(body.status)) badRequest("Invalid status");
    const completedAt = body.status === "done" ? (session.status === "done" ? session.completedAt : Date.now()) : null;
    const byLink = body.status === "done" && session.status === "done" ? (session.completedByLink ? 1 : 0) : 0;
    statements.push(
      db.prepare("UPDATE planned_sessions SET status = ?, completed_at = ?, completed_by_link = ? WHERE id = ?").bind(body.status, completedAt, byLink, session.id),
    );
  }
  if (statements.length) await db.batch(statements);
  if (body.content !== undefined || body.status === "planned") await autoLink(db, userId, [session.day]);
  return c.json(await sessionDTO(db, session.id));
});

training.delete("/sessions/:id", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const row = await db.prepare("SELECT day FROM planned_sessions WHERE id = ? AND user_id = ?").bind(c.req.param("id"), userId).first<{ day: string }>();
  if (!row) return c.body(null, 204);
  await db.prepare("DELETE FROM planned_sessions WHERE id = ?").bind(c.req.param("id")).run();
  await renumber(db, userId, row.day);
  await autoLink(db, userId, [row.day]);
  return c.body(null, 204);
});

/** Copy on the same day, right after the original, without progress. */
training.post("/sessions/:id/duplicate", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const session = sessionFromRow(await getSession(db, userId, c.req.param("id")));
  const ids = (await sessionsOn(db, userId, session.day)).map((r) => String(r.id));
  const copyId = newId();
  const content = resetContent({ sport: session.sport, title: session.title, details: withNewIds(session.details) });
  const ordered = [...ids];
  ordered.splice(ids.indexOf(session.id) + 1, 0, copyId);
  await db.batch([insertSession(db, userId, session.day, 0, content, session.templateId, copyId), ...positionStatements(db, ordered)]);
  await autoLink(db, userId, [session.day]);
  return c.json(await sessionDTO(db, copyId), 201);
});

/** Moves a session to `day`, in front of `before` (or to the end of the day). */
training.post("/sessions/:id/move", async (c) => {
  const body = await jsonBody<{ day?: string; before?: string | null }>(c.req.raw);
  const day = requireDay(body.day);
  const userId = c.get("userId");
  const db = c.env.DB;
  const state = await loadLinkState(db, userId, c.req.param("id"));
  if (!state) notFound("Session not found");
  const oldDay = state.day;
  if (body.before === state.id) return c.json(await sessionDTO(db, state.id));
  const statements: D1PreparedStatement[] = [];
  if (oldDay !== day) {
    // Moving changes which activities it can match.
    if (!state.link_manual && state.linked_activity_key) {
      clearLink(state);
      statements.push(updateLinkStatement(db, state));
    }
    statements.push(db.prepare("UPDATE planned_sessions SET day = ? WHERE id = ?").bind(day, state.id));
  }
  const others = (await sessionsOn(db, userId, day)).map((r) => String(r.id)).filter((id) => id !== state.id);
  const ordered = reorder([...others, state.id], state.id, body.before ?? null);
  statements.push(...positionStatements(db, ordered));
  await db.batch(statements);
  if (oldDay !== day) await renumber(db, userId, oldDay);
  await autoLink(db, userId, oldDay === day ? [day] : [oldDay, day]);
  return c.json(await sessionDTO(db, state.id));
});

// MARK: Activity links

training.post("/sessions/:id/link", async (c) => {
  const body = await jsonBody<{ activityKey?: string }>(c.req.raw);
  const key = str(body.activityKey);
  const userId = c.get("userId");
  const db = c.env.DB;
  const state = await loadLinkState(db, userId, c.req.param("id"));
  if (!state) notFound("Session not found");
  const activity = await db.prepare("SELECT * FROM activities WHERE user_id = ? AND source || ':' || external_id = ?").bind(userId, key).first<Row>();
  if (!activity) notFound("Activity not found");
  const statements: D1PreparedStatement[] = [];
  // An activity belongs to one session.
  const others = await db
    .prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND linked_activity_key = ? AND id != ?")
    .bind(userId, key, state.id)
    .all<Parameters<typeof clearLink>[0]>();
  for (const other of others.results ?? []) {
    clearLink(other);
    other.auto_link_suppressed = 1;
    statements.push(updateLinkStatement(db, other));
  }
  state.linked_activity_key = key;
  state.link_manual = 1;
  state.auto_link_suppressed = 0;
  markDoneByLink(state, Number(activity.start_at));
  statements.push(updateLinkStatement(db, state));
  await db.batch(statements);
  return c.json(await sessionDTO(db, state.id));
});

/** Manual unlink: the session won't be matched automatically again. */
training.post("/sessions/:id/unlink", async (c) => {
  const db = c.env.DB;
  const state = await loadLinkState(db, c.get("userId"), c.req.param("id"));
  if (!state) notFound("Session not found");
  clearLink(state);
  state.auto_link_suppressed = 1;
  await updateLinkStatement(db, state).run();
  return c.json(await sessionDTO(db, state.id));
});

/** Creates a completed session for an unplanned activity and links it. */
training.post("/activities/:key/session", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const key = decodeURIComponent(c.req.param("key"));
  const activity = await db.prepare("SELECT * FROM activities WHERE user_id = ? AND source || ':' || external_id = ?").bind(userId, key).first<Row>();
  if (!activity) notFound("Activity not found");
  const a = activityFromRow(activity);
  const sport = sportFromActivityType(a.type) ?? "custom";
  const content = newContent(sport, a.name);
  const minutes = Math.round(a.durationS / 60);
  if (content.details.kind === "endurance") {
    content.details = { ...content.details, durationMinutes: minutes, distanceKm: a.distanceM > 0 ? Math.round(a.distanceM / 100) / 10 : null };
  } else if (content.details.kind === "general") {
    content.details = { ...content.details, durationMinutes: minutes };
  }
  const id = newId();
  await db.batch([
    insertSession(db, userId, a.day, await nextPosition(db, userId, a.day), content, null, id),
    db
      .prepare("UPDATE planned_sessions SET status = 'done', completed_at = ?, completed_by_link = 1, linked_activity_key = ?, link_manual = 1 WHERE id = ?")
      .bind(a.startAt, key, id),
  ]);
  return c.json(await sessionDTO(db, id), 201);
});

// MARK: Workout library

function templateFromRow(r: Row): WorkoutTemplateDTO {
  const sport = String(r.sport) as WorkoutTemplateDTO["sport"];
  const known = sport in sportInfo ? sport : "custom";
  return {
    id: String(r.id),
    name: String(r.name),
    sport: known,
    details: parseDetails(String(r.details ?? "{}"), sportInfo[known].category),
    updatedAt: Number(r.updated_at),
    lastUsedAt: r.last_used_at === null ? null : Number(r.last_used_at),
    useCount: Number(r.use_count ?? 0),
  };
}

async function libraryItem(db: D1Database, userId: string, id: string): Promise<WorkoutTemplateDTO> {
  const row = await db.prepare("SELECT * FROM workout_templates WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  if (!row) notFound("Workout not found");
  return templateFromRow(row);
}

training.get("/library", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM workout_templates WHERE user_id = ? ORDER BY name COLLATE NOCASE").bind(c.get("userId")).all<Row>();
  return c.json((rows.results ?? []).map(templateFromRow));
});

/** Saves a workout (new, or copied from a session). Progress is never stored. */
training.post("/library", async (c) => {
  const body = await jsonBody<{ content?: unknown }>(c.req.raw);
  const content = resetContent(requireContent(body.content));
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO workout_templates (id, user_id, name, sport, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, c.get("userId"), displayTitle(content), content.sport, JSON.stringify(withNewIds(content.details)), now, now)
    .run();
  return c.json(await libraryItem(c.env.DB, c.get("userId"), id), 201);
});

training.put("/library/:id", async (c) => {
  const body = await jsonBody<{ content?: unknown }>(c.req.raw);
  const content = resetContent(requireContent(body.content));
  const result = await c.env.DB.prepare("UPDATE workout_templates SET name = ?, sport = ?, details = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(displayTitle(content), content.sport, JSON.stringify(content.details), Date.now(), c.req.param("id"), c.get("userId"))
    .run();
  if (!result.meta.changes) notFound("Workout not found");
  return c.json(await libraryItem(c.env.DB, c.get("userId"), c.req.param("id")));
});

training.post("/library/:id/duplicate", async (c) => {
  const item = await libraryItem(c.env.DB, c.get("userId"), c.req.param("id"));
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO workout_templates (id, user_id, name, sport, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, c.get("userId"), `${item.name} Copy`, item.sport, JSON.stringify(withNewIds(item.details)), now, now)
    .run();
  return c.json(await libraryItem(c.env.DB, c.get("userId"), id), 201);
});

training.delete("/library/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM workout_templates WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("userId")).run();
  return c.body(null, 204);
});

/** "Copy on use": the session gets its own copy; editing the workout never changes it. */
training.post("/library/:id/schedule", async (c) => {
  const body = await jsonBody<{ day?: string }>(c.req.raw);
  const day = requireDay(body.day);
  const userId = c.get("userId");
  const db = c.env.DB;
  const item = await libraryItem(db, userId, c.req.param("id"));
  const id = newId();
  const content: WorkoutContent = { sport: item.sport, title: item.name, details: withNewIds(item.details) };
  await db.batch([
    insertSession(db, userId, day, await nextPosition(db, userId, day), content, item.id, id),
    db.prepare("UPDATE workout_templates SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?").bind(Date.now(), item.id),
  ]);
  await autoLink(db, userId, [day]);
  return c.json(await sessionDTO(db, id), 201);
});

// MARK: Week templates

function parseTemplateSessions(raw: unknown): TemplateSession[] {
  const list = Array.isArray(raw) ? raw : [];
  const result: TemplateSession[] = [];
  for (const item of list) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const content = parseContent(o.content);
    const weekday = num(o.weekday, -1);
    if (!content || weekday < 0 || weekday > 6) continue;
    result.push({ id: typeof o.id === "string" && o.id ? o.id : newId(), weekday: Math.floor(weekday), order: num(o.order, 0), content: resetContent(content) });
  }
  return result;
}

function weekTemplateFromRow(r: Row): WeekTemplateDTO {
  let sessions: unknown = [];
  try {
    sessions = JSON.parse(String(r.sessions ?? "[]"));
  } catch {
    sessions = [];
  }
  return { id: String(r.id), name: String(r.name), sessions: parseTemplateSessions(sessions), updatedAt: Number(r.updated_at) };
}

async function weekTemplate(db: D1Database, userId: string, id: string): Promise<WeekTemplateDTO> {
  const row = await db.prepare("SELECT * FROM week_templates WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  if (!row) notFound("Week template not found");
  return weekTemplateFromRow(row);
}

async function createWeekTemplate(db: D1Database, userId: string, name: string, sessions: TemplateSession[]) {
  const id = newId();
  const now = Date.now();
  await db.prepare("INSERT INTO week_templates (id, user_id, name, sessions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, userId, name, JSON.stringify(sessions), now, now)
    .run();
  return weekTemplate(db, userId, id);
}

const templateName = (value: unknown) => {
  const name = str(value).trim();
  if (!name) badRequest("name is required");
  return name;
};

training.get("/week-templates", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM week_templates WHERE user_id = ? ORDER BY name COLLATE NOCASE").bind(c.get("userId")).all<Row>();
  return c.json((rows.results ?? []).map(weekTemplateFromRow));
});

training.post("/week-templates", async (c) => {
  const body = await jsonBody<{ name?: string; sessions?: unknown }>(c.req.raw);
  return c.json(await createWeekTemplate(c.env.DB, c.get("userId"), templateName(body.name), parseTemplateSessions(body.sessions)), 201);
});

training.put("/week-templates/:id", async (c) => {
  const body = await jsonBody<{ name?: string; sessions?: unknown }>(c.req.raw);
  const result = await c.env.DB.prepare("UPDATE week_templates SET name = ?, sessions = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(templateName(body.name), JSON.stringify(parseTemplateSessions(body.sessions)), Date.now(), c.req.param("id"), c.get("userId"))
    .run();
  if (!result.meta.changes) notFound("Week template not found");
  return c.json(await weekTemplate(c.env.DB, c.get("userId"), c.req.param("id")));
});

training.post("/week-templates/:id/duplicate", async (c) => {
  const template = await weekTemplate(c.env.DB, c.get("userId"), c.req.param("id"));
  const sessions = template.sessions.map((s) => ({ ...s, id: newId(), content: { ...s.content, details: withNewIds(s.content.details) } }));
  return c.json(await createWeekTemplate(c.env.DB, c.get("userId"), `${template.name} Copy`, sessions), 201);
});

training.delete("/week-templates/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM week_templates WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("userId")).run();
  return c.body(null, 204);
});

/** Saves the sessions of a week as a template (progress removed). */
training.post("/week-templates/from-week", async (c) => {
  const body = await jsonBody<{ weekStart?: string; name?: string }>(c.req.raw);
  const start = requireDay(body.weekStart, "weekStart");
  const userId = c.get("userId");
  const rows = await c.env.DB.prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND day >= ? AND day < ? ORDER BY day, position")
    .bind(userId, start, addDays(start, 7))
    .all<Row>();
  const items = (rows.results ?? []).map(sessionFromRow).map((s) => ({ day: s.day, order: s.position, content: { sport: s.sport, title: s.title, details: s.details } }));
  return c.json(await createWeekTemplate(c.env.DB, userId, templateName(body.name), templateFromWeek(items, newId)), 201);
});

/** add: appends after existing sessions per day. replace: removes the week's sessions that aren't done. */
training.post("/week-templates/:id/apply", async (c) => {
  const body = await jsonBody<{ weekStart?: string; mode?: string }>(c.req.raw);
  const start = requireDay(body.weekStart, "weekStart");
  const mode = body.mode === "replace" ? "replace" : "add";
  const userId = c.get("userId");
  const db = c.env.DB;
  const template = await weekTemplate(db, userId, c.req.param("id"));
  const rows = await db.prepare("SELECT * FROM planned_sessions WHERE user_id = ? AND day >= ? AND day < ? ORDER BY day, position")
    .bind(userId, start, addDays(start, 7))
    .all<Row>();
  let existing = (rows.results ?? []).map(sessionFromRow);
  const statements: D1PreparedStatement[] = [];
  if (mode === "replace") {
    for (const s of existing.filter((s) => s.status !== "done")) statements.push(db.prepare("DELETE FROM planned_sessions WHERE id = ?").bind(s.id));
    existing = existing.filter((s) => s.status === "done");
    // Keep the remaining (done) sessions numbered from 0.
    for (const day of weekDays(start)) statements.push(...positionStatements(db, existing.filter((s) => s.day === day).map((s) => s.id)));
  }
  const nextOrder: Record<Day, number> = {};
  for (const day of weekDays(start)) nextOrder[day] = existing.filter((s) => s.day === day).length;
  for (const item of instantiateTemplate(template.sessions, start, nextOrder)) {
    statements.push(insertSession(db, userId, item.day, item.order, { ...item.content, details: withNewIds(item.content.details) }, null));
  }
  if (statements.length) await db.batch(statements);
  await autoLink(db, userId, weekDays(start));
  return c.json({ ok: true });
});
