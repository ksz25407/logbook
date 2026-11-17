import { describe, it, expect } from "vitest";
import { parseCommand, complete } from "../commands";

const ctx = { viewing: "2026-11-17", today: "2026-11-17" };

describe("parseCommand", () => {
  it("parses tasks, wins and slips", () => {
    expect(parseCommand("t buy milk", ctx)).toEqual({ kind: "task", text: "buy milk" });
    expect(parseCommand("+ gym", ctx)).toEqual({ kind: "win", text: "gym" });
    expect(parseCommand("-doomscrolled", ctx)).toEqual({ kind: "slip", text: "doomscrolled" });
  });

  it("validates rate", () => {
    expect(parseCommand("rate 4", ctx)).toEqual({ kind: "rate", value: 4 });
    expect(parseCommand("rate 6", ctx).kind).toBe("error");
    expect(parseCommand("rate", ctx).kind).toBe("error");
  });

  it("resolves go relative to the viewed day", () => {
    const viewing = { viewing: "2026-12-31", today: "2026-11-17" };
    expect(parseCommand("go +1", viewing)).toEqual({ kind: "go", date: "2027-01-01" });
    expect(parseCommand("go -1", viewing)).toEqual({ kind: "go", date: "2026-12-30" });
    expect(parseCommand("go today", viewing)).toEqual({ kind: "go", date: "2026-11-17" });
    expect(parseCommand("go 2026-02-28", viewing)).toEqual({ kind: "go", date: "2026-02-28" });
    expect(parseCommand("go 2026-02-30", viewing).kind).toBe("error");
  });

  it("ignores a leading slash", () => {
    expect(parseCommand("/import", ctx)).toEqual({ kind: "import" });
    expect(parseCommand("/ t milk", ctx)).toEqual({ kind: "task", text: "milk" });
  });

  it("does not log '-1' as a slip", () => {
    expect(parseCommand("-1", ctx).kind).toBe("error");
  });

  it("parses focus and screens", () => {
    expect(parseCommand("focus 45", ctx)).toEqual({ kind: "focus", minutes: 45 });
    expect(parseCommand("focus", ctx)).toEqual({ kind: "focus" });
    expect(parseCommand("stats", ctx)).toEqual({ kind: "screen", screen: "stats" });
    expect(parseCommand("nope", ctx).kind).toBe("error");
  });
});

describe("phase 4 commands", () => {
  it("parses import, export and remind", () => {
    expect(parseCommand("import", ctx)).toEqual({ kind: "import" });
    expect(parseCommand("export md", ctx)).toEqual({ kind: "export", format: "md" });
    expect(parseCommand("export pdf", ctx).kind).toBe("error");
    expect(parseCommand("remind 9:30", ctx)).toEqual({ kind: "remind", enabled: true, time: "09:30" });
    expect(parseCommand("remind off", ctx)).toEqual({ kind: "remind", enabled: false });
    expect(parseCommand("remind 25:00", ctx).kind).toBe("error");
  });
});

describe("complete", () => {
  it("completes unique command words", () => {
    expect(complete("ra").value).toBe("rate ");
    expect(complete("la").value).toBe("label ");
  });

  it("returns options when ambiguous", () => {
    const r = complete("r");
    expect(r.options).toEqual(["rate", "ref", "remind"]);
    expect(r.value).toBe("r");
  });

  it("completes arguments", () => {
    expect(complete("go tod").value).toBe("go today");
    expect(complete("go to").options).toEqual(["today", "tomorrow"]);
  });
});
