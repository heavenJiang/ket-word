import { useState } from "react";
import { minutesOn } from "../lib/effect";
import { dayKey, streak, type DayLog, type Progress } from "../store/progress";

const DAY = 86_400_000;
const WEEKDAYS = "日一二三四五六";

/** How full a study day was, for the stamp's colour: a few answers, a normal day, a big day. */
const level = (d?: DayLog) => (!d?.answered ? 0 : d.answered < 20 ? 1 : d.answered < 60 ? 2 : 3);

/** The longest run of consecutive study days in the log. */
export function longestStreak(days: Record<string, DayLog>): number {
  const keys = Object.keys(days).filter((k) => days[k].answered).sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const k of keys) {
    const [y, m, d] = k.split("-").map(Number);
    const t = new Date(y, m - 1, d).getTime();
    // a day apart, allowing for the clock change
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/**
 * The study calendar: a month at a time, each day the child studied stamped (darker for a bigger day),
 * today ringed, with the month's study days and the current and longest runs on top. Tapping a day
 * shows what was done that day.
 */
export function Calendar({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const now = Date.now();
  const [month, setMonth] = useState(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [picked, setPicked] = useState<string | null>(dayKey(now));
  const first = new Date(month);
  const y = first.getFullYear();
  const m = first.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const key = (d: number) => dayKey(new Date(y, m, d, 12).getTime());
  const studied = Array.from({ length: daysInMonth }, (_, i) => key(i + 1)).filter((k) => progress.days[k]?.answered).length;
  const today = dayKey(now);
  const thisMonth = new Date(now).getFullYear() === y && new Date(now).getMonth() === m;
  const started = Object.keys(progress.days).sort()[0];
  const canBack = !!started && started < key(1);
  const day = picked ? progress.days[picked] : undefined;
  const shift = (n: number) => setMonth(new Date(y, m + n, 1).getTime());

  return (
    <div className="page calendar">
      <div className="cal-top">
        <button className="btn btn-ghost btn-small" onClick={onBack}>
          ‹ 返回
        </button>
        <h2>📅 打卡日历</h2>
      </div>

      <div className="cal-stats">
        <div>
          <b>{studied}</b>
          <span>本月学习天数</span>
        </div>
        <div>
          <b>🔥 {streak(progress.days, now)}</b>
          <span>现在连续</span>
        </div>
        <div>
          <b>🏆 {Math.max(longestStreak(progress.days), progress.records?.streak ?? 0)}</b>
          <span>最长连续</span>
        </div>
      </div>

      <section className="card">
        <div className="cal-month">
          <button className="icon-btn" onClick={() => shift(-1)} disabled={!canBack} aria-label="上个月">
            ‹
          </button>
          <b>
            {y} 年 {m + 1} 月
          </b>
          <button className="icon-btn" onClick={() => shift(1)} disabled={thisMonth} aria-label="下个月">
            ›
          </button>
        </div>
        <div className="cal-grid">
          {[...WEEKDAYS].map((w) => (
            <span key={w} className="cal-head">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />;
            const k = key(d);
            const lv = level(progress.days[k]);
            const future = k > today;
            return (
              <button
                key={k}
                className={`cal-day lv-${lv} ${k === today ? "cal-today" : ""} ${k === picked ? "cal-picked" : ""}`}
                disabled={future}
                onClick={() => setPicked(k)}
                aria-label={`${m + 1} 月 ${d} 日${lv ? "，学习了" : ""}`}
              >
                <span className="cal-num">{d}</span>
                {lv > 0 && <span className="cal-mark">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted small">
          <span>
            <i className="lv-1" /> 学了一点
          </span>
          <span>
            <i className="lv-2" /> 学了不少
          </span>
          <span>
            <i className="lv-3" /> 学了很多
          </span>
        </div>
      </section>

      {picked && (
        <section className="card cal-detail">
          <b>
            {Number(picked.slice(5, 7))} 月 {Number(picked.slice(8))} 日
          </b>
          {day?.answered ? (
            <p>
              答题 <b>{day.answered}</b> 次，答对 <b>{day.correct}</b> 次
              {day.newWords > 0 && (
                <>
                  ，认识了 <b>{day.newWords}</b> 个新词
                </>
              )}
              ，得到 <b>{day.stars}</b> 颗 ⭐
              {minutesOn(progress, picked) > 0 && <>，学了约 {minutesOn(progress, picked)} 分钟</>}。
            </p>
          ) : (
            <p className="muted">{picked === today ? "今天还没学习，去完成今天的任务吧！" : "这天没有学习。"}</p>
          )}
        </section>
      )}
    </div>
  );
}
