// WEEK screen: seven columns (Monday first). Drag tasks between days to reschedule.
import { useEffect, useState } from "react";
import type { Db, DateKey, ID } from "../../shared/types";
import { addDays, formatLong, fromKey } from "../../shared/dates";
import * as ops from "../../logic/dayOps";
import { weekStart, lastDays } from "../../logic/stats";
import type { Apply } from "../state/useDb";
import { InlineInput, isTyping } from "../ui/bits";

interface Props {
  db: Db;
  apply: Apply;
  viewing: DateKey;
  today: DateKey;
  setViewing: (k: DateKey) => void;
  onOpenDay: (k: DateKey) => void;
  keysEnabled: boolean;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function Week({ db, apply, viewing, today, setViewing, onOpenDay, keysEnabled }: Props) {
  const start = weekStart(viewing);
  const days = lastDays(addDays(start, 6), 7);
  const [drag, setDrag] = useState<{ day: DateKey; id: ID } | null>(null);
  const [drop, setDrop] = useState<{ day: DateKey; index: number } | null>(null);
  const [adding, setAdding] = useState<DateKey | null>(null);

  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); onOpenDay(viewing); }
      else if (e.key === "n") { e.preventDefault(); setAdding(viewing); }
      else if (e.key === "ArrowUp" || e.key === "k") setViewing(addDays(viewing, -7));
      else if (e.key === "ArrowDown" || e.key === "j") setViewing(addDays(viewing, 7));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (drag && drop) apply((d) => ops.moveTodoToDay(d, drag.day, drag.id, drop.day, drop.index));
    setDrag(null);
    setDrop(null);
  }

  const done = days.reduce((s, k) => s + ops.getDay(db, k).todos.filter((t) => t.done).length, 0);
  const total = days.reduce((s, k) => s + ops.getDay(db, k).todos.length, 0);

  return (
    <div className="week">
      <div className="dayhead">
        <button className="arrow" title="Previous week (↑)" onClick={() => setViewing(addDays(viewing, -7))}>◄</button>
        <span className="date">WEEK OF {formatLong(start).slice(4)}</span>
        <button className="arrow" title="Next week (↓)" onClick={() => setViewing(addDays(viewing, 7))}>►</button>
        <span className="dim">{total ? `${done}/${total} done` : "no tasks this week"}</span>
        <span className="faint">drag tasks between days · ←→ pick a day · Enter open it · n add</span>
      </div>

      <div className="week-grid">
        {days.map((k) => {
          const d = ops.getDay(db, k);
          const sel = k === viewing;
          return (
            <div
              key={k}
              className={`week-col ${k === today ? "is-today" : ""}`}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("week-tail")) {
                  setDrop({ day: k, index: d.todos.length });
                }
              }}
              onDrop={onDrop}
            >
              <button className={`week-head ${sel ? "inv" : ""}`} onClick={() => setViewing(k)} onDoubleClick={() => onOpenDay(k)}
                title="Click to select, double-click to open">
                <span>{DOW[fromKey(k).getDay()]}{k === today ? " ·" : ""}</span>
                <span className="big week-num">{k.slice(8)}</span>
                <span className="week-meta blocks">
                  {d.rate ? "■".repeat(d.rate) + "□".repeat(5 - d.rate) : "·····"}
                </span>
              </button>
              {d.label && <div className="week-label" title={d.label}>// {d.label}</div>}
              <ul className="list week-list">
                {d.todos.map((t, i) => (
                  <li
                    key={t.id}
                    className={`week-task ${t.done ? "done" : ""} ${drag?.id === t.id ? "dragging" : ""} ${drop?.day === k && drop.index === i ? "drop-before" : ""}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDrag({ day: k, id: t.id }); }}
                    onDragEnd={() => { setDrag(null); setDrop(null); }}
                    onDragOver={(e) => {
                      if (!drag) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setDrop({ day: k, index: e.clientY < r.top + r.height / 2 ? i : i + 1 });
                    }}
                    onDrop={onDrop}
                    title={t.text}
                  >
                    <span className="mark" onClick={() => apply((db2) => ops.toggleTodo(db2, k, t.id))}>{t.done ? "[x]" : "[ ]"}</span>
                    <span className="txt" onDoubleClick={() => onOpenDay(k)}>{t.text}</span>
                  </li>
                ))}
                <li className={`week-tail ${drop?.day === k && drop.index === d.todos.length ? "drop-before" : ""}`}>
                  {adding === k ? (
                    <InlineInput initial="" keepOpen placeholder="task…"
                      onCommit={(x) => apply((db2) => ops.addTodo(db2, k, x))} onCancel={() => setAdding(null)} />
                  ) : (
                    <button className="add" onClick={() => setAdding(k)}>+</button>
                  )}
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
