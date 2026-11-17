// The whole LOGBOOK database. Stored as one JSON file in the userData folder.

export type DateKey = string; // "2026-11-17" (local time)
export type ID = string;
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Db {
  version: 1;
  start: DateKey;
  days: Record<DateKey, Day>;
  topics: Topic[];
  settings: Settings;
  cmdHistory: string[];
}

export interface Settings {
  reminder: { enabled: boolean; time: string }; // "22:00"
  focusPresets: number[];
  hotkey: string;
}

export interface Day {
  label?: string;
  todos: Todo[];
  log: LogEntry[];
  rate: Rating | null;
  ref: string;
  focus: FocusSession[];
  carryHandled?: boolean;
}

export interface Todo {
  id: ID;
  text: string;
  done: boolean;
  doneAt?: string;
  focusMin: number;
  carriedFrom?: DateKey;
}

export interface LogEntry {
  id: ID;
  kind: "+" | "-";
  text: string;
  at: string;
}

export interface FocusSession {
  id: ID;
  startedAt: string;
  plannedMin: number;
  actualMin: number;
  todoId?: ID;
  topicId?: ID;
  completed: boolean;
}

export interface Topic {
  id: ID;
  title: string;
  check: string;
  status: "queued" | "in_progress" | "done";
  answer?: string;
  focusMin: number;
  createdAt: string;
  finishedAt?: string;
}
