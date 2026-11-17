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
}

declare global {
  interface Window {
    logbook: LogbookApi;
  }
}
