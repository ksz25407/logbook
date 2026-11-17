// "Recurring slips": group slips whose wording is similar, count them,
// and compare the last 14 days with the 14 days before (trend arrow).
import type { Db, DateKey } from "../shared/types";
import { addDays } from "../shared/dates";

const STOP = new Set(
  "a an the to too of on in at for and or but my me i im i'm it its is was were be been so very much many again just really with from by up out about".split(" "),
);

/** Lowercase words without punctuation, filler words or simple endings. */
export function tokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
  return new Set(words);
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface SlipGroup {
  label: string; // the most common wording
  count: number;
  recent: number; // last 14 days
  previous: number; // the 14 days before
  trend: "↑" | "↓" | "→";
  days: DateKey[];
}

export function recurringSlips(db: Db, today: DateKey, threshold = 0.5, minCount = 2): SlipGroup[] {
  type G = { members: { text: string; tok: Set<string>; day: DateKey }[] };
  const groups: G[] = [];
  const days = Object.keys(db.days).filter((d) => d <= today).sort();

  for (const day of days) {
    for (const l of db.days[day].log) {
      if (l.kind !== "-") continue;
      const tok = tokens(l.text);
      if (!tok.size) continue;
      let bestG: G | null = null, bestS = 0;
      for (const g of groups) {
        const s = Math.max(...g.members.map((m) => similarity(m.tok, tok)));
        if (s > bestS) { bestS = s; bestG = g; }
      }
      const m = { text: l.text.trim(), tok, day };
      if (bestG && bestS >= threshold) bestG.members.push(m);
      else groups.push({ members: [m] });
    }
  }

  const recentFrom = addDays(today, -13);
  const prevFrom = addDays(today, -27);
  return groups
    .filter((g) => g.members.length >= minCount)
    .map((g): SlipGroup => {
      const recent = g.members.filter((m) => m.day >= recentFrom).length;
      const previous = g.members.filter((m) => m.day >= prevFrom && m.day < recentFrom).length;
      return {
        label: mostCommon(g.members.map((m) => m.text)),
        count: g.members.length,
        recent,
        previous,
        trend: recent > previous ? "↑" : recent < previous ? "↓" : "→",
        days: [...new Set(g.members.map((m) => m.day))],
      };
    })
    .sort((a, b) => b.count - a.count || b.recent - a.recent);
}

/** Most frequent text (case-insensitive); ties go to the latest one. */
function mostCommon(texts: string[]): string {
  const counts = new Map<string, { n: number; text: string }>();
  for (const t of texts) {
    const k = t.toLowerCase();
    const c = counts.get(k);
    counts.set(k, { n: (c?.n ?? 0) + 1, text: t });
  }
  let best = { n: 0, text: "" };
  for (const c of counts.values()) if (c.n >= best.n) best = c;
  return best.text;
}
