import { describe, it, expect } from "vitest";
import { emptyDb } from "../../shared/db";
import { setRate, setRef } from "../dayOps";
import { shouldRemind, markReminded } from "../reminder";

const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m);
const D = "2026-11-17";

describe("shouldRemind", () => {
  it("fires after the set time, once per day", () => {
    const db = emptyDb(D);
    expect(shouldRemind(db, at(21, 59))).toBe(false);
    expect(shouldRemind(db, at(22, 0))).toBe(true);
    expect(shouldRemind(markReminded(db, at(22)), at(23))).toBe(false);
    expect(shouldRemind(markReminded(db, at(22)), new Date(2026, 10, 18, 22, 5))).toBe(true);
  });

  it("stays quiet when the day is rated and reflected, or when turned off", () => {
    let db = setRef(setRate(emptyDb(D), D, 4), D, "good");
    expect(shouldRemind(db, at(23))).toBe(false);
    db = setRate(emptyDb(D), D, 4); // rated but no reflection
    expect(shouldRemind(db, at(23))).toBe(true);
    db.settings.reminder.enabled = false;
    expect(shouldRemind(db, at(23))).toBe(false);
  });

  it("respects a custom time", () => {
    const db = emptyDb(D);
    db.settings.reminder.time = "09:30";
    expect(shouldRemind(db, at(9, 29))).toBe(false);
    expect(shouldRemind(db, at(9, 30))).toBe(true);
  });
});
