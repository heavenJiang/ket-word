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
/** A day never asks for more new words than this. */
export const MAX_NEW_PER_DAY = 40;
/**
 * Most reviews in a day. Reviews are not cut by time (the day is its words, however long they take),
 * but after days away a child should not open the app to 400 questions: past this the rest waits,
 * and while more than half a day's worth waits, new words pause.
 */
export const REVIEW_SAFETY = 150;

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
  /** Reviews in a catch-up day with no new words (the same cap: the day is counted in words). */
  reviewCapAlone: number;
  /** "learn" while words are left, "final" once all are met; "free" has no goal date. */
  phase: "learn" | "final" | "free";
  /** The goal date once it is close (its last weeks): reviews aim at that day. */
  examAt?: number;
}

/**
 * Today's targets: the parent's new words a day (until none are left), every review that is due up to
 * the safety cap. Time is never a limit, only an estimate shown to the parent. A goal date, if set,
 * only makes the last three weeks aim reviews at that day. `remaining` counts words not started
 * before today.
 */
export function targets(p: Progress, now: number, remaining: number): Targets {
  const newPerDay = remaining === 0 ? 0 : Math.min(MAX_NEW_PER_DAY, remaining, p.settings.newPerDay);
  const left = daysLeft(p, now);
  const examAt = left && left <= FINAL_DAYS ? goalAt(p) : undefined;
  const phase = !left ? "free" : newPerDay > 0 ? "learn" : "final";
  return { newPerDay, reviewCap: REVIEW_SAFETY, reviewCapAlone: REVIEW_SAFETY, phase, examAt };
}

/**
 * New words a day needed to meet every word by the goal date with three weeks to spare, or undefined
 * without a goal (or when it is too close for that).
 */
export function paceFor(p: Progress, now: number, remaining: number): number | undefined {
  const days = daysLeft(p, now) - FINAL_DAYS;
  if (!p.settings.goal || days <= 0) return undefined;
  return Math.min(MAX_NEW_PER_DAY, Math.ceil(remaining / days));
}
