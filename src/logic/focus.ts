// Focus sessions: start, pause/resume, time left, and logging the minutes when done.
// `now` is always passed in (ms since epoch) so this is easy to test.
import type { Db, ActiveFocus, FocusSession, ID, DateKey } from "../shared/types";
import { newId } from "../shared/db";
import { updateDay } from "./dayOps";

export function startFocus(
  db: Db,
  opts: { day: DateKey; minutes: number; label: string; todoId?: ID; topicId?: ID },
  now: number,
): Db {
  const active: ActiveFocus = {
    id: newId(),
    day: opts.day,
    startedAt: new Date(now).toISOString(),
    plannedMin: opts.minutes,
    pausedMs: 0,
    todoId: opts.todoId,
    topicId: opts.topicId,
    label: opts.label,
  };
  return { ...db, activeFocus: active, settings: { ...db.settings, lastFocusMin: opts.minutes } };
}

/** Milliseconds actually spent focusing (pauses excluded). */
export function elapsedMs(a: ActiveFocus, now: number): number {
  const end = a.pausedAt ? Date.parse(a.pausedAt) : now;
  return Math.max(0, end - Date.parse(a.startedAt) - a.pausedMs);
}

export function remainingMs(a: ActiveFocus, now: number): number {
  return Math.max(0, a.plannedMin * 60_000 - elapsedMs(a, now));
}

export function togglePause(db: Db, now: number): Db {
  const a = db.activeFocus;
  if (!a) return db;
  const next: ActiveFocus = a.pausedAt
    ? { ...a, pausedAt: undefined, pausedMs: a.pausedMs + (now - Date.parse(a.pausedAt)) }
    : { ...a, pausedAt: new Date(now).toISOString() };
  return { ...db, activeFocus: next };
}

export function extendFocus(db: Db, minutes: number): Db {
  const a = db.activeFocus;
  return a ? { ...db, activeFocus: { ...a, plannedMin: a.plannedMin + minutes } } : db;
}

/**
 * Ends the running session. A completed session logs its planned minutes;
 * a stopped one logs the whole minutes actually spent (nothing if under a minute).
 * Minutes are also added to the task or topic it was for.
 */
export function finishFocus(db: Db, now: number, completed: boolean): { db: Db; minutes: number } {
  const a = db.activeFocus;
  if (!a) return { db, minutes: 0 };
  const minutes = completed ? a.plannedMin : Math.floor(elapsedMs(a, now) / 60_000);
  let next: Db = { ...db, activeFocus: undefined };
  if (minutes <= 0) return { db: next, minutes: 0 };

  const session: FocusSession = {
    id: a.id,
    startedAt: a.startedAt,
    plannedMin: a.plannedMin,
    actualMin: minutes,
    todoId: a.todoId,
    topicId: a.topicId,
    completed,
  };
  next = updateDay(next, a.day, (d) => ({
    ...d,
    focus: [...d.focus, session],
    todos: d.todos.map((t) => (t.id === a.todoId ? { ...t, focusMin: t.focusMin + minutes } : t)),
  }));
  if (a.topicId) {
    next = { ...next, topics: next.topics.map((t) => (t.id === a.topicId ? { ...t, focusMin: t.focusMin + minutes } : t)) };
  }
  return { db: next, minutes };
}

/** "24:59", or "1:04:59" for sessions over an hour. Rounds up so 0:00 means done. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
