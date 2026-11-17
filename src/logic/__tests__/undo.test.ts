import { describe, it, expect } from "vitest";
import { emptyDb } from "../../shared/db";
import * as ops from "../dayOps";
import { startFocus } from "../focus";
import { revert } from "../undo";

const D = "2026-11-17";

describe("revert", () => {
  it("undoes a delete without losing later non-undoable edits", () => {
    let db = ops.addTodo(ops.addTodo(emptyDb(D), D, "a"), D, "b");
    const before = db;
    db = ops.removeTodo(db, D, db.days[D].todos[0].id); // undoable
    const after = db;
    db = ops.setRef(db, D, "typed later"); // not undoable
    db = ops.pushHistory(db, "t x");
    db = startFocus(db, { day: D, minutes: 25, label: "b" }, Date.now());

    const r = revert(db, { before, after });
    expect(r.days[D].todos.map((t) => t.text)).toEqual(["a", "b"]);
    expect(r.days[D].ref).toBe("typed later");
    expect(r.cmdHistory).toEqual(["t x"]);
    expect(r.activeFocus).toBeDefined();
  });

  it("undoes adding the first item of a new day", () => {
    const before = emptyDb(D);
    const after = ops.addTodo(before, D, "a");
    expect(revert(after, { before, after }).days[D].todos).toEqual([]);
  });
});
