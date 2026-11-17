import { describe, it, expect } from "vitest";
import { emptyDb } from "../../shared/db";
import * as ops from "../dayOps";
import { parseImport, mergeImport, exportMarkdown } from "../importExport";
import { addTopic, finishTopic } from "../topics";

const OLD = JSON.stringify({
  start: "2026-09-01",
  days: {
    "2026-11-16": {
      todos: [{ t: "finished the essay", d: 1 }, { t: "laundry", d: 0 }],
      log: [{ k: "+", t: "Run: 5k" }, { k: "-", t: "watched too much TV" }, { k: "?", t: "bad" }],
      rate: 4, ref: "solid day", note: "Sam's birthday",
    },
    "not-a-date": { todos: [] },
    "2026-11-17": { todos: [], log: [], rate: 9, ref: "" },
  },
});

describe("import", () => {
  it("parses the old web JSON format", () => {
    const p = parseImport(OLD);
    expect(p.format).toBe("old-json");
    expect(p.skipped).toBe(1);
    expect(p.days["2026-11-16"]).toEqual({
      label: "Sam's birthday",
      todos: [{ text: "finished the essay", done: true }, { text: "laundry", done: false }],
      log: [{ kind: "+", text: "Run: 5k" }, { kind: "-", text: "watched too much TV" }],
      rate: 4,
      ref: "solid day",
    });
    expect(p.days["2026-11-17"].rate).toBeNull();
  });

  it("detects the notepad format", () => {
    const p = parseImport("#5 - 11/19/2026: Sam's birthday\n* study\n+ gym\n");
    expect(p.format).toBe("notepad");
    expect(p.days["2026-11-19"].todos).toEqual([{ text: "study", done: false }]);
  });

  it("merges without duplicating or overwriting, and moves start back", () => {
    let db = emptyDb("2026-11-10");
    db = ops.addTodo(db, "2026-11-16", "laundry");
    db = ops.setRef(db, "2026-11-16", "my own words");

    const first = mergeImport(db, parseImport(OLD));
    expect(first.report).toEqual({ days: 1, todos: 1, log: 2 });
    const d = first.db.days["2026-11-16"];
    expect(d.todos.map((t) => [t.text, t.done])).toEqual([["laundry", false], ["finished the essay", true]]);
    expect(d.ref).toBe("my own words"); // kept
    expect(d.rate).toBe(4);
    expect(d.label).toBe("Sam's birthday");
    expect(first.db.start).toBe("2026-09-01");

    const again = mergeImport(first.db, parseImport(OLD));
    expect(again.report).toEqual({ days: 0, todos: 0, log: 0 });
  });

  it("round-trips its own JSON export", () => {
    let db = ops.addTodo(emptyDb("2026-11-17"), "2026-11-17", "a");
    db = ops.setRate(db, "2026-11-17", 3);
    const p = parseImport(JSON.stringify(db));
    expect(p.format).toBe("logbook-json");
    expect(mergeImport(emptyDb("2026-11-17"), p).db.days["2026-11-17"].rate).toBe(3);
  });

  it("rejects JSON that isn't a logbook", () => {
    expect(() => parseImport('{"hello": 1}')).toThrow();
  });
});

describe("moveTodoToDay", () => {
  it("moves between days and within a day", () => {
    let db = ops.addTodo(ops.addTodo(emptyDb(), "2026-11-16", "a"), "2026-11-16", "b");
    db = ops.addTodo(db, "2026-11-18", "c");
    const a = db.days["2026-11-16"].todos[0].id;
    db = ops.moveTodoToDay(db, "2026-11-16", a, "2026-11-18", 0);
    expect(db.days["2026-11-16"].todos.map((t) => t.text)).toEqual(["b"]);
    expect(db.days["2026-11-18"].todos.map((t) => t.text)).toEqual(["a", "c"]);
    db = ops.moveTodoToDay(db, "2026-11-18", a, "2026-11-18"); // to the end
    expect(db.days["2026-11-18"].todos.map((t) => t.text)).toEqual(["c", "a"]);
  });
});

describe("exportMarkdown", () => {
  it("writes days and learned topics", () => {
    let db = ops.addTodo(emptyDb(), "2026-11-17", "study");
    db = ops.toggleTodo(db, "2026-11-17", db.days["2026-11-17"].todos[0].id);
    db = ops.addLog(db, "2026-11-17", "-", "doomscrolled");
    db = ops.setRate(db, "2026-11-17", 4);
    db = ops.setRef(db, "2026-11-17", "ok");
    db = ops.setLabel(db, "2026-11-17", "Sam's birthday");
    db = addTopic(db, "K-maps", "How to group?");
    db = finishTopic(db, db.topics[0].id, "powers of two");
    expect(exportMarkdown(db)).toBe(
      [
        "# LOGBOOK", "",
        "## 2026-11-17 · TUE · Sam's birthday", "",
        "Rating: ■■■■□ 4/5", "",
        "- [x] study", "",
        "− doomscrolled  ", "",
        "> ok", "",
        "## Learned", "",
        `- **K-maps** (${db.topics[0].finishedAt!.slice(0, 10)})`,
        "  - Q: How to group?",
        "  - A: powers of two",
        "",
      ].join("\n"),
    );
  });
});
