import { Rating } from "../srs/srs";
import { dayKey, type LogEntry, type Progress } from "../store/progress";

const DAY = 86_400_000;
/** The answer card after each question, on top of the time to answer. */
const FEEDBACK_SECS = 4;
/** Meeting a new word and the match game, which leave no graded answer of their own. */
const TEACH_SECS = 30;

/** A share with how many answers it rests on; too few answers and it means little. */
export interface Rate {
  ok: number;
  n: number;
}

export interface Effect {
  /** Reviews of the last 30 days answered right; should sit near the target retention. */
  recall: Rate;
  /** A new word's first review on a later day, answered right: did the first session make it stick? */
  firstReview: Rate;
  /** Words forgotten three times or more, out of the words met. */
  hard: Rate;
  /** Minutes a day over the last 7 days with any practice, estimated from answer times. */
  minutes: number | null;
}

const isRight = (e: LogEntry) => e[3] !== Rating.Again;
const MEANING = 0;

/**
 * How well the plan is working for this child, from their own answers rather than from studies of
 * other children: if a number is off target, the parent centre says what to change.
 */
export function effect(p: Progress, now: number): Effect {
  const log = p.log ?? [];
  const recent = log.filter((e) => e[5] === 0 && e[0] > now - 30 * DAY);
  const recall = { ok: recent.filter(isRight).length, n: recent.length };

  // the first meaning answer on a later day, for new words
  const start = new Map<string, LogEntry>();
  const next = new Map<string, LogEntry>();
  for (const e of log) {
    if (e[2] !== MEANING) continue;
    const s = start.get(e[1]);
    if (!s) {
      if (e[5] === 1) start.set(e[1], e);
      else start.set(e[1], [0, "", 0, 0, 0, 0]); // met before the log began, or passed as known: not a new word to score
    } else if (!next.has(e[1]) && dayKey(e[0]) !== dayKey(s[0])) next.set(e[1], e);
  }
  const firstReview = { ok: 0, n: 0 };
  for (const [id, s] of start) {
    const e = next.get(id);
    if (!e || s[5] !== 1) continue;
    firstReview.n++;
    if (isRight(e)) firstReview.ok++;
  }

  const words = Object.values(p.words);
  const hard = { ok: words.filter((w) => Object.values(w.skills).some((c) => c && c.lapses >= 3)).length, n: words.length };

  const days = new Map<string, number>();
  for (const e of log) if (e[0] > now - 7 * DAY) days.set(dayKey(e[0]), (days.get(dayKey(e[0])) ?? 0) + e[4] / 1000 + FEEDBACK_SECS + (e[5] === 1 ? TEACH_SECS : 0));
  const minutes = days.size ? Math.round([...days.values()].reduce((a, b) => a + b, 0) / days.size / 60) : null;

  return { recall, firstReview, hard, minutes };
}

/** Below this many answers a share is shown as "not enough data yet". */
export const MIN_ANSWERS = 20;
export const pct = (r: Rate) => (r.n ? Math.round((r.ok / r.n) * 100) : 0);
