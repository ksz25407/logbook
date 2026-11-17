import { describe, it, expect } from "vitest";
import * as ops from "../dayOps";
import { emptyDb } from "../../shared/db";

const D = "2026-11-17";

describe("dayOps", () => {
  it("adds, toggles, edits, moves and removes tasks without mutating the input", () => {
    const db0 = emptyDb(D);
    let db = ops.addTodo(db0, D, "a");
    db = ops.addTodo(db, D, "b");
    expect(db0.days[D]).toBeUndefined();

    const [a, b] = db.days[D].todos;
    db = ops.toggleTodo(db, D, a.id);
    expect(db.days[D].todos[0].done).toBe(true);
    expect(db.days[D].todos[0].doneAt).toBeTruthy();

    db = ops.moveTodo(db, D, 0, 1);
    expect(db.days[D].todos.map((t) => t.text)).toEqual(["b", "a"]);

    db = ops.editTodo(db, D, b.id, "B");
    db = ops.removeTodo(db, D, a.id);
    expect(db.days[D].todos.map((t) => t.text)).toEqual(["B"]);
  });

  it("clicking the same rating again clears it", () => {
    let db = ops.setRate(emptyDb(D), D, 4);
    expect(db.days[D].rate).toBe(4);
    db = ops.setRate(db, D, 4);
    expect(db.days[D].rate).toBeNull();
  });

  it("offers yesterday's unfinished tasks once", () => {
    let db = ops.addTodo(emptyDb(D), "2026-11-16", "unfinished");
    db = ops.addTodo(db, "2026-11-16", "finished");
    db = ops.toggleTodo(db, "2026-11-16", db.days["2026-11-16"].todos[1].id);

    const pending = ops.pendingCarryOver(db, D);
    expect(pending.map((t) => t.text)).toEqual(["unfinished"]);

    db = ops.carryOver(db, D, pending);
    expect(db.days[D].todos[0]).toMatchObject({ text: "unfinished", done: false, carriedFrom: "2026-11-16" });
    expect(ops.pendingCarryOver(db, D)).toEqual([]);
  });

  it("keeps command history unique and capped", () => {
    let db = emptyDb(D);
    for (let i = 0; i < 120; i++) db = ops.pushHistory(db, `t ${i}`);
    db = ops.pushHistory(db, "t 50");
    expect(db.cmdHistory.length).toBe(100);
    expect(db.cmdHistory.at(-1)).toBe("t 50");
    expect(db.cmdHistory.filter((c) => c === "t 50").length).toBe(1);
  });
});
