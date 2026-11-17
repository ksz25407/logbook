// Holds the database in the renderer, applies edits, keeps an undo stack,
// and saves to disk 300 ms after the last change.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Db } from "../../shared/types";

const SAVE_DELAY = 300;
const UNDO_LIMIT = 50;

export type Apply = (fn: (db: Db) => Db, opts?: { undoable?: boolean }) => void;

export function useDb() {
  const [db, setDb] = useState<Db | null>(null);
  const [warning, setWarning] = useState<string>();
  const latest = useRef<Db | null>(null);
  const undoStack = useRef<Db[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.logbook.load().then((r) => {
      latest.current = r.db;
      setDb(r.db);
      setWarning(r.warning);
    });
  }, []);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (latest.current) window.logbook.save(latest.current).catch((e) => console.error("save failed", e));
    }, SAVE_DELAY);
  }, []);

  // Flush a pending save when the window closes.
  useEffect(() => {
    const flush = () => {
      if (timer.current !== undefined && latest.current) {
        window.clearTimeout(timer.current);
        window.logbook.saveSync(latest.current);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  const apply: Apply = useCallback((fn, opts = {}) => {
    const prev = latest.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    if (opts.undoable !== false) {
      undoStack.current.push(prev);
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    }
    latest.current = next;
    setDb(next);
    scheduleSave();
  }, [scheduleSave]);

  const undo = useCallback((): boolean => {
    const prev = undoStack.current.pop();
    if (!prev) return false;
    latest.current = prev;
    setDb(prev);
    scheduleSave();
    return true;
  }, [scheduleSave]);

  return { db, warning, apply, undo };
}
