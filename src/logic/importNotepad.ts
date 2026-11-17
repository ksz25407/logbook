// Importer for the plain-text notepad format:
//
//   #5 - 11/19/2026: Sam's birthday         <- day header, optional label
//   + win                                   <- win
//   note: detail                            <- appended to the log line above
//   - slip                                  <- slip
//   TODO                                    <- heading, ignored
//   * task   or   • task                    <- task (imported as not done)
//   Reflection: text                        <- may continue on following lines
//
// Everything before the first header is ignored. Lines that can't be
// parsed are skipped and counted.
import type { DateKey } from "../shared/types";

export interface ImportedDay {
  label?: string;
  todos: string[];
  log: { kind: "+" | "-"; text: string }[];
  ref: string;
}

export interface NotepadResult {
  days: Record<DateKey, ImportedDay>;
  skipped: number;
}

const HEADER = /^#\s*\d+\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*:?\s*(.*)$/;
const pad = (n: number) => String(n).padStart(2, "0");

function headerDate(m: RegExpMatchArray): DateKey | null {
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** A line that ends a multi-line reflection. */
function isMarker(line: string): boolean {
  return /^(#|\*|•|\+|-)/.test(line) || /^todo:?$/i.test(line);
}

const append = (a: string, b: string) => (a ? `${a} ${b}` : b);

export function parseNotepad(text: string): NotepadResult {
  const days: Record<DateKey, ImportedDay> = {};
  let skipped = 0;
  let day: ImportedDay | null = null;
  let seenHeader = false;
  let inReflection = false;
  let lastWasLog = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const h = line.match(HEADER);
    if (h) {
      seenHeader = true;
      inReflection = false;
      lastWasLog = false;
      const key = headerDate(h);
      if (!key) { day = null; skipped++; continue; }
      day = days[key] ??= { todos: [], log: [], ref: "" };
      const label = h[4].trim();
      if (label) day.label = label;
      continue;
    }
    if (!seenHeader) continue;
    if (!day) { skipped++; continue; } // lines under an invalid header

    if (inReflection && !isMarker(line)) {
      day.ref = append(day.ref, line);
      continue;
    }
    inReflection = false;

    const refl = line.match(/^reflection\s*:\s*(.*)$/i);
    if (refl) {
      inReflection = true;
      lastWasLog = false;
      if (refl[1].trim()) day.ref = append(day.ref, refl[1].trim());
      continue;
    }

    const note = line.match(/^note\s*:\s*(.*)$/i);
    if (note) {
      const last = day.log[day.log.length - 1];
      const t = note[1].trim();
      if (lastWasLog && last && t) last.text += ` (${t})`;
      else if (t) skipped++;
      continue; // lastWasLog stays as-is so several notes can stack
    }

    if (/^todo:?$/i.test(line)) { lastWasLog = false; continue; }

    const log = line.match(/^([+-])\s*(.+)$/);
    if (log) {
      day.log.push({ kind: log[1] as "+" | "-", text: log[2].trim() });
      lastWasLog = true;
      continue;
    }

    const task = line.match(/^[*•]\s*(.+)$/);
    if (task) {
      day.todos.push(task[1].trim());
      lastWasLog = false;
      continue;
    }

    skipped++;
    lastWasLog = false;
  }

  return { days, skipped };
}
