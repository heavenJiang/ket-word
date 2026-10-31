import type { Progress } from "../store/progress";

const DAY = 86_400_000;

/** The last weeks before the goal take no new words: they are for making everything stick. */
export const FINAL_DAYS = 21;
/** Time for one new word: meeting it, the match game, a practice and the final recall. */
export const NEW_WORD_SECS = 45;
/** Time for one review before the child has answered enough of them to measure. */
const DEFAULT_REVIEW_SECS = 10;
/** The answer card after each question, on top of the time to answer. */
const FEEDBACK_SECS = 4;
/** Reviews always get at least this share of the day, however many new words the goal asks for. */
const MIN_REVIEW_SHARE = 0.4;
/** A goal never asks for more new words than this in a day. */
export const MAX_NEW_PER_DAY = 40;

/** Seconds one review takes this child: the median of their recent answers plus the answer card. */
export function secsPerReview(p: Progress): number {
  const ms = (p.log ?? []).filter((e) => e[5] === 0).slice(-200).map((e) => e[4]).sort((a, b) => a - b);
  if (ms.length < 20) return DEFAULT_REVIEW_SECS;
  return Math.min(30, Math.max(6, ms[ms.length >> 1] / 1000 + FEEDBACK_SECS));
}

/** End of the goal day, local time, or undefined without a goal. */
export function goalAt(p: Progress): number | undefined {
  const g = p.settings.goal;
  if (!g) return undefined;
  const [y, m, d] = g.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Learning days from today to the goal, today included; 0 once it has passed. */
export function daysLeft(p: Progress, now: number): number {
  const at = goalAt(p);
  if (at === undefined) return 0;
  return Math.max(0, Math.ceil((at - new Date(now).setHours(0, 0, 0, 0)) / DAY));
}

export interface Targets {
  newPerDay: number;
  reviewCap: number;
  /** Reviews that fit in the whole day, for a catch-up day with no new words. */
  reviewCapAlone: number;
  /** "learn" spreads new words over the days left, "final" only makes them stick; "free" has no goal. */
  phase: "learn" | "final" | "free";
  examAt?: number;
}

/**
 * Today's targets. With a goal, the words not yet started are spread evenly over the days left
 * (minus the last three weeks), recounted every day, so a missed day is shared out over the rest.
 * Reviews get whatever time the new words leave, never less than 40% of the day.
 * `remaining` counts the words not started before today.
 */
export function targets(p: Progress, now: number, remaining: number): Targets {
  const budget = p.settings.minutes * 60;
  const per = secsPerReview(p);
  const reviewCap = (n: number) => Math.max(Math.floor((budget * MIN_REVIEW_SHARE) / per), Math.floor((budget - n * NEW_WORD_SECS) / per));
  const left = daysLeft(p, now);
  const reviewCapAlone = Math.floor(budget / per);
  if (!left) return { newPerDay: p.settings.newPerDay, reviewCap: reviewCap(p.settings.newPerDay), reviewCapAlone, phase: "free" };
  const examAt = left <= FINAL_DAYS ? goalAt(p) : undefined;
  // behind schedule inside the last weeks: keep going, finishing a week before the goal
  const days = left > FINAL_DAYS ? left - FINAL_DAYS : Math.max(1, left - 7);
  // a quick learner may take more than the goal needs: the goal is then simply reached sooner
  const n = remaining === 0 ? 0 : Math.min(MAX_NEW_PER_DAY, remaining, Math.max(Math.ceil(remaining / days), p.settings.minNew ?? 0));
  return { newPerDay: n, reviewCap: reviewCap(n), reviewCapAlone, phase: n > 0 ? "learn" : "final", examAt };
}
