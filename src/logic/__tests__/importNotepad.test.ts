import { describe, it, expect } from "vitest";
import { parseNotepad } from "../importNotepad";

const SAMPLE = `GOALS for November
- get stronger
Weekly topics: cooking, guitar

#2 - 11/16/2026:
+ finished the history essay
+ Run: 5k
note: 28 min, easy pace, stretched after
- watched too much TV

#5 - 11/19/2026: Sam's birthday
TODO
* read chapter 4 - redo exercises
 Reflection:
* watch tutorial video #3
`;

describe("parseNotepad", () => {
  const { days, skipped } = parseNotepad(SAMPLE);

  it("ignores everything before the first header", () => {
    expect(Object.keys(days)).toEqual(["2026-11-16", "2026-11-19"]);
    expect(skipped).toBe(0);
  });

  it("parses wins, slips and attaches notes to the line above", () => {
    expect(days["2026-11-16"].log).toEqual([
      { kind: "+", text: "finished the history essay" },
      { kind: "+", text: "Run: 5k (28 min, easy pace, stretched after)" },
      { kind: "-", text: "watched too much TV" },
    ]);
    expect(days["2026-11-16"].label).toBeUndefined();
  });

  it("reads the label, tasks, and an empty reflection", () => {
    const d = days["2026-11-19"];
    expect(d.label).toBe("Sam's birthday");
    expect(d.todos).toEqual(["read chapter 4 - redo exercises", "watch tutorial video #3"]);
    expect(d.ref).toBe("");
  });

  it("reads reflections on the same line and on following lines", () => {
    const r = parseNotepad(`#1 - 1/2/2026:
Reflection: good day
   slept well, though
+ ran 5k
#2 - 1/3/2026:
Reflection:
tired
TODO
`);
    expect(r.days["2026-01-02"].ref).toBe("good day slept well, though");
    expect(r.days["2026-01-02"].log).toEqual([{ kind: "+", text: "ran 5k" }]);
    expect(r.days["2026-01-03"].ref).toBe("tired");
  });

  it("accepts • bullets and counts unparseable lines", () => {
    const r = parseNotepad(`#1 - 2/1/2026:
• bullet task
random junk
note: orphan note
#2 - 2/30/2026:
+ under an invalid date
`);
    expect(r.days["2026-02-01"].todos).toEqual(["bullet task"]);
    // junk line, orphan note, invalid header, line under invalid header
    expect(r.skipped).toBe(4);
    expect(Object.keys(r.days)).toEqual(["2026-02-01"]);
  });

  it("handles CRLF line endings", () => {
    const r = parseNotepad("#1 - 3/4/2026:\r\n* a\r\n+ b\r\n");
    expect(r.days["2026-03-04"].todos).toEqual(["a"]);
    expect(r.days["2026-03-04"].log).toEqual([{ kind: "+", text: "b" }]);
  });
});
