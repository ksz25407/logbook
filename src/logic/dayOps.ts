// Immutable edits to the database. Every UI action goes through one of these,
// which keeps undo simple (keep the previous Db) and makes them easy to test.
import type { Db, Day, DateKey, ID, Rating, Todo, LogEntry } from "../shared/types";
import { emptyDay, newId } from "../shared/db";
import { addDays } from "../shared/dates";

export function getDay(db: Db, key: DateKey): Day {
  return db.days[key] ?? emptyDay();
}

export function updateDay(db: Db, key: DateKey, fn: (d: Day) => Day): Db {
  return { ...db, days: { ...db.days, [key]: fn(getDay(db, key)) } };
}

const now = () => new Date().toISOString();

function move<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// ---- todos ----

export const addTodo = (db: Db, key: DateKey, text: string): Db =>
  updateDay(db, key, (d) => ({ ...d, todos: [...d.todos, { id: newId(), text, done: false, focusMin: 0 }] }));

export const toggleTodo = (db: Db, key: DateKey, id: ID): Db =>
  updateDay(db, key, (d) => ({
    ...d,
    todos: d.todos.map((t): Todo =>
      t.id !== id ? t : t.done ? { ...t, done: false, doneAt: undefined } : { ...t, done: true, doneAt: now() }),
  }));

export const editTodo = (db: Db, key: DateKey, id: ID, text: string): Db =>
  updateDay(db, key, (d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, text } : t)) }));

export const removeTodo = (db: Db, key: DateKey, id: ID): Db =>
  updateDay(db, key, (d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));

export const moveTodo = (db: Db, key: DateKey, from: number, to: number): Db =>
  updateDay(db, key, (d) => ({ ...d, todos: move(d.todos, from, to) }));

// ---- wins / slips ----

export const addLog = (db: Db, key: DateKey, kind: "+" | "-", text: string): Db =>
  updateDay(db, key, (d) => ({ ...d, log: [...d.log, { id: newId(), kind, text, at: now() }] }));

export const editLog = (db: Db, key: DateKey, id: ID, text: string): Db =>
  updateDay(db, key, (d) => ({ ...d, log: d.log.map((l): LogEntry => (l.id === id ? { ...l, text } : l)) }));

export const removeLog = (db: Db, key: DateKey, id: ID): Db =>
  updateDay(db, key, (d) => ({ ...d, log: d.log.filter((l) => l.id !== id) }));

export const moveLog = (db: Db, key: DateKey, from: number, to: number): Db =>
  updateDay(db, key, (d) => ({ ...d, log: move(d.log, from, to) }));

// ---- rating, reflection, label ----

/** Clicking the current rating again clears it. */
export const setRate = (db: Db, key: DateKey, rate: Rating | null): Db =>
  updateDay(db, key, (d) => ({ ...d, rate: d.rate === rate ? null : rate }));

export const setRef = (db: Db, key: DateKey, ref: string): Db => updateDay(db, key, (d) => ({ ...d, ref }));

export const setLabel = (db: Db, key: DateKey, label: string): Db =>
  updateDay(db, key, (d) => ({ ...d, label: label.trim() || undefined }));

// ---- carry over ----

/** Unfinished tasks from the day before `key`, unless the prompt was already answered. */
export function pendingCarryOver(db: Db, key: DateKey): Todo[] {
  if (getDay(db, key).carryHandled) return [];
  const prev = db.days[addDays(key, -1)];
  if (!prev) return [];
  const already = new Set(getDay(db, key).todos.map((t) => t.text));
  return prev.todos.filter((t) => !t.done && !already.has(t.text));
}

/** Copies the given tasks into `key` (yesterday keeps its own unfinished copy). */
export function carryOver(db: Db, key: DateKey, todos: Todo[]): Db {
  const from = addDays(key, -1);
  return updateDay(db, key, (d) => ({
    ...d,
    carryHandled: true,
    todos: [...d.todos, ...todos.map((t) => ({ id: newId(), text: t.text, done: false, focusMin: 0, carriedFrom: from }))],
  }));
}

export const dismissCarryOver = (db: Db, key: DateKey): Db => updateDay(db, key, (d) => ({ ...d, carryHandled: true }));

// ---- command history ----

export function pushHistory(db: Db, cmd: string): Db {
  const h = db.cmdHistory.filter((c) => c !== cmd);
  h.push(cmd);
  return { ...db, cmdHistory: h.slice(-100) };
}

// ---- rescheduling (WEEK) ----

/** Moves a task to another day (or another position on the same day). */
export function moveTodoToDay(db: Db, from: DateKey, id: ID, to: DateKey, index?: number): Db {
  const todo = getDay(db, from).todos.find((t) => t.id === id);
  if (!todo) return db;
  if (from === to) {
    const fromIdx = getDay(db, from).todos.indexOf(todo);
    const target = index ?? getDay(db, from).todos.length;
    return moveTodo(db, from, fromIdx, target > fromIdx ? target - 1 : target);
  }
  const removed = updateDay(db, from, (d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));
  return updateDay(removed, to, (d) => {
    const todos = d.todos.slice();
    todos.splice(index ?? todos.length, 0, todo);
    return { ...d, todos };
  });
}
