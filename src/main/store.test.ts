import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "./store";
import { emptyDb } from "../shared/db";
import { todayKey } from "../shared/dates";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "logbook-test-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Store", () => {
  it("starts empty, then round-trips a save", () => {
    const s = new Store(dir);
    expect(s.load().db.days).toEqual({});
    const db = emptyDb("2026-01-01");
    db.days["2026-01-01"] = { todos: [], log: [], rate: 3, ref: "ok", focus: [] };
    s.save(db);
    expect(s.load().db.days["2026-01-01"].rate).toBe(3);
    expect(fs.existsSync(s.file + ".tmp")).toBe(false);
  });

  it("makes one backup per day and keeps the newest 7", () => {
    const s = new Store(dir);
    for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(s.backupDir, `logbook-2020-01-0${d}.json`), "{}");
    s.save(emptyDb()); // no file yet → nothing to back up
    s.save(emptyDb()); // first save with an existing file → backup for today
    s.save(emptyDb()); // same day → no new backup
    const files = fs.readdirSync(s.backupDir).sort();
    expect(files.length).toBe(7);
    expect(files.at(-1)).toBe(`logbook-${todayKey()}.json`);
  });

  it("sets a corrupt file aside and restores the newest backup", () => {
    const s = new Store(dir);
    const backup = emptyDb("2025-05-05");
    fs.writeFileSync(path.join(s.backupDir, "logbook-2025-05-05.json"), JSON.stringify(backup));
    fs.writeFileSync(s.file, "{ not json");
    const r = s.load();
    expect(r.warning).toMatch(/restored logbook-2025-05-05\.json/);
    expect(r.db.start).toBe("2025-05-05");
    expect(fs.readdirSync(dir).some((f) => f.startsWith("logbook.corrupt-"))).toBe(true);
  });
});
