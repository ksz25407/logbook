// App shell: top bar, screen switching, global keys, command bar, toasts, help.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveFocus, DateKey, ID, Topic } from "../shared/types";
import { addDays, formatLong, todayKey } from "../shared/dates";
import { parseCommand, HELP, SCREENS, type Screen } from "../logic/commands";
import * as ops from "../logic/dayOps";
import * as F from "../logic/focus";
import { startTopic } from "../logic/topics";
import { parseImport, mergeImport, exportMarkdown, type MergeReport } from "../logic/importExport";
import { shouldRemind, markReminded } from "../logic/reminder";
import { useDb } from "./state/useDb";
import { CommandBar, type Message } from "./ui/CommandBar";
import { Panel, Toast, Cursor, isTyping, type ToastMsg } from "./ui/bits";
import { Today } from "./screens/Today";
import { Stats } from "./screens/Stats";
import { Focus, type Finished, type FocusTarget } from "./screens/Focus";
import { Learn } from "./screens/Learn";
import { Week } from "./screens/Week";


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
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) setViewing((v) => (v === prevToday.current ? today : v));
    prevToday.current = today;
  }, [today]);

  // ---- focus sessions (live here so they keep running on every screen) ----
  const [now, setNow] = useState(() => Date.now());
  const [focusMin, setFocusMin] = useState<number | null>(null); // null = last used
  const [finished, setFinished] = useState<Finished | null>(null);
  const [answerFor, setAnswerFor] = useState<ID | null>(null);
  const running = !!db?.activeFocus;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const endFocus = useCallback((completed: boolean) => {
    let a: ActiveFocus | undefined;
    let minutes = 0;
    apply((d) => {
      a = d.activeFocus;
      const r = F.finishFocus(d, Date.now(), completed);
      minutes = r.minutes;
      return r.db;
    }, { undoable: false });
    if (!a) return;
    setFinished({ label: a.label, minutes, completed, topicId: a.topicId, stamp: Date.now() });
    if (completed) window.logbook.notify("Focus session done", `${minutes} min logged to "${a.label}"`);
    say(minutes ? `${minutes} min logged to "${a.label}"` : "stopped; under a minute, nothing logged");
  }, [apply, say]);

  // Evening reminder: checked every 30 s (and on the clock tick).
  useEffect(() => {
    if (!db || !shouldRemind(db, clock)) return;
    apply((d) => markReminded(d, new Date()), { undoable: false });
    window.logbook.notify("How was today?", "Rate your day 1-5 and write one line of reflection.");
    say("evening check-in: rate the day (1-5) and write a reflection");
  }, [db, clock, apply, say]);

  // Finish the session when time is up (also catches one that ran out while the app was closed).
  useEffect(() => {
    const a = db?.activeFocus;
    if (a && !a.pausedAt && F.remainingMs(a, now) <= 0) endFocus(true);
  }, [db, now, endFocus]);

  const latestRunning = useRef(running);
  latestRunning.current = running;
  const beginFocus = useCallback((t: FocusTarget, minutes: number) => {
    if (latestRunning.current) { say("a focus session is already running", true); setScreen("focus"); return; }
    apply((d) => F.startFocus(d, { day: todayKey(), minutes, ...t }, Date.now()), { undoable: false });
    setNow(Date.now());
    setFinished(null);
    setScreen("focus");
    say(`focus: ${minutes} min on "${t.label}"`);
  }, [apply, say]);

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

  async function doImport() {
    const f = await window.logbook.openFile();
    if (!f) return say("import cancelled");
    let parsed;
    try {
      parsed = parseImport(f.text);
    } catch (e) {
      return say(`can't import ${f.name}: ${(e as Error).message}`, true);
    }
    let report: MergeReport = { days: 0, todos: 0, log: 0 };
    apply((d) => {
      const r = mergeImport(d, parsed);
      report = r.report;
      return r.report.days || r.db.start !== d.start ? r.db : d; // unchanged → no undo step
    });
    const skipped = parsed.skipped ? `, ${parsed.skipped} skipped` : "";
    if (!report.days) return say(`nothing new in ${f.name}${skipped}`);
    say(`imported ${f.name} (${parsed.format}): ${report.days} days, ${report.todos} tasks, ${report.log} log lines${skipped}. ctrl+z undoes it`);
  }

  async function doExport(format: "json" | "md") {
    const stamp = todayKey();
    const content = format === "json" ? JSON.stringify(db, null, 1) : exportMarkdown(db!);
    const path = await window.logbook.saveFile(`logbook-${stamp}.${format}`, content);
    say(path ? `exported to ${path}` : "export cancelled");
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
        if (cmd.minutes) setFocusMin(cmd.minutes);
        setScreen("focus");
        return say(db?.activeFocus ? "" : `pick what to focus on, Enter to start${cmd.minutes ? ` ${cmd.minutes} min` : ""}`);
      case "screen":
        setScreen(cmd.screen);
        return say("");
      case "import":
        void doImport();
        return say("choose a file to import…");
      case "export":
        void doExport(cmd.format);
        return say("choose where to save…");
      case "remind":
        apply((d) => ({ ...d, settings: { ...d.settings, reminder: { ...d.settings.reminder, enabled: cmd.enabled, time: cmd.time ?? d.settings.reminder.time } } }), { undoable: false });
        return say(cmd.enabled ? `evening reminder at ${cmd.time ?? db!.settings.reminder.time}` : "evening reminder off");
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
        {db.activeFocus && screen !== "focus" && (
          <button className="tab mini-timer" onClick={() => setScreen("focus")} title={db.activeFocus.label}>
            {db.activeFocus.pausedAt ? "❚❚" : "▶"} {F.clock(F.remainingMs(db.activeFocus, now))}
          </button>
        )}
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
            onFocus={(todoId, label) => beginFocus({ todoId, label }, focusMin ?? db.settings.lastFocusMin)}
          />
        ) : screen === "stats" ? (
          <Stats
            db={db}
            today={today}
            viewing={viewing}
            onJump={(k) => { setViewing(k); setScreen("today"); }}
          />
        ) : screen === "focus" ? (
          <Focus
            db={db}
            today={today}
            now={now}
            minutes={focusMin ?? db.settings.lastFocusMin}
            setMinutes={setFocusMin}
            finished={finished}
            keysEnabled={!helpOpen}
            onStart={(t) => beginFocus(t, focusMin ?? db.settings.lastFocusMin)}
            onPause={() => apply((d) => F.togglePause(d, Date.now()), { undoable: false })}
            onExtend={() => apply((d) => F.extendFocus(d, 5), { undoable: false })}
            onStop={() => endFocus(false)}
            onDismiss={() => setFinished(null)}
            onFinishTopic={(id) => { setFinished(null); setAnswerFor(id); setScreen("learn"); }}
          />
        ) : screen === "learn" ? (
          <Learn
            db={db}
            apply={apply}
            keysEnabled={!helpOpen}
            answerFor={answerFor}
            setAnswerFor={setAnswerFor}
            toast={toast}
            onStart={(t: Topic) => {
              if (db.activeFocus) { say("a focus session is already running", true); setScreen("focus"); return; }
              apply((d) => startTopic(d, t.id));
              beginFocus({ label: t.title, topicId: t.id }, db.settings.lastFocusMin);
            }}
          />
        ) : (
          <Week
            db={db}
            apply={apply}
            viewing={viewing}
            today={today}
            setViewing={setViewing}
            onOpenDay={(k) => { setViewing(k); setScreen("today"); }}
            keysEnabled={!helpOpen}
          />
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
  ["n", "new task (or topic, in LEARN)"],
  ["f", "focus on the selected task"],
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
