// Import (old web-version JSON, notepad text) and export (Markdown).
// Imports merge into the existing data and never delete anything.
import type { Db, DateKey, Rating, Day } from "../shared/types";
import { newId } from "../shared/db";
import { isValidKey, formatLong } from "../shared/dates";
import { getDay } from "./dayOps";
import { parseNotepad } from "./importNotepad";

export interface ImportDay {
  label?: string;
  todos: { text: string; done: boolean }[];
  log: { kind: "+" | "-"; text: string }[];
  rate: Rating | null;
  ref: string;
}

export interface Parsed {
  format: "old-json" | "logbook-json" | "notepad";
  days: Record<DateKey, ImportDay>;
  start?: DateKey;
  skipped: number;
}

// ---- old web version: {start, days: {"yyyy-mm-dd": {todos:[{t,d}], log:[{k,t}], rate, ref, note}}} ----

export function parseOldJson(raw: unknown): Parsed {
  const r = raw as { start?: string; days?: Record<string, unknown> };
  if (!r || typeof r !== "object" || !r.days || typeof r.days !== "object") throw new Error("not an old LOGBOOK export (no days)");
  const days: Record<DateKey, ImportDay> = {};
  let skipped = 0;
  for (const [key, v] of Object.entries(r.days)) {
    const d = v as { todos?: { t?: unknown; d?: unknown }[]; log?: { k?: unknown; t?: unknown }[]; rate?: unknown; ref?: unknown; note?: unknown };
    if (!isValidKey(key) || !d || typeof d !== "object") { skipped++; continue; }
    const rate = Number(d.rate);
    days[key] = {
      label: typeof d.note === "string" && d.note.trim() ? d.note.trim() : undefined,
      todos: (Array.isArray(d.todos) ? d.todos : [])
        .filter((t) => typeof t?.t === "string" && t.t.trim())
        .map((t) => ({ text: String(t.t).trim(), done: !!t.d })),
      log: (Array.isArray(d.log) ? d.log : [])
        .filter((l) => (l?.k === "+" || l?.k === "-") && typeof l.t === "string" && l.t.trim())
        .map((l) => ({ kind: l.k as "+" | "-", text: String(l.t).trim() })),
      rate: Number.isInteger(rate) && rate >= 1 && rate <= 5 ? (rate as Rating) : null,
      ref: typeof d.ref === "string" ? d.ref.trim() : "",
    };
  }
  return { format: "old-json", days, start: typeof r.start === "string" && isValidKey(r.start) ? r.start : undefined, skipped };
}

/** Our own export ({version: 1, ...}) also imports, as days only. */
function parseOwnJson(raw: Db): Parsed {
  const days: Record<DateKey, ImportDay> = {};
  for (const [key, d] of Object.entries(raw.days ?? {})) {
    days[key] = {
      label: d.label,
      todos: (d.todos ?? []).map((t) => ({ text: t.text, done: t.done })),
      log: (d.log ?? []).map((l) => ({ kind: l.kind, text: l.text })),
      rate: d.rate ?? null,
      ref: d.ref ?? "",
    };
  }
  return { format: "logbook-json", days, start: raw.start, skipped: 0 };
}

/** Decides the format from the contents. */
export function parseImport(text: string): Parsed {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("{")) {
    const raw = JSON.parse(trimmed);
    return raw?.version === 1 && raw.settings ? parseOwnJson(raw as Db) : parseOldJson(raw);
  }
  const n = parseNotepad(trimmed);
  const days: Record<DateKey, ImportDay> = {};
  for (const [k, d] of Object.entries(n.days)) {
    days[k] = { label: d.label, todos: d.todos.map((t) => ({ text: t, done: false })), log: d.log, rate: null, ref: d.ref };
  }
  return { format: "notepad", days, skipped: n.skipped };
}

export interface MergeReport {
  days: number;
  todos: number;
  log: number;
}

/**
 * Adds imported days to the db. Tasks and log lines already present (same text)
 * are skipped, so importing the same file twice changes nothing. Rating,
 * reflection and label are only filled in where they're empty.
 */
export function mergeImport(db: Db, p: Parsed): { db: Db; report: MergeReport } {
  const report: MergeReport = { days: 0, todos: 0, log: 0 };
  const days = { ...db.days };
  const now = new Date().toISOString();
  for (const [key, imp] of Object.entries(p.days)) {
    const cur: Day = getDay(db, key);
    const haveTodo = new Set(cur.todos.map((t) => t.text.toLowerCase()));
    const haveLog = new Set(cur.log.map((l) => l.kind + l.text.toLowerCase()));
    const todos = imp.todos.filter((t) => !haveTodo.has(t.text.toLowerCase()));
    const log = imp.log.filter((l) => !haveLog.has(l.kind + l.text.toLowerCase()));
    const next: Day = {
      ...cur,
      label: cur.label || imp.label,
      rate: cur.rate ?? imp.rate,
      ref: cur.ref || imp.ref,
      todos: [...cur.todos, ...todos.map((t) => ({ id: newId(), text: t.text, done: t.done, focusMin: 0 }))],
      log: [...cur.log, ...log.map((l) => ({ id: newId(), kind: l.kind, text: l.text, at: now }))],
    };
    const changed = todos.length || log.length || next.label !== cur.label || next.rate !== cur.rate || next.ref !== cur.ref;
    if (!changed) continue;
    days[key] = next;
    report.days++;
    report.todos += todos.length;
    report.log += log.length;
  }
  const start = p.start && p.start < db.start ? p.start : db.start;
  const earliest = Object.keys(days).sort()[0];
  return { db: { ...db, days, start: earliest && earliest < start ? earliest : start }, report };
}

// ---- Markdown export ----

export function exportMarkdown(db: Db): string {
  const out: string[] = ["# LOGBOOK", ""];
  for (const key of Object.keys(db.days).sort()) {
    const d = db.days[key];
    const focus = d.focus.reduce((s, f) => s + f.actualMin, 0);
    if (!d.todos.length && !d.log.length && !d.rate && !d.ref && !d.label && !focus) continue;
    out.push(`## ${key} · ${formatLong(key).slice(0, 3)}${d.label ? ` · ${d.label}` : ""}`, "");
    if (d.rate) out.push(`Rating: ${"■".repeat(d.rate)}${"□".repeat(5 - d.rate)} ${d.rate}/5`);
    if (focus) out.push(`Focus: ${focus} min`);
    if (d.rate || focus) out.push("");
    if (d.todos.length) {
      for (const t of d.todos) out.push(`- [${t.done ? "x" : " "}] ${t.text}${t.focusMin ? ` (${t.focusMin} min)` : ""}`);
      out.push("");
    }
    if (d.log.length) {
      for (const l of d.log) out.push(`${l.kind === "+" ? "+" : "−"} ${l.text}  `);
      out.push("");
    }
    if (d.ref) out.push(`> ${d.ref}`, "");
  }
  const learned = db.topics.filter((t) => t.status === "done");
  if (learned.length) {
    out.push("## Learned", "");
    for (const t of learned) {
      out.push(`- **${t.title}**${t.finishedAt ? ` (${t.finishedAt.slice(0, 10)})` : ""}`);
      out.push(`  - Q: ${t.check}`);
      if (t.answer) out.push(`  - A: ${t.answer.replace(/\n/g, " ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
