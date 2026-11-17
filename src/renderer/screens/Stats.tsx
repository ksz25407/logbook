// STATS screen: completion, streaks, satisfaction sparkline, year heatmap,
// focus bars, recurring slips and a weekly summary. Clicking a day jumps to it.
import { useMemo, useState } from "react";
import type { Db, DateKey } from "../../shared/types";
import { addDays, formatLong, fromKey } from "../../shared/dates";
import * as S from "../../logic/stats";
import { recurringSlips } from "../../logic/slips";
import { Panel, Bar } from "../ui/bits";

interface Props {
  db: Db;
  today: DateKey;
  viewing: DateKey;
  onJump: (key: DateKey) => void;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW2 = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const short = (k: DateKey) => formatLong(k).slice(0, 10); // "TUE 17 NOV"
const pct = (r: number | null) => (r == null ? " --" : `${Math.round(r * 100)}%`.padStart(4));
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`);

export function Stats({ db, today, viewing, onJump }: Props) {
  const [hover, setHover] = useState<DateKey | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const s = useMemo(() => {
    const d7 = S.lastDays(today, 7);
    const d14 = S.lastDays(today, 14);
    return {
      today: S.completion(db, [today]),
      c7: S.completion(db, d7),
      c30: S.completion(db, S.lastDays(today, 30)),
      streak: S.streaks(db, today),
      avg7: S.avgRate(db, d7),
      spark: d14.map((k) => ({ key: k, rate: db.days[k]?.rate ?? null })),
      heat: S.heatmap(db, today),
      focus: d14.map((k) => S.dayStat(db, k)),
      slips: recurringSlips(db, today).slice(0, 8),
    };
  }, [db, today]);

  const week = useMemo(() => S.weekSummary(db, addDays(S.weekStart(today), 7 * weekOffset)), [db, today, weekOffset]);

  // Props for anything that represents one day.
  const day = (key: DateKey) => ({
    onClick: () => onJump(key),
    onMouseEnter: () => setHover(key),
    onMouseLeave: () => setHover(null),
  });

  return (
    <div className="stats">
      <InfoLine db={db} hover={hover} />

      <div className="stats-row three">
        <Panel title="COMPLETION">
          {([["TODAY", s.today], ["7 DAYS", s.c7], ["30 DAYS", s.c30]] as const).map(([label, c]) => (
            <div key={label} className="stat-line">
              <span className="dim lbl">{label}</span>
              <Bar frac={c.ratio ?? 0} width={12} />
              <span>{pct(c.ratio)}</span>
              <span className="faint">{c.total ? `${c.done}/${c.total}` : ""}</span>
            </div>
          ))}
        </Panel>

        <Panel title="STREAK">
          <div className="streak">
            <div><div className="big num">{s.streak.current}</div><div className="dim">current</div></div>
            <div><div className="big num dim">{s.streak.best}</div><div className="dim">best</div></div>
          </div>
          <div className="faint small">a day counts when at least one task is done</div>
        </Panel>

        <Panel title="SATISFACTION">
          <div className="sat">
            <span className="big num">{s.avg7 == null ? "-.-" : s.avg7.toFixed(1)}</span>
            <span className="dim">avg / 5 · 7 days</span>
          </div>
          <div className="spark blocks">
            {s.spark.map(({ key, rate }) => (
              <button key={key} className={`${key === viewing ? "inv" : ""} ${rate == null ? "faint" : ""}`} {...day(key)}>
                {S.sparkChar(rate)}
              </button>
            ))}
          </div>
          <div className="faint small">14 days → today</div>
        </Panel>
      </div>

      <Panel title="YEAR" className="year">
        <Heatmap grid={s.heat} viewing={viewing} day={day} />
      </Panel>

      <div className="stats-row three">
        <Panel title="FOCUS · 14 DAYS">
          <FocusBars stats={s.focus} viewing={viewing} day={day} />
        </Panel>

        <Panel title="RECURRING SLIPS">
          {s.slips.length === 0 ? (
            <div className="faint">no slip has repeated yet.</div>
          ) : (
            <ul className="list">
              {s.slips.map((g) => (
                <li key={g.label} className="slip-row" {...day(g.days[g.days.length - 1])}
                  title={`last 14 days: ${g.recent} · 14 days before: ${g.previous}\nclick to jump to the latest`}>
                  <span className="dim">{String(g.count).padStart(2)}×</span>
                  <span className="txt">{g.label}</span>
                  <span className="trend">{g.trend}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="faint small">↑ more often lately · ↓ less often</div>
        </Panel>

        <Panel title="WEEK">
          <div className="week-head">
            <button className="dim" onClick={() => setWeekOffset((w) => w - 1)} title="Previous week">◄</button>
            <span>{short(week.start)} – {short(week.end)}</span>
            <button className="dim" disabled={weekOffset >= 0} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} title="Next week">►</button>
          </div>
          <WeekLine label="best" stat={week.best} day={day} />
          <WeekLine label="worst" stat={week.worst} day={day} />
          <div className="stat-line"><span className="dim lbl">tasks</span><span>{week.done}/{week.total} {pct(week.total ? week.done / week.total : null)}</span></div>
          <div className="stat-line"><span className="dim lbl">log</span><span>+{week.wins} −{week.slips}</span></div>
          <div className="stat-line"><span className="dim lbl">focus</span><span>{mins(week.focusMin)}</span></div>
          <div className="stat-line"><span className="dim lbl">learned</span>
            <span className={week.topics.length ? "" : "faint"}>{week.topics.length ? week.topics.join(", ") : "nothing yet"}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

type DayProps = (key: DateKey) => { onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void };

function InfoLine({ db, hover }: { db: Db; hover: DateKey | null }) {
  if (!hover) return <div className="info-line faint">hover a day for details · click to open it</div>;
  const d = S.dayStat(db, hover);
  const label = db.days[hover]?.label;
  return (
    <div className="info-line">
      {formatLong(hover)}
      <span className="dim">
        {"  ·  "}{d.total ? `${d.done}/${d.total} tasks` : "no tasks"}
        {"  ·  "}{d.rate ? `rated ${d.rate}/5` : "unrated"}
        {"  ·  "}+{d.wins} −{d.slips}
        {d.focusMin ? `  ·  ${mins(d.focusMin)} focus` : ""}
        {label ? `  ·  ${label}` : ""}
      </span>
    </div>
  );
}

function Heatmap({ grid, viewing, day }: { grid: ReturnType<typeof S.heatmap>; viewing: DateKey; day: DayProps }) {
  // A month label sits above the first week column that contains the 1st of that month.
  const months = grid.map((week) => {
    const first = week.find((c) => c && fromKey(c.key).getDate() === 1);
    return first ? MON[fromKey(first.key).getMonth()] : "";
  });
  // One grid: row 1 = month labels, column 1 = weekday labels, then 7 rows x N weeks.
  // Each cell is two block characters wide so it reads as a square.
  return (
    <div>
      <div className="heat">
        {months.map((m, w) => m && (
          <span key={`m${w}`} className="heat-label" style={{ gridColumn: `${w + 2} / span 4`, gridRow: 1 }}>{m}</span>
        ))}
        {[1, 3, 5].map((d) => ( // MO, WE, FR; Monday is grid row 2
          <span key={`d${d}`} className="heat-label" style={{ gridColumn: 1, gridRow: d + 1 }}>{DOW2[d]}</span>
        ))}
        {grid.flatMap((week, w) =>
          week.map((c, d) =>
            c ? (
              <button
                key={c.key}
                style={{ gridColumn: w + 2, gridRow: d + 2 }}
                className={`cell blocks ${c.key === viewing ? "inv" : ""} ${c.level === 0 ? "faint" : ""}`}
                {...day(c.key)}
              >
                {S.HEAT[c.level].repeat(2)}
              </button>
            ) : null,
          ),
        )}
      </div>
      <div className="heat-legend dim">
        less <span className="blocks"><span className="faint">··</span> ░░ ▒▒ ▓▓ ██</span> more
        <span className="faint">   ░ nothing done · ▒ under half · ▓ half or more · █ all done</span>
      </div>
    </div>
  );
}

function FocusBars({ stats, viewing, day }: { stats: S.DayStat[]; viewing: DateKey; day: DayProps }) {
  const max = Math.max(60, ...stats.map((s) => s.focusMin));
  const total = stats.reduce((a, s) => a + s.focusMin, 0);
  return (
    <>
      <ul className="list">
        {stats.map((s) => (
          <li key={s.key} className={`bar-row ${s.key === viewing ? "inv" : ""}`} {...day(s.key)}>
            <span className={s.key === viewing ? "" : "dim"}>{DOW2[fromKey(s.key).getDay()]} {s.key.slice(8)}</span>
            <Bar frac={s.focusMin / max} width={16} />
            <span>{s.focusMin ? mins(s.focusMin) : ""}</span>
          </li>
        ))}
      </ul>
      <div className="faint small">{total ? `${mins(total)} in 14 days` : "no focus sessions yet (FOCUS arrives in phase 3)"}</div>
    </>
  );
}

function WeekLine({ label, stat, day }: { label: string; stat: S.DayStat | null; day: DayProps }) {
  if (!stat) return <div className="stat-line"><span className="dim lbl">{label}</span><span className="faint">--</span></div>;
  return (
    <div className="stat-line clickable" {...day(stat.key)}>
      <span className="dim lbl">{label}</span>
      <span>{short(stat.key)}</span>
      <span className="blocks">{stat.rate ? "■".repeat(stat.rate) + "□".repeat(5 - stat.rate) : "·····"}</span>
      <span className="dim">{stat.total ? pct(stat.done / stat.total) : ""}</span>
    </div>
  );
}
