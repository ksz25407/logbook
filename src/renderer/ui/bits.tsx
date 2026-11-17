// Small shared UI pieces: panel, cursor, typewriter text, toast, inline editor.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Panel(props: { title: ReactNode; quiet?: boolean; className?: string; children: ReactNode }) {
  return (
    <fieldset className={`panel ${props.quiet ? "quiet" : ""} ${props.className ?? ""}`}>
      <legend>[ {props.title} ]</legend>
      {props.children}
    </fieldset>
  );
}

export const Cursor = () => <span className="cursor" aria-hidden />;

/** Reveals `text` one character at a time; restarts whenever `text` (or `stamp`) changes. */
export function Typewriter({ text, stamp, speed = 12 }: { text: string; stamp?: number; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    let k = 0;
    const id = window.setInterval(() => {
      k++;
      setN(k);
      if (k >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, stamp, speed]);
  return <>{text.slice(0, n)}</>;
}

export interface ToastMsg {
  id: number;
  text: string;
  undo?: boolean;
}

export function Toast({ toast, onUndo, onDone }: { toast: ToastMsg | null; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(id);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span><Typewriter text={toast.text} stamp={toast.id} /></span>
      {toast.undo && <button onClick={onUndo}>UNDO (Ctrl+Z)</button>}
    </div>
  );
}

/** A one-line text input that commits on Enter/blur and cancels on Escape. */
export function InlineInput(props: {
  initial: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
  keepOpen?: boolean; // clear and stay focused after Enter (for "add" rows)
}) {
  const [value, setValue] = useState(props.initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      placeholder={props.placeholder}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          if (props.keepOpen) {
            if (value.trim()) props.onCommit(value.trim());
            setValue("");
          } else {
            done.current = true;
            props.onCommit(value.trim());
          }
        } else if (e.key === "Escape") {
          done.current = true;
          props.onCancel();
        }
      }}
      onBlur={() => {
        if (done.current) return;
        if (props.keepOpen) props.onCancel();
        else props.onCommit(value.trim());
      }}
    />
  );
}

/** True when the keyboard event is aimed at a text field. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/** "████████░░░░ 67%" */
export function bar(frac: number, width = 20): string {
  const f = Math.max(0, Math.min(1, frac));
  const full = Math.round(f * width);
  return "█".repeat(full) + "░".repeat(width - full);
}
