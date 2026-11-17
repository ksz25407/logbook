// LEARN screen: a queue of topics, each with a "check" question.
// Start → focus session; Finish → type an answer to the check question.
import { useEffect, useRef, useState } from "react";
import type { Db, ID, Topic } from "../../shared/types";
import * as T from "../../logic/topics";
import type { Apply } from "../state/useDb";
import { Panel, InlineInput, isTyping } from "../ui/bits";

interface Props {
  db: Db;
  apply: Apply;
  keysEnabled: boolean;
  answerFor: ID | null; // open the answer box for this topic
  setAnswerFor: (id: ID | null) => void;
  onStart: (t: Topic) => void;
  toast: (text: string, undo?: boolean) => void;
}

const MARK: Record<Topic["status"], string> = { queued: "[ ]", in_progress: "[>]", done: "[x]" };

export function Learn({ db, apply, keysEnabled, answerFor, setAnswerFor, onStart, toast }: Props) {
  const topics = T.orderedTopics(db.topics);
  const [selId, setSelId] = useState<ID | null>(topics[0]?.id ?? null);
  const [edit, setEdit] = useState<{ id: ID; field: "title" | "check" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<ID | null>(null);
  const [dropOn, setDropOn] = useState<ID | null>(null);

  const pos = topics.findIndex((t) => t.id === selId);
  const sel = pos >= 0 ? topics[pos] : null;
  const answering = answerFor ? db.topics.find((t) => t.id === answerFor) ?? null : null;

  function start(t: Topic) {
    if (t.status === "done") return toast("already done (press r to reopen)");
    onStart(t);
  }

  function remove(t: Topic) {
    apply((d) => T.removeTopic(d, t.id));
    setSelId(topics[pos + 1]?.id ?? topics[pos - 1]?.id ?? null);
    toast(`deleted topic "${t.title}"`, true);
  }

  /** Reorder by moving `id` to where `target` sits in the stored list. */
  function moveTo(id: ID, target: ID) {
    apply((d) => T.moveTopic(d, id, d.topics.findIndex((t) => t.id === target)));
  }

  useEffect(() => {
    if (!keysEnabled || answering) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (e.altKey && (k === "ArrowUp" || k === "ArrowDown") && sel) {
        e.preventDefault();
        const nb = topics[pos + (k === "ArrowUp" ? -1 : 1)];
        if (nb) moveTo(sel.id, nb.id);
      } else if (e.altKey) {
        return;
      } else if (k === "ArrowDown" || k === "j") {
        e.preventDefault();
        setSelId(topics[Math.min(topics.length - 1, pos + 1)]?.id ?? null);
      } else if (k === "ArrowUp" || k === "k") {
        e.preventDefault();
        setSelId(topics[Math.max(0, pos - 1)]?.id ?? null);
      } else if (k === "n") {
        e.preventDefault();
        setAdding(true);
      } else if (!sel) {
        return;
      } else if (k === "Enter") {
        e.preventDefault();
        setEdit({ id: sel.id, field: "title" });
      } else if (k === "e") {
        e.preventDefault();
        setEdit({ id: sel.id, field: "check" });
      } else if (k === " " || k === "s") {
        e.preventDefault();
        start(sel);
      } else if (k === "f" && sel.status !== "done") {
        e.preventDefault();
        setAnswerFor(sel.id);
      } else if (k === "r" && sel.status === "done") {
        apply((d) => T.reopenTopic(d, sel.id));
      } else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        remove(sel);
      } else if (k === "Escape") {
        setSelId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const count = (s: Topic["status"]) => db.topics.filter((t) => t.status === s).length;

  return (
    <div className="learn">
      <Panel title={`LEARN · ${count("in_progress")} in progress · ${count("queued")} queued · ${count("done")} done`}>
        <ul className="list">
          {topics.length === 0 && !adding && (
            <li className="empty">nothing queued. press n to add a topic and the question that proves you learned it.</li>
          )}
          {topics.map((t) => {
            const isSel = t.id === selId && !edit;
            return (
              <li
                key={t.id}
                className={`topic ${isSel ? "sel" : ""} ${t.status === "done" ? "done" : ""} ${drag === t.id ? "dragging" : ""} ${dropOn === t.id && drag !== t.id ? "drop-before" : ""}`}
                onClick={() => setSelId(t.id)}
                draggable={!edit}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDrag(t.id); }}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setDropOn(t.id); } }}
                onDrop={(e) => { e.preventDefault(); if (drag && drag !== t.id) moveTo(drag, t.id); setDrag(null); setDropOn(null); }}
                onDragEnd={() => { setDrag(null); setDropOn(null); }}
              >
                <div className="topic-main">
                  <span className="mark">{MARK[t.status]}</span>
                  <span className="txt" onDoubleClick={() => setEdit({ id: t.id, field: "title" })}>
                    {edit?.id === t.id && edit.field === "title" ? (
                      <InlineInput initial={t.title} onCancel={() => setEdit(null)}
                        onCommit={(x) => { setEdit(null); if (x) apply((d) => T.editTopic(d, t.id, { title: x })); }} />
                    ) : t.title}
                  </span>
                  <span className="meta">{t.focusMin ? `${t.focusMin}m` : ""}</span>
                  <span className="topic-actions">
                    {isSel && t.status !== "done" && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); start(t); }}>[▶ start]</button>
                        <button onClick={(e) => { e.stopPropagation(); setAnswerFor(t.id); }}>[✓ finish]</button>
                      </>
                    )}
                    {isSel && t.status === "done" && (
                      <button onClick={(e) => { e.stopPropagation(); apply((d) => T.reopenTopic(d, t.id)); }}>[reopen]</button>
                    )}
                  </span>
                </div>
                <div className="topic-sub" onDoubleClick={() => setEdit({ id: t.id, field: "check" })}>
                  <span>?</span>
                  {edit?.id === t.id && edit.field === "check" ? (
                    <InlineInput initial={t.check} onCancel={() => setEdit(null)}
                      onCommit={(x) => { setEdit(null); if (x) apply((d) => T.editTopic(d, t.id, { check: x })); }} />
                  ) : <span>{t.check}</span>}
                </div>
                {t.status === "done" && t.answer && (
                  <div className="topic-sub"><span>→</span><span className="answer">{t.answer}</span></div>
                )}
              </li>
            );
          })}
        </ul>
        {adding ? (
          <AddTopic
            onAdd={(title, check) => apply((d) => T.addTopic(d, title, check))}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button className="add" onClick={() => setAdding(true)}>+ add topic <span className="faint">(n)</span></button>
        )}
        <div className="faint small">
          space start · f finish · enter edit title · e edit question · alt+↑↓ or drag to reorder · del remove
        </div>
      </Panel>

      {answering && (
        <AnswerBox
          topic={answering}
          onCancel={() => setAnswerFor(null)}
          onSave={(answer) => {
            apply((d) => T.finishTopic(d, answering.id, answer));
            setAnswerFor(null);
            setSelId(answering.id);
            toast(`learned: ${answering.title}`);
          }}
        />
      )}
    </div>
  );
}

/** Two steps: the title, then the check question. */
function AddTopic({ onAdd, onClose }: { onAdd: (title: string, check: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <div className="add">
      <span>[ ]</span>
      {title === null ? (
        <InlineInput key="title" initial="" keepOpen placeholder="topic to learn, then Enter"
          onCommit={(x) => setTitle(x)} onCancel={onClose} />
      ) : (
        <>
          <span className="dim">{title} ?</span>
          <InlineInput key="check" initial="" keepOpen placeholder="check question: how will you prove you learned it?"
            onCommit={(x) => { onAdd(title, x); setTitle(null); }} onCancel={() => setTitle(null)} />
        </>
      )}
    </div>
  );
}

function AnswerBox({ topic, onSave, onCancel }: { topic: Topic; onSave: (a: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(topic.answer ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="overlay" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
        <Panel title={`CHECK · ${topic.title}`}>
          <div className="check-q">{topic.check}</div>
          <textarea
            ref={ref}
            className="answer-input"
            value={value}
            rows={5}
            spellCheck={false}
            placeholder="answer in your own words…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") onCancel();
              else if (e.key === "Enter" && !e.shiftKey && value.trim()) { e.preventDefault(); onSave(value.trim()); }
            }}
          />
          <div className="faint small">Enter to save and mark done · Shift+Enter new line · Esc cancel</div>
        </Panel>
      </div>
    </div>
  );
}
