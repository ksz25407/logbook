// Loading and saving logbook.json in the userData folder.
//  - Saves are atomic: write logbook.json.tmp, then rename over logbook.json.
//  - The first save of each day first copies the current file to
//    backups/logbook-yyyy-mm-dd.json; only the newest 7 backups are kept.
//  - A corrupt file is set aside (never overwritten) and the newest backup is used.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../shared/types";
import type { LoadResult } from "../shared/api";
import { emptyDb, normalizeDb } from "../shared/db";
import { todayKey } from "../shared/dates";

const KEEP_BACKUPS = 7;

export class Store {
  readonly file: string;
  readonly backupDir: string;

  constructor(dir: string) {
    this.file = path.join(dir, "logbook.json");
    this.backupDir = path.join(dir, "backups");
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  load(): LoadResult {
    if (!fs.existsSync(this.file)) return { db: emptyDb(), file: this.file };
    try {
      return { db: normalizeDb(JSON.parse(fs.readFileSync(this.file, "utf8"))), file: this.file };
    } catch (err) {
      const aside = this.file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
      fs.renameSync(this.file, aside);
      const backup = this.backups().at(-1);
      const db = backup
        ? normalizeDb(JSON.parse(fs.readFileSync(path.join(this.backupDir, backup), "utf8")))
        : emptyDb();
      const warning = `logbook.json was unreadable; moved to ${path.basename(aside)}` +
        (backup ? `, restored ${backup}` : ", started empty");
      console.error(warning, err);
      return { db, file: this.file, warning };
    }
  }

  save(db: Db): void {
    this.dailyBackup();
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
    renameWithRetry(tmp, this.file);
  }

  private backups(): string[] {
    return fs.readdirSync(this.backupDir).filter((f) => /^logbook-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  }

  private dailyBackup(): void {
    if (!fs.existsSync(this.file)) return;
    const name = `logbook-${todayKey()}.json`;
    const target = path.join(this.backupDir, name);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(this.file, target);
    for (const old of this.backups().slice(0, -KEEP_BACKUPS)) fs.rmSync(path.join(this.backupDir, old));
  }
}

/** On Windows, antivirus or indexers can briefly lock the file. */
function renameWithRetry(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= 5) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1)); // sync sleep
    }
  }
}
