// Undo that only reverts what one action changed.
// Restoring a whole snapshot would also throw away later edits that aren't
// undoable themselves (reflection typing, a running focus session, history),
// so instead we put back just the fields the action touched.
import type { Db, Day } from "../shared/types";
import { emptyDay } from "../shared/db";

export interface UndoEntry {
  before: Db;
  after: Db;
}

export function revert(current: Db, { before, after }: UndoEntry): Db {
  let days = current.days;
  for (const k of new Set([...Object.keys(before.days), ...Object.keys(after.days)])) {
    const b = before.days[k], a = after.days[k];
    if (a === b) continue;
    days = { ...days, [k]: revertDay(current.days[k] ?? emptyDay(), b ?? emptyDay(), a ?? emptyDay()) };
  }
  return {
    ...current,
    days,
    topics: before.topics !== after.topics ? before.topics : current.topics,
  };
}

function revertDay(cur: Day, b: Day, a: Day): Day {
  const out: Record<string, unknown> = { ...cur };
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Day>) {
    if (a[f] !== b[f]) out[f] = b[f];
  }
  return out as unknown as Day;
}
