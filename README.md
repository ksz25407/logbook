# LOGBOOK

A daily planner, habit and learning tracker for Windows that looks like a retro terminal.
Everything stays on your computer: no accounts, no cloud, works offline.

- **TODAY**: tasks, a log of wins (+) and slips (−), a 1–5 satisfaction rating, a one-line reflection and an optional label for the day ("Sam's birthday"). Unfinished tasks from yesterday come with a "carry over?" prompt.
- **FOCUS**: a 25/45/60-minute session timer with a big countdown. When it ends, the minutes are logged to the task and Windows shows a notification.
- **LEARN**: a queue of topics, each with a "check" question. Starting a topic opens a focus session; finishing it asks you to answer the question, and the answer is saved.
- **STATS**: completion % (today, 7 and 30 days), current and best streak, 7-day average rating with a 14-day sparkline, a year heatmap, focus minutes per day, recurring slips with a trend arrow, and a weekly summary. Click any day to open it.
- **WEEK**: seven columns, Monday first. Drag tasks between days to reschedule them.

It lives in the system tray. **Ctrl+Alt+L** shows or hides it from anywhere, and at 22:00 it can remind you to rate your day.

## Install

Download or build `LOGBOOK-Setup-<version>.exe` and run it. It installs for your user only (no admin rights needed) and adds desktop and Start menu shortcuts.

The installer isn't code-signed, so Windows SmartScreen may warn the first time. Choose "More info → Run anyway".

## Using it

Mouse and keyboard both work everywhere. Press **?** for the full list.

### Keys

| Key | Does |
|---|---|
| `/` or `Ctrl+K` | open the command bar |
| `↑ ↓` or `J K` | move between items |
| `← →` | previous / next day |
| `Space` or click `[ ]` | check off a task |
| `Enter` or double-click | edit inline |
| `Delete` | remove (`Ctrl+Z` undoes it) |
| `Alt+↑ ↓` or drag | reorder |
| `n` | new task (or topic, in LEARN) |
| `f` | focus on the selected task |
| `1`–`5` | rate the day |
| `Ctrl+1`–`5` | switch screen |
| `Esc` | leave a field / clear the selection |

### Commands

Type these in the command bar. `↑ ↓` scroll through history and `Tab` autocompletes.

| Command | Does |
|---|---|
| `t <task>` | add a task |
| `+ <win>` / `- <slip>` | log a win or a slip |
| `rate 1-5` | rate the day |
| `ref <text>` | one-line reflection |
| `label <text>` | label the day (empty clears it) |
| `go +1` / `go -1` / `go today` / `go 2026-11-17` | switch day |
| `focus 45` | set up a focus session |
| `today` / `focus` / `learn` / `stats` / `week` | switch screen |
| `import` | import a file (see below) |
| `export json` / `export md` | save everything as JSON or Markdown |
| `remind 22:00` / `remind on` / `remind off` | evening reminder |
| `help` | list everything |

### How things are counted

- **Completion**: tasks done ÷ tasks planned, over the days that had tasks.
- **Streak**: a day counts when at least one task on it was done. Today doesn't break the streak until it's over.
- **Recurring slips**: slips are grouped by similar wording ("doomscrolled instagram" ≈ "doomscrolling instagram"). ↑ means more often in the last 14 days than in the 14 before, ↓ means less often.
- **Reminder**: fires once a day after the set time, only if the day still has no rating or no reflection.

### Import

`import` detects the format from the file's contents. It only adds what's new: tasks and log lines that already exist are skipped, so importing the same file twice changes nothing. `Ctrl+Z` undoes an import.

**Notepad text:**

```
#5 - 11/19/2026: Sam's birthday
TODO
* read chapter 4
+ finished the essay
note: two days early
- watched too much TV
Reflection: good day,
  slept well
```

- `#N - M/D/YYYY:` starts a day; text after the colon becomes the day's label.
- `* task` or `• task` is a task (imported as not done). `+` is a win, `-` is a slip.
- `note: …` is appended to the log line above it.
- `Reflection:` can continue on the next lines.
- Everything before the first day header is ignored. Lines that can't be read are skipped and counted.

**Old web-version JSON:** `{start, days: {"yyyy-mm-dd": {todos: [{t, d}], log: [{k: "+"|"-", t}], rate, ref, note}}}`, where `note` becomes the day label.

**LOGBOOK's own JSON export** also imports.

## Your data

Everything is in one file: `%APPDATA%\LOGBOOK\logbook.json`.

- Saves are atomic (written to a temporary file, then renamed), so a crash can't leave a half-written file.
- A backup is kept for each of the last 7 days in `%APPDATA%\LOGBOOK\backups\`.
- If the file is ever unreadable, it's set aside (never overwritten) and the newest backup is loaded.

## Development

Needs Node.js 22 or newer.

```
npm install
npm run dev      # run with hot reload (F12 opens DevTools)
npm test         # unit tests (Vitest)
npm run dist     # build the installer into release/
```

Built with Electron, Vite, React and TypeScript, and almost nothing else: the only runtime dependencies are React and React DOM. The fonts (IBM Plex Mono and VT323, SIL Open Font License) are bundled.

```
src/
  shared/     data types, date helpers
  logic/      pure functions with tests: commands, stats, streaks, slips,
              focus, topics, undo, reminder, import/export
  main/       Electron: window, tray, hotkey, notifications, saving
  preload/    the small API the UI is allowed to call
  renderer/   React UI: screens/, ui/, styles/
scripts/      dev runner, icon generator
```
