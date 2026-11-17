// Creating an empty database and filling in missing fields of a loaded one.
import type { Db, Day, DateKey } from "./types";
import { todayKey } from "./dates";

export function emptyDay(): Day {
  return { todos: [], log: [], rate: null, ref: "", focus: [] };
}

export function emptyDb(start: DateKey = todayKey()): Db {
  return {
    version: 1,
    start,
    days: {},
    topics: [],
    settings: {
      reminder: { enabled: true, time: "22:00" },
      focusPresets: [25, 45, 60],
      lastFocusMin: 25,
      hotkey: "Ctrl+Alt+L",
    },
    cmdHistory: [],
  };
}

/** Accepts anything parsed from disk and returns a complete Db. */
export function normalizeDb(raw: unknown): Db {
  const base = emptyDb();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Db>;
  const days: Db["days"] = {};
  for (const [k, d] of Object.entries(r.days ?? {})) days[k] = { ...emptyDay(), ...d };
  return {
    ...base,
    ...r,
    version: 1,
    days,
    topics: r.topics ?? [],
    settings: { ...base.settings, ...r.settings, reminder: { ...base.settings.reminder, ...r.settings?.reminder } },
    cmdHistory: r.cmdHistory ?? [],
  };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
