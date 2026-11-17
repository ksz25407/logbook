// The bridge the preload script exposes to the renderer as window.logbook.
import type { Db } from "./types";

export interface LoadResult {
  db: Db;
  file: string;
  warning?: string;
}

export interface LogbookApi {
  load(): Promise<LoadResult>;
  save(db: Db): Promise<void>;
  /** Blocking save, used only when the window is closing. */
  saveSync(db: Db): void;
  /** Windows notification; clicking it brings the window back. */
  notify(title: string, body: string): void;
  /** File picker; null if cancelled. */
  openFile(): Promise<{ name: string; text: string } | null>;
  /** Save dialog; returns the chosen path, or null if cancelled. */
  saveFile(defaultName: string, content: string): Promise<string | null>;
}

declare global {
  interface Window {
    logbook: LogbookApi;
  }
}
