import { describe, it, expect } from "vitest";
import { emptyDb } from "../../shared/db";
import { addTodo } from "../dayOps";
import { startFocus, togglePause, extendFocus, remainingMs, elapsedMs, finishFocus, clock } from "../focus";
import { addTopic, startTopic, finishTopic, orderedTopics, moveTopic } from "../topics";

const D = "2026-11-17";
const T0 = Date.parse("2026-11-17T10:00:00");
const MIN = 60_000;

function setup() {
  const db = addTodo(emptyDb(D), D, "read chapter 4");
  const todoId = db.days[D].todos[0].id;
  return { db: startFocus(db, { day: D, minutes: 25, label: "study", todoId }, T0), todoId };
}

describe("focus sessions", () => {
  it("counts down and remembers the preset", () => {
    const { db } = setup();
    expect(remainingMs(db.activeFocus!, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(db.activeFocus!, T0 + 40 * MIN)).toBe(0);
    expect(db.settings.lastFocusMin).toBe(25);
  });

  it("does not count paused time", () => {
    let { db } = setup();
    db = togglePause(db, T0 + 5 * MIN); // pause at 5:00
    expect(elapsedMs(db.activeFocus!, T0 + 20 * MIN)).toBe(5 * MIN);
    db = togglePause(db, T0 + 20 * MIN); // resume after 15 min paused
    expect(elapsedMs(db.activeFocus!, T0 + 30 * MIN)).toBe(15 * MIN);
    db = extendFocus(db, 5);
    expect(remainingMs(db.activeFocus!, T0 + 30 * MIN)).toBe(15 * MIN);
  });

  it("logs planned minutes to the day and the task when completed", () => {
    const { db, todoId } = setup();
    const r = finishFocus(db, T0 + 25 * MIN, true);
    expect(r.minutes).toBe(25);
    expect(r.db.activeFocus).toBeUndefined();
    expect(r.db.days[D].focus).toMatchObject([{ actualMin: 25, plannedMin: 25, todoId, completed: true }]);
    expect(r.db.days[D].todos[0].focusMin).toBe(25);
  });

  it("logs whole minutes when stopped early, nothing under a minute", () => {
    const { db } = setup();
    expect(finishFocus(db, T0 + 12.7 * MIN, false).minutes).toBe(12);
    const r = finishFocus(db, T0 + 40_000, false);
    expect(r.minutes).toBe(0);
    expect(r.db.days[D].focus).toEqual([]);
    expect(r.db.activeFocus).toBeUndefined();
  });

  it("credits a topic", () => {
    let db = addTopic(emptyDb(D), "Guitar chords", "Name the notes in a G chord");
    const id = db.topics[0].id;
    db = startFocus(startTopic(db, id), { day: D, minutes: 45, label: "Guitar chords", topicId: id }, T0);
    db = finishFocus(db, T0 + 45 * MIN, true).db;
    expect(db.topics[0]).toMatchObject({ status: "in_progress", focusMin: 45 });
  });

  it("formats the clock", () => {
    expect(clock(25 * MIN)).toBe("25:00");
    expect(clock(61_001)).toBe("01:02");
    expect(clock(0)).toBe("00:00");
    expect(clock(90 * MIN)).toBe("1:30:00");
  });
});

describe("topics", () => {
  it("finishes with an answer and orders in progress → queued → done", () => {
    let db = emptyDb(D);
    for (const t of ["a", "b", "c"]) db = addTopic(db, t, `${t}?`);
    const [a, b, c] = db.topics.map((t) => t.id);
    db = startTopic(db, c);
    db = finishTopic(db, a, "because");
    expect(orderedTopics(db.topics).map((t) => t.title)).toEqual(["c", "b", "a"]);
    expect(db.topics[0]).toMatchObject({ status: "done", answer: "because" });
    db = moveTopic(db, b, 0);
    expect(db.topics.map((t) => t.id)).toEqual([b, a, c]);
  });
});
