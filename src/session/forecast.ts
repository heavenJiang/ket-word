import type { Library } from "../lib/data";
import { Rating, retrievability } from "../srs/srs";
import { recordGrade, type LogEntry, type Progress } from "../store/progress";
import type { Topic } from "../types";
import { NEW_WORD_SECS, secsPerReview } from "./goal";
import { todayPlan } from "./today";

const DAY = 86_400_000;
/** Nobody plans further ahead than this. */
const HORIZON_DAYS = 730;

export interface Forecast {
  /** Days from today until every word has been met, or null if not within two years. */
  finishDays: number | null;
  /** Minutes a day, on average and on the busiest tenth of days, while there is work to do. */
  avgMin: number;
  busyMin: number;
  /** Days on which reviews alone filled the time and new words had to wait. */
  catchUpDays: number;
}

/** A small deterministic random source, so the same plan always gives the same forecast. */
function rand(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/**
 * Play the plan forward one day at a time from the child's real progress, using the app's own
 * planner and memory model: each review is recalled with the odds the model predicts, each new
 * word is recalled nine times in ten. Words the quick check would skip are not counted, so the
 * forecast errs on the long side. Yields to the page every few days so it never freezes it.
 */
export async function forecast(start: Progress, library: Library, topics: Topic[], now: number): Promise<Forecast> {
  const per = secsPerReview(start);
  // a fixed answer log with the child's own speed, so the planner keeps using it without the log growing
  const log: LogEntry[] = Array.from({ length: 20 }, () => [0, "", 0, Rating.Good, (per - 4) * 1000, 0]);
  let p: Progress = { ...start, log };
  const r = rand(7);
  const mins: number[] = [];
  let catchUpDays = 0;
  for (let d = 0; d < HORIZON_DAYS; d++) {
    if (library.all.every((w) => p.words[w.id])) {
      return summary(d, mins, catchUpDays);
    }
    let t = new Date(now + d * DAY).setHours(18, 0, 0, 0);
    const plan = todayPlan(library, topics, p, t);
    for (const task of plan.reviews) {
      const c = p.words[task.wordId]?.skills[task.skill];
      const ok = r() < (c ? retrievability(c, t, p.settings.retention) : 0.85);
      p = { ...recordGrade(p, task.wordId, task.skill, ok ? (r() < 0.2 ? Rating.Hard : Rating.Good) : Rating.Again, t), log };
      t += per * 1000;
    }
    for (const id of plan.newWords) {
      p = { ...recordGrade(p, id, "meaning", r() < 0.9 ? Rating.Good : Rating.Again, t), log };
      t += NEW_WORD_SECS * 1000;
    }
    if (plan.backlog > 0 && plan.newWords.length === 0) catchUpDays++;
    if (plan.reviews.length + plan.newWords.length) mins.push((plan.reviews.length * per + plan.newWords.length * NEW_WORD_SECS) / 60);
    if (d % 5 === 4) await new Promise((ok) => setTimeout(ok));
  }
  return summary(null, mins, catchUpDays);
}

function summary(finishDays: number | null, mins: number[], catchUpDays: number): Forecast {
  const sorted = [...mins].sort((a, b) => a - b);
  const avg = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
  return { finishDays, avgMin: Math.round(avg), busyMin: Math.round(sorted[Math.floor(sorted.length * 0.9)] ?? 0), catchUpDays };
}
