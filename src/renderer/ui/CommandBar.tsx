// The command bar at the bottom: "/" or Ctrl+K to focus, Enter to run,
// Up/Down for history, Tab to autocomplete, Escape to leave.
import { forwardRef, useState } from "react";
import { complete } from "../../logic/commands";
import { Cursor, Typewriter } from "./bits";

export interface Message {
  text: string;
  err?: boolean;
  stamp: number;
}

interface Props {
  history: string[];
  message: Message | null;
  onSubmit: (line: string) => void;
}

export const CommandBar = forwardRef<HTMLInputElement, Props>(function CommandBar({ history, message, onSubmit }, ref) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hIndex, setHIndex] = useState<number | null>(null); // position in history while browsing
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<string[]>([]);

  function browse(dir: -1 | 1) {
    if (!history.length) return;
    let i = hIndex === null ? history.length : hIndex;
    if (hIndex === null) setDraft(value);
    i = Math.max(0, Math.min(history.length, i + dir));
    setHIndex(i === history.length ? null : i);
    setValue(i === history.length ? draft : history[i]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation(); // global shortcuts stay quiet while typing here
    if (e.key === "Enter") {
      if (value.trim()) onSubmit(value.trim());
      setValue("");
      setHIndex(null);
      setOptions([]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      browse(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      browse(1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const r = complete(value);
      setValue(r.value);
      setOptions(r.options.length > 1 ? r.options : []);
    } else if (e.key === "Escape") {
      setValue("");
      setOptions([]);
      e.currentTarget.blur();
    }
  }

  return (
    <div className="cmdbar">
      <div className={`cmdmsg ${message?.err ? "err" : ""}`}>
        {options.length > 0 ? options.join("   ") : message ? <Typewriter text={message.text} stamp={message.stamp} /> : ""}
      </div>
      <label className={`cmdline ${focused ? "focused" : ""}`}>
        <span className="prompt">&gt;</span>
        {!focused && !value && <Cursor />}
        <input
          ref={ref}
          value={value}
          spellCheck={false}
          placeholder={focused ? "" : "press / to type a command, or help"}
          onChange={(e) => { setValue(e.target.value); setOptions([]); }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <span className="hint">{focused ? "tab complete · ↑↓ history · esc" : "/  ctrl+k"}</span>
      </label>
    </div>
  );
});
