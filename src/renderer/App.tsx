// App shell: top bar, screen switching, global keys, command bar, toasts, help.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DateKey } from "../shared/types";
import { addDays, formatLong, todayKey } from "../shared/dates";
import { parseCommand, HELP, SCREENS, type Screen } from "../logic/commands";
import * as ops from "../logic/dayOps";
import { useDb } from "./state/useDb";
import { CommandBar, type Message } from "./ui/CommandBar";
import { Panel, Toast, Cursor, isTyping, type ToastMsg } from "./ui/bits";
import { Today } from "./screens/Today";

const PHASE: Record<Screen, number> = { today: 1, stats: 2, focus: 3, learn: 3, week: 4 };

export function App() {
  const { db, warning, apply, undo } = useDb();
  const [screen, setScreen] = useState<Screen>("today");
  const [today, setToday] = useState(todayKey());
  const [viewing, setViewing] = useState<DateKey>(todayKey());
  const [message, setMessage] = useState<Message | null>(null);
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const cmdRef = useRef<HTMLInputElement>(null);

  const say = useCallback((text: string, err = false) => setMessage({ text, err, stamp: Date.now() }), []);
  const toast = useCallback((text: string, undoable = false) => setToastMsg({ id: Date.now(), text, undo: undoable }), []);
  const clearToast = useCallback(() => setToastMsg(null), []);

  useEffect(() => { if (warning) say(warning, true); }, [warning, say]);

  // Clock tick; also follow the date over midnight if you were looking at "today".
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = new Date();
      setClock(now);
      setToday(todayKey(now));
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) setViewing((v) => (v === prevToday.current ? today : v));
    prevToday.current = today;
  }, [today]);

  const doUndo = useCallback(() => {
    setToastMsg(null);
    say(undo() ? "undone" : "nothing to undo");
  }, [undo, say]);

  // Global keys (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (helpOpen) {
        if (e.key === "Escape" || e.key === "Enter" || e.key === "?") { e.preventDefault(); setHelpOpen(false); }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); cmdRef.current?.focus(); return; }
      if (isTyping(e)) return;
      if (e.key === "/") { e.preventDefault(); cmdRef.current?.focus(); }
      else if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
      else if (e.ctrlKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); setScreen(SCREENS[Number(e.key) - 1]); }
      else if (e.key === "?") setHelpOpen(true);
      else if (!e.altKey && !e.ctrlKey && e.key === "ArrowLeft") setViewing((v) => addDays(v, -1));
      else if (!e.altKey && !e.ctrlKey && e.key === "ArrowRight") setViewing((v) => addDays(v, 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, doUndo]);

  if (!db) {
    return <div className="boot"><span>LOGBOOK · loading <Cursor /></span></div>;
  }

  function run(line: string) {
    apply((d) => ops.pushHistory(d, line), { undoable: false });
    const cmd = parseCommand(line, { viewing, today });
    const on = viewing === today ? "today" : formatLong(viewing);
    switch (cmd.kind) {
      case "task":
        apply((d) => ops.addTodo(d, viewing, cmd.text));
        setScreen("today");
        return say(`task added to ${on}: ${cmd.text}`);
      case "win":
      case "slip":
        apply((d) => ops.addLog(d, viewing, cmd.kind === "win" ? "+" : "-", cmd.text));
        setScreen("today");
        return say(`${cmd.kind} logged: ${cmd.text}`);
      case "rate":
        apply((d) => ops.updateDay(d, viewing, (day) => ({ ...day, rate: cmd.value })));
        return say(`${on} rated ${"■".repeat(cmd.value)}${"□".repeat(5 - cmd.value)} ${cmd.value}/5`);
      case "ref":
        apply((d) => ops.setRef(d, viewing, cmd.text));
        return say(cmd.text ? "reflection saved" : "reflection cleared");
      case "label":
        apply((d) => ops.setLabel(d, viewing, cmd.text));
        return say(cmd.text ? `label set: ${cmd.text}` : "label cleared");
      case "go":
        setViewing(cmd.date);
        setScreen("today");
        return say(`→ ${formatLong(cmd.date)}`);
      case "focus":
        return say(`FOCUS arrives in phase ${PHASE.focus}`);
      case "screen":
        setScreen(cmd.screen);
        return say(cmd.screen === "today" ? "" : `${cmd.screen.toUpperCase()} arrives in phase ${PHASE[cmd.screen]}`);
      case "help":
        setHelpOpen(true);
        return say("");
      case "error":
        return say(cmd.message, true);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">LOGBOOK</span>
        <nav className="tabs">
          {SCREENS.map((s, i) => (
            <button key={s} className={`tab ${screen === s ? "on" : ""}`} onClick={() => setScreen(s)} title={`Ctrl+${i + 1}`}>
              <span className="k">{i + 1}</span>{s.toUpperCase()}
            </button>
          ))}
        </nav>
        <button className="tab" onClick={() => setHelpOpen(true)} title="Help (?)">?</button>
        <span className="clock">{clock.toTimeString().slice(0, 5)}</span>
      </header>

      <main className="main">
        {screen === "today" ? (
          <Today
            db={db}
            apply={apply}
            viewing={viewing}
            today={today}
            setViewing={setViewing}
            toast={toast}
            keysEnabled={!helpOpen}
          />
        ) : (
          <div className="placeholder">
            <div className="big" style={{ fontSize: 48 }}>[ {screen.toUpperCase()} ]</div>
            <p>arrives in phase {PHASE[screen]}. <Cursor /></p>
          </div>
        )}
      </main>

      <CommandBar ref={cmdRef} history={db.cmdHistory} message={message} onSubmit={run} />
      <Toast toast={toastMsg} onUndo={doUndo} onDone={clearToast} />
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

const KEYS: [string, string][] = [
  ["/  or  Ctrl+K", "command bar"],
  ["↑ ↓  or  J K", "move between items"],
  ["← →", "previous / next day"],
  ["Space  or  click [ ]", "check off a task"],
  ["Enter  or  double-click", "edit inline"],
  ["Delete", "remove (Ctrl+Z to undo)"],
  ["Alt+↑ ↓  or  drag", "reorder"],
  ["n", "new task"],
  ["1-5", "rate the day"],
  ["Ctrl+1-5", "switch screen"],
  ["Esc", "leave a field / clear selection"],
];

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
        <Panel title="HELP">
          <div className="help-grid">
            <h4>COMMANDS</h4>
            {HELP.map(([k, d]) => [<span key={k} className="k">{k}</span>, <span key={k + "d"} className="d">{d}</span>])}
            <h4>KEYS</h4>
            {KEYS.map(([k, d]) => [<span key={k} className="k">{k}</span>, <span key={k + "d"} className="d">{d}</span>])}
          </div>
          <p className="faint">esc to close</p>
        </Panel>
      </div>
    </div>
  );
}
