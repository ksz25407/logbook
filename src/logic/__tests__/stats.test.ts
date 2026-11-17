import { describe, it, expect } from "vitest";
import type { Db, Rating } from "../../shared/types";
import { emptyDb, emptyDay } from "../../shared/db";
import {
  streaks, completion, avgRate, sparkline, heatLevel, heatmap, dayStat, weekStart, weekSummary, lastDays,
} from "../stats";
import { recurringSlips, tokens, similarity } from "../slips";

const TODAY = "2026-11-17"; // a Tuesday

/** Build a db from compact specs: "2/3" = 2 of 3 tasks done; r = rating. */
function db(spec: Record<string, { tasks?: string; r?: Rating; slips?: string[]; focus?: number }>): Db {
  const out = emptyDb("2026-01-01");
  for (const [key, s] of Object.entries(spec)) {
    const day = emptyDay();
    if (s.tasks) {
      const [done, total] = s.tasks.split("/").map(Number);
      day.todos = Array.from({ length: total }, (_, i) => ({ id: `${key}-${i}`, text: `t${i}`, done: i < done, focusMin: 0 }));
    }
    day.rate = s.r ?? null;
    day.log = (s.slips ?? []).map((t, i) => ({ id: `${key}-s${i}`, kind: "-" as const, text: t, at: "" }));
    if (s.focus) day.focus = [{ id: "f", startedAt: "", plannedMin: s.focus, actualMin: s.focus, completed: true }];
    out.days[key] = day;
  }
  return out;
}

describe("streaks", () => {
  it("is zero for an empty db", () => {
    expect(streaks(emptyDb(), TODAY)).toEqual({ current: 0, best: 0 });
  });

  it("counts back from today when today already has a done task", () => {
    const d = db({ "2026-11-15": { tasks: "1/2" }, "2026-11-16": { tasks: "1/1" }, "2026-11-17": { tasks: "1/4" } });
    expect(streaks(d, TODAY)).toEqual({ current: 3, best: 3 });
  });

  it("does not break the streak while today has nothing done yet", () => {
    const d = db({ "2026-11-15": { tasks: "1/1" }, "2026-11-16": { tasks: "1/1" }, "2026-11-17": { tasks: "0/3" } });
    expect(streaks(d, TODAY).current).toBe(2);
  });

  it("breaks on a gap or a day with nothing done", () => {
    const d = db({
      "2026-11-10": { tasks: "1/1" }, "2026-11-11": { tasks: "1/1" }, "2026-11-12": { tasks: "1/1" }, "2026-11-13": { tasks: "1/1" },
      "2026-11-14": { tasks: "0/2" },
      "2026-11-16": { tasks: "1/1" },
    });
    expect(streaks(d, TODAY)).toEqual({ current: 1, best: 4 });
  });

  it("ignores future days and works across month/year boundaries", () => {
    const d = db({
      "2025-12-31": { tasks: "1/1" }, "2026-01-01": { tasks: "1/1" },
      "2026-11-18": { tasks: "1/1" }, "2026-11-19": { tasks: "1/1" }, "2026-11-20": { tasks: "1/1" },
    });
    expect(streaks(d, TODAY)).toEqual({ current: 0, best: 2 });
  });
});

describe("completion and satisfaction", () => {
  const d = db({ "2026-11-15": { tasks: "1/4", r: 2 }, "2026-11-16": { r: 4 }, "2026-11-17": { tasks: "3/4", r: 5 } });

  it("sums tasks over days that had tasks", () => {
    expect(completion(d, lastDays(TODAY, 7))).toEqual({ done: 4, total: 8, ratio: 0.5 });
    expect(completion(d, ["2026-11-16"]).ratio).toBeNull();
  });

  it("averages only rated days", () => {
    expect(avgRate(d, lastDays(TODAY, 7))).toBeCloseTo(11 / 3);
    expect(avgRate(d, ["2026-11-01"])).toBeNull();
  });

  it("draws a sparkline with dots for unrated days", () => {
    expect(sparkline([1, null, 3, 5])).toBe("▁·▄█");
  });
});

describe("heatmap", () => {
  it("maps completion to levels", () => {
    const d = db({ a: { tasks: "0/2" }, b: { tasks: "1/3" }, c: { tasks: "2/3" }, e: { tasks: "3/3" }, f: { r: 3 } });
    expect(["a", "b", "c", "e", "f", "none"].map((k) => heatLevel(dayStat(d, k)))).toEqual([1, 2, 3, 4, 1, 0]);
  });

  it("ends with the week containing today, Monday first, future days null", () => {
    const grid = heatmap(emptyDb(), TODAY, 53);
    expect(grid.length).toBe(53);
    const last = grid[52];
    expect(last[0]!.key).toBe("2026-11-16"); // Monday
    expect(last[1]!.key).toBe(TODAY);
    expect(last[2]).toBeNull();
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the same week
  });
});

describe("weekSummary", () => {
  it("finds best and worst days and topics finished that week", () => {
    const d = db({
      "2026-11-16": { tasks: "2/2", r: 4, focus: 30 },
      "2026-11-17": { tasks: "0/3", r: 2 },
      "2026-11-18": { tasks: "1/1", r: 4 },
    });
    d.topics = [
      { id: "1", title: "Guitar chords", check: "?", status: "done", focusMin: 0, createdAt: "", finishedAt: new Date(2026, 10, 17, 21).toISOString() },
      { id: "2", title: "old", check: "?", status: "done", focusMin: 0, createdAt: "", finishedAt: new Date(2026, 9, 1).toISOString() },
    ];
    const w = weekSummary(d, "2026-11-16");
    expect(w.best?.key).toBe("2026-11-16"); // tie on rating 4 and 100% → earlier day
    expect(w.worst?.key).toBe("2026-11-17");
    expect(w.done).toBe(3);
    expect(w.total).toBe(6);
    expect(w.focusMin).toBe(30);
    expect(w.topics).toEqual(["Guitar chords"]);
  });
});

describe("recurringSlips", () => {
  it("normalizes wording", () => {
    expect(similarity(tokens("Watched too much TV!"), tokens("watching TV"))).toBeGreaterThanOrEqual(0.5);
    expect(similarity(tokens("stayed up late"), tokens("skipped gym"))).toBe(0);
  });

  it("groups similar slips and computes the trend (↑ = more often lately)", () => {
    const d = db({
      "2026-10-25": { slips: ["doomscrolled instagram"] },
      "2026-10-26": { slips: ["doomscrolling instagram"] },
      "2026-10-27": { slips: ["Doomscrolled Instagram", "skipped gym"] },
      "2026-11-10": { slips: ["watched too much TV"] },
      "2026-11-12": { slips: ["watched TV again", "skipped the gym"] },
      "2026-11-16": { slips: ["watched too much tv", "stayed up late"] },
    });
    const g = recurringSlips(d, TODAY);
    expect(g.map((x) => [x.label, x.count, x.trend])).toEqual([
      ["watched too much tv", 3, "↑"], // same count: more recent first
      ["Doomscrolled Instagram", 3, "↓"], // latest spelling of the most common wording
      ["skipped the gym", 2, "→"],
    ]);
  });
});
