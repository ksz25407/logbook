// Command bar: parsing and tab completion. Pure functions, no UI.
import type { DateKey, Rating } from "../shared/types";
import { addDays, isValidKey } from "../shared/dates";

export type Screen = "today" | "focus" | "learn" | "stats" | "week";
export const SCREENS: Screen[] = ["today", "focus", "learn", "stats", "week"];

export type Command =
  | { kind: "task"; text: string }
  | { kind: "win"; text: string }
  | { kind: "slip"; text: string }
  | { kind: "rate"; value: Rating }
  | { kind: "ref"; text: string }
  | { kind: "label"; text: string }
  | { kind: "go"; date: DateKey }
  | { kind: "focus"; minutes?: number }
  | { kind: "screen"; screen: Screen }
  | { kind: "import" }
  | { kind: "export"; format: "json" | "md" }
  | { kind: "remind"; enabled: boolean; time?: string }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const HELP: [string, string][] = [
  ["t <task>", "add a task"],
  ["+ <win>", "log a win"],
  ["- <slip>", "log a slip"],
  ["rate 1-5", "rate the day"],
  ["ref <text>", "one-line reflection"],
  ["label <text>", "label the day (empty clears)"],
  ["go +1 | -1 | today | yyyy-mm-dd", "switch day"],
  ["focus [25|45|60]", "start a focus session"],
  ["today | focus | learn | stats | week", "switch screen"],
  ["import", "import old JSON, notepad .txt or a LOGBOOK export"],
  ["export json | md", "save everything as JSON or Markdown"],
  ["remind 22:00 | on | off", "evening reminder to rate the day"],
  ["help", "show this list"],
];

const WORDS = ["t", "rate", "ref", "label", "go", "focus", "import", "export", "remind", "help", ...SCREENS.filter((s) => s !== "focus")];

export interface Ctx {
  viewing: DateKey;
  today: DateKey;
}

export function parseCommand(input: string, ctx: Ctx): Command {
  // A leading "/" is ignored: it's the key that opens the bar, so it often gets typed again.
  const line = input.trim().replace(/^\/+\s*/, "");
  if (!line) return { kind: "error", message: "empty command" };

  // "+ text" / "- text" work with or without the space.
  if (line[0] === "+" || line[0] === "-") {
    const rest = line.slice(1).trim();
    if (!rest || /^\d+$/.test(rest)) {
      // "-1" or "+1" on its own is almost certainly a mistyped "go".
      return { kind: "error", message: `nothing to log (did you mean "go ${line}"?)` };
    }
    return { kind: line[0] === "+" ? "win" : "slip", text: rest };
  }

  const space = line.indexOf(" ");
  const word = (space < 0 ? line : line.slice(0, space)).toLowerCase();
  const arg = space < 0 ? "" : line.slice(space + 1).trim();

  switch (word) {
    case "t":
    case "todo":
    case "task":
      return arg ? { kind: "task", text: arg } : { kind: "error", message: "usage: t <task>" };
    case "rate": {
      const n = Number(arg);
      return Number.isInteger(n) && n >= 1 && n <= 5
        ? { kind: "rate", value: n as Rating }
        : { kind: "error", message: "usage: rate 1-5" };
    }
    case "ref":
      return { kind: "ref", text: arg };
    case "label":
      return { kind: "label", text: arg };
    case "go":
      return parseGo(arg, ctx);
    case "focus": {
      if (!arg) return { kind: "focus" };
      const n = Number(arg);
      return Number.isInteger(n) && n > 0 && n <= 600
        ? { kind: "focus", minutes: n }
        : { kind: "error", message: "usage: focus <minutes>" };
    }
    case "import":
      return { kind: "import" };
    case "export": {
      const f = arg.toLowerCase();
      if (f === "json") return { kind: "export", format: "json" };
      if (f === "md" || f === "markdown") return { kind: "export", format: "md" };
      return { kind: "error", message: "usage: export json | md" };
    }
    case "remind": {
      const a = arg.toLowerCase();
      if (a === "off") return { kind: "remind", enabled: false };
      if (a === "on" || a === "") return { kind: "remind", enabled: true };
      const m = a.match(/^(\d{1,2}):(\d{2})$/);
      if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
        return { kind: "remind", enabled: true, time: `${m[1].padStart(2, "0")}:${m[2]}` };
      }
      return { kind: "error", message: "usage: remind 22:00 | on | off" };
    }
    case "help":
    case "?":
      return { kind: "help" };
  }
  if ((SCREENS as string[]).includes(word) && !arg) return { kind: "screen", screen: word as Screen };
  return { kind: "error", message: `unknown command "${word}" (type help)` };
}

function parseGo(arg: string, ctx: Ctx): Command {
  const a = arg.toLowerCase();
  if (a === "today" || a === "") return { kind: "go", date: ctx.today };
  if (a === "yesterday") return { kind: "go", date: addDays(ctx.today, -1) };
  if (a === "tomorrow") return { kind: "go", date: addDays(ctx.today, 1) };
  if (/^[+-]\d+$/.test(a)) return { kind: "go", date: addDays(ctx.viewing, Number(a)) };
  if (isValidKey(a)) return { kind: "go", date: a };
  return { kind: "error", message: "usage: go +1 | -1 | today | yyyy-mm-dd" };
}

/**
 * Tab completion. Returns the completed input and the candidates
 * (more than one candidate means the input was ambiguous).
 */
export function complete(input: string): { value: string; options: string[] } {
  const space = input.indexOf(" ");
  if (space >= 0) {
    const word = input.slice(0, space).toLowerCase();
    const arg = input.slice(space + 1);
    const args =
      word === "go" ? ["today", "yesterday", "tomorrow", "+1", "-1"]
      : word === "focus" ? ["25", "45", "60"]
      : word === "rate" ? ["1", "2", "3", "4", "5"]
      : word === "export" ? ["json", "md"]
      : word === "remind" ? ["on", "off", "22:00"]
      : [];
    const hits = args.filter((a) => a.startsWith(arg.toLowerCase()));
    if (hits.length === 1) return { value: `${word} ${hits[0]}`, options: hits };
    return { value: hits.length ? `${word} ${commonPrefix(hits)}` : input, options: hits };
  }
  const hits = WORDS.filter((w) => w.startsWith(input.toLowerCase()));
  if (hits.length === 1) return { value: hits[0] + " ", options: hits };
  return { value: commonPrefix(hits) || input, options: hits };
}

function commonPrefix(words: string[]): string {
  if (!words.length) return "";
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}
