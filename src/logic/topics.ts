// The LEARN queue: topics with a "check" question, moving queued → in progress → done.
import type { Db, ID, Topic } from "../shared/types";
import { newId } from "../shared/db";

const map = (db: Db, id: ID, fn: (t: Topic) => Topic): Db => ({
  ...db,
  topics: db.topics.map((t) => (t.id === id ? fn(t) : t)),
});

export function addTopic(db: Db, title: string, check: string, now = new Date()): Db {
  const topic: Topic = { id: newId(), title, check, status: "queued", focusMin: 0, createdAt: now.toISOString() };
  return { ...db, topics: [...db.topics, topic] };
}

export const editTopic = (db: Db, id: ID, patch: Partial<Pick<Topic, "title" | "check">>): Db =>
  map(db, id, (t) => ({ ...t, ...patch }));

export const removeTopic = (db: Db, id: ID): Db => ({ ...db, topics: db.topics.filter((t) => t.id !== id) });

export const startTopic = (db: Db, id: ID): Db =>
  map(db, id, (t) => (t.status === "queued" ? { ...t, status: "in_progress" } : t));

export const finishTopic = (db: Db, id: ID, answer: string, now = new Date()): Db =>
  map(db, id, (t) => ({ ...t, status: "done", answer, finishedAt: now.toISOString() }));

/** Back to "in progress" (keeps the old answer so it can be edited). */
export const reopenTopic = (db: Db, id: ID): Db =>
  map(db, id, (t) => ({ ...t, status: "in_progress", finishedAt: undefined }));

/** Moves a topic within the full list (the queue order). */
export function moveTopic(db: Db, id: ID, to: number): Db {
  const from = db.topics.findIndex((t) => t.id === id);
  if (from < 0) return db;
  const topics = db.topics.slice();
  const [t] = topics.splice(from, 1);
  topics.splice(Math.max(0, Math.min(to, topics.length)), 0, t);
  return { ...db, topics };
}

const RANK: Record<Topic["status"], number> = { in_progress: 0, queued: 1, done: 2 };

/** Display order: in progress, then the queue, then done (each keeping list order). */
export function orderedTopics(topics: Topic[]): Topic[] {
  return topics
    .map((t, i) => ({ t, i }))
    .sort((a, b) => RANK[a.t.status] - RANK[b.t.status] || a.i - b.i)
    .map((x) => x.t);
}
