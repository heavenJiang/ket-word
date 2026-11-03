import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/audio";
import { dayKey, streak, type DayLog } from "../store/progress";
import type { Word } from "../types";
import { Max } from "../ui/Max";
import { Picture } from "../ui/Picture";
import { petStage } from "./Home";

/** Cards shown flying in; the rest are counted. */
const SHOW_CARDS = 10;
const CARD_MS = 320;

/**
 * The end of the day's session, played as a little ceremony, because this — not the moment the app
 * opens — is what the child has earned: today's cards fly into the album one by one, today's square
 * on the week gets its stamp, and Max grows up on the spot when the stars cross his next stage.
 * A tap skips to the end; with reduced motion everything is simply there.
 */
export function Finish(props: {
  /** Words met for the first time this session. */
  met: Word[];
  /** Words practised again this session, shown when there were no new ones. */
  reviewed: Word[];
  answered: number;
  pct: number;
  /** Stars won this session, finishing bonus included. */
  stars: number;
  starsBefore: number;
  starsAfter: number;
  days: Record<string, DayLog>;
  sound: boolean;
  onExit: () => void;
}) {
  const { met, reviewed, answered, pct, stars, starsBefore, starsAfter, days, sound, onExit } = props;
  const now = Date.now();
  const cards = (met.length ? met : reviewed).slice(0, SHOW_CARDS);
  const more = (met.length ? met : reviewed).length - cards.length;
  const before = petStage(starsBefore);
  const after = petStage(starsAfter);
  const grew = after.pose !== before.pose;
  const run = streak(days, now);

  // phases: 0 cheer · 1 cards · 2 stamp · 3 Max grows (if he does) · 4 done
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState(reduced ? 4 : 0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (reduced) return;
    const at = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
    let t = 700;
    at(t, () => setPhase(1));
    cards.forEach((_, i) => at(t + i * CARD_MS + 250, () => sfx("tap", sound)));
    t += cards.length * CARD_MS + 600;
    at(t, () => {
      setPhase(2);
      sfx("right", sound);
    });
    t += 1100;
    if (grew) {
      at(t, () => {
        setPhase(3);
        sfx("done", sound);
      });
      t += 1600;
    }
    at(t, () => setPhase(4));
    return () => timers.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => {
    if (phase >= 4) return;
    timers.current.forEach(clearTimeout);
    setPhase(4);
  };

  const week = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * 86_400_000;
    return { label: i === 6 ? "今天" : "日一二三四五六"[new Date(t).getDay()], on: !!days[dayKey(t)]?.answered, today: i === 6 };
  });
  const showGrown = grew && phase >= 3;

  return (
    <div className="page center finish" onClick={skip}>
      <div className="confetti" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, background: COLORS[i % COLORS.length] }} />
        ))}
      </div>
      <div className={showGrown ? "finish-max grown" : "finish-max"} key={showGrown ? "grown" : "cheer"}>
        <Max pose={showGrown ? after.pose : "cheer"} size="lg" />
      </div>
      <h2 className="finish-title">{showGrown ? "Max 升级啦！" : pct >= 80 ? "太厉害了！" : pct >= 50 ? "做得很好！" : "坚持就是胜利！"}</h2>
      {showGrown && <p className="finish-sub">现在是{after.name}</p>}
      <div className="finish-stats">
        <div>
          <b>{answered}</b>
          <span>练习</span>
        </div>
        <div>
          <b>{pct}%</b>
          <span>答对</span>
        </div>
        <div>
          <b>
            +<CountUp to={stars} run={!reduced} />
          </b>
          <span>⭐ 星星</span>
        </div>
      </div>

      {cards.length > 0 && phase >= 1 && (
        <div className="card finish-new">
          <b>{met.length ? `今天收集了 ${met.length} 张新卡片` : `今天找回了 ${reviewed.length} 个老朋友`}</b>
          <div className="finish-cards">
            {cards.map((w, i) => (
              <div key={w.id} className="finish-card fly" style={{ animationDelay: `${i * CARD_MS}ms`, ["--tilt" as string]: `${[-4, 3, -2, 4, -3][i % 5]}deg` }}>
                <Picture word={w} size="sm" />
                <span>{w.word}</span>
              </div>
            ))}
            {more > 0 && <div className="finish-card finish-more fly" style={{ animationDelay: `${cards.length * CARD_MS}ms` }}>+{more}</div>}
          </div>
        </div>
      )}

      {phase >= 2 && (
        <div className="card finish-week">
          <div className="week-stamps">
            {week.map((d, i) => (
              <span key={i} className={`stamp ${d.on ? "stamp-on" : ""} ${d.today ? "stamp-today" : ""}`}>
                <i>{d.on ? "✓" : ""}</i>
                {d.label}
              </span>
            ))}
          </div>
          <span className="muted small">{run > 1 ? `🔥 已经连续学了 ${run} 天` : "今天的章盖好啦，明天继续！"}</span>
        </div>
      )}

      {phase >= 4 ? (
        <>
          {!grew && after.next && <p className="muted">再得 {after.next - starsAfter} 颗 ⭐，Max 就能升级</p>}
          <button className="btn btn-primary btn-huge finish-go" onClick={onExit}>
            太好了！
          </button>
        </>
      ) : (
        <p className="muted small finish-skip">点一下屏幕跳过</p>
      )}
    </div>
  );
}

/** A number counting up to its value over about a second. */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const [n, setN] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) return setN(to);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1000);
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run]);
  return <>{n}</>;
}

const COLORS = ["#ff8a3d", "#4cb8ff", "#2fbf71", "#ffc531", "#ff5a8a"];
