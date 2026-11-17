// The evening "rate your day" reminder.
import type { Db } from "../shared/types";
import { todayKey } from "../shared/dates";

/**
 * True once per day, after the reminder time, if today still has no rating
 * or no reflection. `now` is local time.
 */
export function shouldRemind(db: Db, now: Date): boolean {
  const r = db.settings.reminder;
  if (!r.enabled) return false;
  const key = todayKey(now);
  if (r.lastSent === key) return false;
  const [h, m] = r.time.split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  const day = db.days[key];
  return !day?.rate || !day.ref.trim();
}

export function markReminded(db: Db, now: Date): Db {
  return { ...db, settings: { ...db.settings, reminder: { ...db.settings.reminder, lastSent: todayKey(now) } } };
}
