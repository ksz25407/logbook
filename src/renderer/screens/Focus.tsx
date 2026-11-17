// FOCUS screen. Idle: pick a task/topic and a length. Running: big countdown.
// Finished: what got logged (and, for a topic, the option to finish it).
import { useEffect, useState } from "react";
import type { Db, DateKey, ID } from "../../shared/types";
import { getDay } from "../../logic/dayOps";
import { clock, elapsedMs, remainingMs } from "../../logic/focus";
import { Panel, Bar, Typewriter, isTyping } from "../ui/bits";

export interface FocusTarget {
  label: string;
  todoId?: ID;
  topicId?: ID;
}

export interface Finished {
  label: string;
  minutes: number;
  completed: boolean;
  topicId?: ID;
  stamp: number;
}

interface Props {
  db: Db;
  today: DateKey;
  now: number;
  minutes: number;
  setMinutes: (m: number) => void;
  finished: Finished | null;
  keysEnabled: boolean;
  onStart: (t: FocusTarget) => void;
  onPause: () => void;
  onExtend: () => void;
  onStop: () => void;
  onDismiss: () => void;
  onFinishTopic: (topicId: ID) => void;
}

export function Focus(p: Props) {
  const a = p.db.activeFocus;
  if (a) return <Running {...p} />;
  if (p.finished) return <Done {...p} />;
  return <Idle {...p} />;
}

function Idle({ db, today, minutes, setMinutes, keysEnabled, onStart }: Props) {
  const targets: FocusTarget[] = [
    ...getDay(db, today).todos.filter((t) => !t.done).map((t) => ({ label: t.text, todoId: t.id })),
    ...db.topics.filter((t) => t.status === "in_progress").map((t) => ({ label: t.title, topicId: t.id })),
    { label: "(no task, just focus)" },
  ];
  const [sel, setSel] = useState(0);
  const presets = db.settings.focusPresets;
  const cur = Math.min(sel, targets.length - 1);

  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "ArrowDown" || k === "j") { e.preventDefault(); setSel(Math.min(targets.length - 1, cur + 1)); }
      else if (k === "ArrowUp" || k === "k") { e.preventDefault(); setSel(Math.max(0, cur - 1)); }
      else if (/^[1-9]$/.test(k) && presets[Number(k) - 1]) setMinutes(presets[Number(k) - 1]);
      else if (k === "+" || k === "=") setMinutes(Math.min(600, minutes + 5));
      else if (k === "-") setMinutes(Math.max(5, minutes - 5));
      else if (k === "Enter" || k === " ") { e.preventDefault(); onStart(targets[cur]); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="focus">
      <Panel title="FOCUS">
        <div className="focus-idle">
          <div className="big focus-clock dim">{clock(minutes * 60_000)}</div>
          <div className="presets">
            {presets.map((m, i) => (
              <button key={m} className={`btn ${m === minutes ? "inv" : ""}`} onClick={() => setMinutes(m)}>
                <span className="faint">{i + 1}</span> {m} min
              </button>
            ))}
            <span className="dim">  − / + adjust by 5</span>
          </div>

          <div className="dim focus-q">what are you focusing on?</div>
          <ul className="list focus-targets">
            {targets.map((t, i) => (
              <li
                key={t.todoId ?? t.topicId ?? "none"}
                className={`row ${i === cur ? "sel" : ""}`}
                onClick={() => setSel(i)}
                onDoubleClick={() => onStart(t)}
              >
                <span className="mark">{t.topicId ? "[>]" : t.todoId ? "[ ]" : " · "}</span>
                <span className="txt">{t.label}</span>
                <span className="meta">{t.topicId ? "topic" : ""}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button className="btn" onClick={() => onStart(targets[cur])}>[Enter] start {minutes} min</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Running({ db, now, keysEnabled, onPause, onExtend, onStop }: Props) {
  const a = db.activeFocus!;
  const left = remainingMs(a, now);
  const frac = elapsedMs(a, now) / (a.plannedMin * 60_000);
  const paused = !!a.pausedAt;

  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "p") { e.preventDefault(); onPause(); }
      else if (k === "+" || k === "=") onExtend();
      else if (k === "s") onStop();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="focus">
      <Panel title={paused ? "FOCUS · PAUSED" : "FOCUS"}>
        <div className="focus-run">
          <div className="dim">{a.topicId ? "learning" : "working on"}</div>
          <div className="focus-label">{a.label}</div>
          <div className={`big focus-clock huge ${paused ? "blink dim" : ""}`}>{clock(left)}</div>
          <div><Bar frac={frac} width={48} /></div>
          <div className="dim">{a.plannedMin} min session · started {new Date(a.startedAt).toTimeString().slice(0, 5)}</div>
          <div className="actions">
            <button className="btn" onClick={onPause}>[Space] {paused ? "resume" : "pause"}</button>
            <button className="btn" onClick={onExtend}>[+] 5 min</button>
            <button className="btn" onClick={onStop}>[S] stop &amp; log</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Done({ finished, keysEnabled, onDismiss, onFinishTopic }: Props) {
  const f = finished!;
  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); onDismiss(); }
      else if (e.key.toLowerCase() === "f" && f.topicId) onFinishTopic(f.topicId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const msg = f.minutes
    ? `${f.minutes} min logged to "${f.label}"`
    : `stopped under a minute; nothing logged`;
  return (
    <div className="focus">
      <Panel title="FOCUS · DONE">
        <div className="focus-run">
          <div className="big focus-clock huge flash-big" key={f.stamp}>{f.completed ? "DONE" : "STOPPED"}</div>
          <div><Typewriter text={msg} stamp={f.stamp} /></div>
          <div className="actions">
            {f.topicId && <button className="btn" onClick={() => onFinishTopic(f.topicId!)}>[F] finish topic &amp; answer the check</button>}
            <button className="btn" onClick={onDismiss}>[Enter] new session</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
