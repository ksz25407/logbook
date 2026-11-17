// TODAY screen: tasks, wins/slips, rating, reflection, day label, carry-over prompt.
import { useEffect, useMemo, useState } from "react";
import type { Db, DateKey, Rating } from "../../shared/types";
import { addDays, formatLong } from "../../shared/dates";
import * as ops from "../../logic/dayOps";
import type { Apply } from "../state/useDb";
import { Panel, InlineInput, isTyping, Bar } from "../ui/bits";

interface Props {
  db: Db;
  apply: Apply;
  viewing: DateKey;
  today: DateKey;
  setViewing: (d: DateKey) => void;
  toast: (text: string, undo?: boolean) => void;
  keysEnabled: boolean;
  onFocus: (todoId: string, label: string) => void;
}

type ListKind = "todo" | "log";
type Item = { kind: ListKind; id: string; index: number };

export function Today({ db, apply, viewing, today, setViewing, toast, keysEnabled, onFocus }: Props) {
  const day = ops.getDay(db, viewing);
  const [selId, setSelId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState<"todo" | "+" | "-" | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ kind: ListKind; from: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const items: Item[] = useMemo(
    () => [
      ...day.todos.map((t, index) => ({ kind: "todo" as const, id: t.id, index })),
      ...day.log.map((l, index) => ({ kind: "log" as const, id: l.id, index })),
    ],
    [day.todos, day.log],
  );
  const carry = viewing === today ? ops.pendingCarryOver(db, viewing) : [];

  // Reset per-day UI state when switching days.
  useEffect(() => {
    setSelId(null);
    setEditId(null);
    setAdding(null);
    setEditingLabel(false);
  }, [viewing]);

  // ---- actions ----
  function toggle(id: string) {
    const t = day.todos.find((x) => x.id === id);
    if (!t) return;
    apply((d) => ops.toggleTodo(d, viewing, id));
    if (!t.done) setFlashId(id);
  }

  function remove(item: Item) {
    const all = items;
    const pos = all.findIndex((i) => i.id === item.id);
    const text = item.kind === "todo" ? day.todos[item.index].text : day.log[item.index].text;
    apply((d) => (item.kind === "todo" ? ops.removeTodo(d, viewing, item.id) : ops.removeLog(d, viewing, item.id)));
    const next = all[pos + 1] ?? all[pos - 1];
    setSelId(next && next.id !== item.id ? next.id : null);
    toast(`deleted "${text.length > 40 ? text.slice(0, 40) + "…" : text}"`, true);
  }

  function commitEdit(item: Item, text: string) {
    setEditId(null);
    if (!text) return; // empty edit = no change; use Delete to remove
    apply((d) => (item.kind === "todo" ? ops.editTodo(d, viewing, item.id, text) : ops.editLog(d, viewing, item.id, text)));
  }

  function moveItem(kind: ListKind, from: number, to: number) {
    apply((d) => (kind === "todo" ? ops.moveTodo(d, viewing, from, to) : ops.moveLog(d, viewing, from, to)));
  }

  function rate(r: Rating) {
    apply((d) => ops.setRate(d, viewing, r));
  }

  // ---- keyboard ----
  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.metaKey) return;
      const pos = items.findIndex((i) => i.id === selId);
      const sel = pos >= 0 ? items[pos] : null;
      const k = e.key;

      if (carry.length && (k === "y" || k === "Y")) {
        apply((d) => ops.carryOver(d, viewing, carry));
      } else if (carry.length && (k === "n" || k === "N")) {
        apply((d) => ops.dismissCarryOver(d, viewing));
      } else if ((k === "ArrowDown" || k === "j") && !e.altKey) {
        e.preventDefault();
        setSelId(items[Math.min(items.length - 1, pos + 1)]?.id ?? null);
      } else if ((k === "ArrowUp" || k === "k") && !e.altKey) {
        e.preventDefault();
        setSelId(items[pos <= 0 ? 0 : pos - 1]?.id ?? null);
      } else if (e.altKey && (k === "ArrowUp" || k === "ArrowDown") && sel) {
        e.preventDefault();
        moveItem(sel.kind, sel.index, sel.index + (k === "ArrowUp" ? -1 : 1));
      } else if (k === " " && sel?.kind === "todo") {
        e.preventDefault();
        toggle(sel.id);
      } else if (k === "Enter" && sel) {
        e.preventDefault();
        setEditId(sel.id);
      } else if ((k === "Delete" || k === "Backspace") && sel) {
        e.preventDefault();
        remove(sel);
      } else if (k === "Escape") {
        setSelId(null);
      } else if (/^[1-5]$/.test(k) && !e.altKey) {
        rate(Number(k) as Rating);
      } else if (k === "f" && sel?.kind === "todo") {
        e.preventDefault();
        if (viewing !== today) toast("focus sessions are for today's tasks");
        else onFocus(sel.id, day.todos[sel.index].text);
      } else if (k === "n") {
        e.preventDefault();
        setAdding("todo");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- drag and drop (within one list) ----
  function dragProps(kind: ListKind, index: number) {
    return {
      draggable: editId === null,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        setDrag({ kind, from: index });
      },
      onDragOver: (e: React.DragEvent) => {
        if (drag?.kind !== kind) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (drag?.kind === kind && dropAt !== null) {
          const to = dropAt > drag.from ? dropAt - 1 : dropAt;
          moveItem(kind, drag.from, to);
        }
        setDrag(null);
        setDropAt(null);
      },
      onDragEnd: () => { setDrag(null); setDropAt(null); },
    };
  }

  function rowClass(kind: ListKind, id: string, index: number, extra = "") {
    return [
      "row",
      extra,
      selId === id && editId !== id ? "sel" : "",
      flashId === id ? "flash" : "",
      drag?.kind === kind && drag.from === index ? "dragging" : "",
      drag?.kind === kind && dropAt === index ? "drop-before" : "",
    ].join(" ");
  }

  const doneCount = day.todos.filter((t) => t.done).length;
  const wins = day.log.filter((l) => l.kind === "+").length;
  const rel = viewing === today ? "TODAY" : relative(viewing, today);

  return (
    <div>
      <div className="dayhead">
        <button className="arrow" title="Previous day (←)" onClick={() => setViewing(addDays(viewing, -1))}>◄</button>
        <span className="date">{formatLong(viewing)}</span>
        <button className="arrow" title="Next day (→)" onClick={() => setViewing(addDays(viewing, 1))}>►</button>
        <button className={`rel ${viewing === today ? "is-today" : ""}`} onClick={() => setViewing(today)} title="Go to today">
          {rel}
        </button>
        <span className="label-line" onDoubleClick={() => setEditingLabel(true)} onClick={() => !day.label && setEditingLabel(true)}>
          {editingLabel ? (
            <InlineInput
              initial={day.label ?? ""}
              placeholder="label this day…"
              onCommit={(t) => { setEditingLabel(false); apply((d) => ops.setLabel(d, viewing, t)); }}
              onCancel={() => setEditingLabel(false)}
            />
          ) : day.label ? (
            <span title="Double-click to edit">// {day.label}</span>
          ) : (
            <span className="faint">+ label</span>
          )}
        </span>
      </div>

      {carry.length > 0 && (
        <div className="carry">
          <div>
            carry over? {carry.length} unfinished from yesterday:{" "}
            <span className="dim">{carry.map((t) => t.text).join(" · ")}</span>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => apply((d) => ops.carryOver(d, viewing, carry))}>[Y] carry all</button>
            <button className="btn" onClick={() => apply((d) => ops.dismissCarryOver(d, viewing))}>[N] leave them</button>
          </div>
        </div>
      )}

      <div className="today-grid">
        <div className="col">
          <Panel title={`TODO ${doneCount}/${day.todos.length}`}>
            <ul className="list" onDragLeave={(e) => { if (e.currentTarget === e.target) setDropAt(null); }}>
              {day.todos.length === 0 && <li className="empty">no tasks. press n, or type "t buy milk" in the command bar.</li>}
              {day.todos.map((t, i) => {
                const item: Item = { kind: "todo", id: t.id, index: i };
                return (
                  <li
                    key={t.id}
                    className={rowClass("todo", t.id, i, t.done ? "done" : "")}
                    onClick={() => setSelId(t.id)}
                    onDoubleClick={() => setEditId(t.id)}
                    onAnimationEnd={() => setFlashId(null)}
                    {...dragProps("todo", i)}
                  >
                    <span
                      className="mark"
                      title="Check off (Space)"
                      onClick={(e) => { e.stopPropagation(); setSelId(t.id); toggle(t.id); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {t.done ? "[x]" : "[ ]"}
                    </span>
                    <span className="txt">
                      {editId === t.id ? (
                        <InlineInput initial={t.text} onCommit={(x) => commitEdit(item, x)} onCancel={() => setEditId(null)} />
                      ) : t.text}
                    </span>
                    <span className="meta">
                      {t.focusMin > 0 && `${t.focusMin}m `}
                      {t.carriedFrom && "↻"}
                    </span>
                  </li>
                );
              })}
              {drag?.kind === "todo" && (
                <li className={`list-end ${dropAt === day.todos.length ? "drop-before" : ""}`} {...dragProps("todo", day.todos.length)} />
              )}
            </ul>
            {adding === "todo" ? (
              <div className="add"><span>[ ]</span>
                <InlineInput initial="" keepOpen placeholder="new task, Enter to add, Esc to stop"
                  onCommit={(x) => apply((d) => ops.addTodo(d, viewing, x))} onCancel={() => setAdding(null)} />
              </div>
            ) : (
              <button className="add" onClick={() => setAdding("todo")}>+ add task <span className="faint">(n)</span></button>
            )}
            {day.todos.length > 0 && (
              <div className="progress">
                <Bar frac={doneCount / day.todos.length} width={24} />
                <span>{Math.round((100 * doneCount) / day.todos.length)}%</span>
              </div>
            )}
          </Panel>
        </div>

        <div className="col">
          <Panel title={`LOG +${wins} −${day.log.length - wins}`}>
            <ul className="list">
              {day.log.length === 0 && <li className="empty">no wins or slips yet. "+ text" or "- text".</li>}
              {day.log.map((l, i) => {
                const item: Item = { kind: "log", id: l.id, index: i };
                return (
                  <li
                    key={l.id}
                    className={rowClass("log", l.id, i)}
                    onClick={() => setSelId(l.id)}
                    onDoubleClick={() => setEditId(l.id)}
                    {...dragProps("log", i)}
                  >
                    <span className="mark">{l.kind === "+" ? " + " : " − "}</span>
                    <span className="txt">
                      {editId === l.id ? (
                        <InlineInput initial={l.text} onCommit={(x) => commitEdit(item, x)} onCancel={() => setEditId(null)} />
                      ) : l.text}
                    </span>
                    <span className="meta">{l.at ? new Date(l.at).toTimeString().slice(0, 5) : ""}</span>
                  </li>
                );
              })}
              {drag?.kind === "log" && (
                <li className={`list-end ${dropAt === day.log.length ? "drop-before" : ""}`} {...dragProps("log", day.log.length)} />
              )}
            </ul>
            {adding === "+" || adding === "-" ? (
              <div className="add"><span>{adding === "+" ? " + " : " − "}</span>
                <InlineInput initial="" keepOpen placeholder={adding === "+" ? "a win" : "a slip"}
                  onCommit={(x) => apply((d) => ops.addLog(d, viewing, adding, x))} onCancel={() => setAdding(null)} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: "2ch" }}>
                <button className="add" onClick={() => setAdding("+")}>+ win</button>
                <button className="add" onClick={() => setAdding("-")}>− slip</button>
              </div>
            )}
          </Panel>

          <RatingPanel rate={day.rate} onRate={rate} />

          <Panel title="REFLECTION">
            <div className="cmdline">
              <span className="prompt dim">&gt;</span>
              <input
                value={day.ref}
                spellCheck={false}
                maxLength={280}
                placeholder="one line about today…"
                onChange={(e) => apply((d) => ops.setRef(d, viewing, e.target.value), { undoable: false })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RatingPanel({ rate, onRate }: { rate: Rating | null; onRate: (r: Rating) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? rate ?? 0;
  return (
    <Panel title="SATISFACTION">
      <div className="rating" onMouseLeave={() => setHover(null)}>
        {([1, 2, 3, 4, 5] as Rating[]).map((r) => (
          <button
            key={r}
            className={r <= shown ? "on" : ""}
            title={`${r}/5 (key ${r})`}
            onMouseEnter={() => setHover(r)}
            onClick={() => onRate(r)}
          >
            {r <= shown ? "■" : "□"}
          </button>
        ))}
        <span className="val">{rate ? `${rate}/5` : "-/5"}</span>
      </div>
    </Panel>
  );
}

function relative(key: DateKey, today: DateKey): string {
  const ms = new Date(key + "T00:00").getTime() - new Date(today + "T00:00").getTime();
  const n = Math.round(ms / 86_400_000);
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  return n < 0 ? `${-n} days ago` : `in ${n} days`;
}
