// Statistics over the database. Pure functions; "today" is always passed in.
import type { Db, DateKey, Day, Rating } from "../shared/types";
import { addDays, fromKey } from "../shared/dates";

export interface DayStat {
  key: DateKey;
  total: number;
  done: number;
  rate: Rating | null;
  focusMin: number;
  wins: number;
  slips: number;
}

export function dayStat(db: Db, key: DateKey): DayStat {
  const d: Day | undefined = db.days[key];
  return {
    key,
    total: d?.todos.length ?? 0,
    done: d?.todos.filter((t) => t.done).length ?? 0,
    rate: d?.rate ?? null,
    focusMin: d?.focus.reduce((s, f) => s + f.actualMin, 0) ?? 0,
    wins: d?.log.filter((l) => l.kind === "+").length ?? 0,
    slips: d?.log.filter((l) => l.kind === "-").length ?? 0,
  };
}

/** The `n` days ending at `end`, oldest first. */
export function lastDays(end: DateKey, n: number): DateKey[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

// ---- completion ----

export interface Completion {
  done: number;
  total: number;
  /** 0..1, or null when there were no tasks at all. */
  ratio: number | null;
}

/** Tasks done ÷ tasks planned, counting only days that had tasks. */
export function completion(db: Db, keys: DateKey[]): Completion {
  let done = 0, total = 0;
  for (const k of keys) {
    const s = dayStat(db, k);
    done += s.done;
    total += s.total;
  }
  return { done, total, ratio: total ? done / total : null };
}

// ---- streaks ----

/** A day counts toward a streak when at least one task on it was done. */
export function countsForStreak(db: Db, key: DateKey): boolean {
  return !!db.days[key]?.todos.some((t) => t.done);
}

/**
 * Current streak: consecutive counting days ending today. If today doesn't
 * count yet, the streak ending yesterday is still "current" (today isn't over).
 * Best streak: the longest run up to and including today. Future days are ignored.
 */
export function streaks(db: Db, today: DateKey): { current: number; best: number } {
  let current = 0;
  let k = countsForStreak(db, today) ? today : addDays(today, -1);
  while (countsForStreak(db, k)) {
    current++;
    k = addDays(k, -1);
  }

  const keys = Object.keys(db.days).filter((d) => d <= today && countsForStreak(db, d)).sort();
  let best = 0, run = 0, prev: DateKey | null = null;
  for (const d of keys) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

// ---- satisfaction ----

export function avgRate(db: Db, keys: DateKey[]): number | null {
  const rates = keys.map((k) => db.days[k]?.rate).filter((r): r is Rating => r != null);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

const SPARK = ["▁", "▂", "▄", "▆", "█"];

/** One character per value: ▁▂▄▆█ for ratings 1..5, "·" for unrated days. */
export function sparkChar(rate: number | null): string {
  return rate == null ? "·" : SPARK[Math.max(1, Math.min(5, Math.round(rate))) - 1];
}

export const sparkline = (rates: (number | null)[]): string => rates.map(sparkChar).join("");

// ---- year heatmap ----

export const HEAT = ["·", "░", "▒", "▓", "█"];

/**
 * 0 = nothing recorded, 1..4 = how much of the day's plan got done.
 * A day with a rating or log but no tasks shows as level 1.
 */
export function heatLevel(s: DayStat): number {
  if (s.total === 0) return s.rate != null || s.wins + s.slips > 0 ? 1 : 0;
  const r = s.done / s.total;
  if (r === 0) return 1;
  if (r < 0.5) return 2;
  if (r < 1) return 3;
  return 4;
}

/** Monday of the week containing `key`. */
export function weekStart(key: DateKey): DateKey {
  const dow = (fromKey(key).getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -dow);
}

/**
 * Columns of weeks (Monday first), the last column holding `today`.
 * Days after today are null so the grid stays rectangular.
 */
export function heatmap(db: Db, today: DateKey, weeks = 53): ({ key: DateKey; level: number } | null)[][] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDays(first, w * 7 + d);
      return key > today ? null : { key, level: heatLevel(dayStat(db, key)) };
    }),
  );
}

// ---- weekly summary ----

export interface WeekSummary {
  start: DateKey;
  end: DateKey;
  best: DayStat | null;
  worst: DayStat | null;
  done: number;
  total: number;
  wins: number;
  slips: number;
  focusMin: number;
  topics: string[];
}

/** Days are ranked by rating, then by completion. Only days with something recorded are ranked. */
export function weekSummary(db: Db, start: DateKey): WeekSummary {
  const keys = lastDays(addDays(start, 6), 7);
  const stats = keys.map((k) => dayStat(db, k));
  const ranked = stats
    .filter((s) => s.rate != null || s.total > 0)
    .sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
  const end = keys[6];
  const topics = db.topics
    .filter((t) => t.status === "done" && t.finishedAt && inRange(t.finishedAt, start, end))
    .map((t) => t.title);
  return {
    start,
    end,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    done: sum(stats, (s) => s.done),
    total: sum(stats, (s) => s.total),
    wins: sum(stats, (s) => s.wins),
    slips: sum(stats, (s) => s.slips),
    focusMin: sum(stats, (s) => s.focusMin),
    topics,
  };
}

function score(s: DayStat): number {
  const ratio = s.total ? s.done / s.total : 0;
  return (s.rate ?? 0) * 10 + ratio;
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function inRange(iso: string, start: DateKey, end: DateKey): boolean {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return key >= start && key <= end;
}
