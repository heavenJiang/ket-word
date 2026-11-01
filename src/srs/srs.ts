import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Skill } from "../types";

/** Serialized FSRS card. Dates are epoch milliseconds to keep storage small and JSON-safe. */
export interface CardState {
  due: number;
  s: number;
  d: number;
  el: number;
  sd: number;
  ls: number;
  reps: number;
  lapses: number;
  st: 0 | 1 | 2 | 3;
  last?: number;
}

export interface WordProgress {
  /** When the child first met the word. */
  seen: number;
  skills: Partial<Record<Skill, CardState>>;
}

export { Rating, State };
export type { Grade };

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
const scheduler = (retention: number) => {
  let s = schedulers.get(retention);
  if (!s) {
    s = fsrs({
      request_retention: retention,
      enable_fuzz: true,
      // no same-day steps: relearning within a session is the session's job (retries, the final recall);
      // the memory model's first gap is a day at least, so a word comes back after a night's sleep
      enable_short_term: false,
      // a year at most: a card this strong graduates (GRADUATE_S) before the cap matters much
      maximum_interval: 365,
    });
    schedulers.set(retention, s);
  }
  return s;
};

const toCard = (c: CardState): Card => ({
  due: new Date(c.due),
  stability: c.s,
  difficulty: c.d,
  elapsed_days: c.el,
  scheduled_days: c.sd,
  learning_steps: c.ls,
  reps: c.reps,
  lapses: c.lapses,
  state: c.st as State,
  last_review: c.last ? new Date(c.last) : undefined,
});

const fromCard = (c: Card): CardState => ({
  due: c.due.getTime(),
  s: c.stability,
  d: c.difficulty,
  el: c.elapsed_days,
  sd: c.scheduled_days,
  ls: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  st: c.state as CardState["st"],
  last: c.last_review?.getTime(),
});

export function review(prev: CardState | undefined, grade: Grade, now: number, retention = 0.9): CardState {
  const card = prev ? toCard(prev) : createEmptyCard(new Date(now));
  return fromCard(scheduler(retention).next(card, new Date(now), grade).card);
}

export function retrievability(c: CardState, now: number, retention = 0.9): number {
  return scheduler(retention).get_retrievability(toCard(c), new Date(now), false) as number;
}

/** Forgotten this many times after being learnt (in any skill): the word is hard, and its memory hook shows. */
export const HARD_LAPSES = 2;
export const isHard = (p?: WordProgress) => !!p && Object.values(p.skills).some((c) => c && c.lapses >= HARD_LAPSES);

/**
 * Graduated: still recalled with 90% odds half a year on. Such a card leaves the daily reviews (the
 * exam sprint and a miss in the monthly check-up bring it back): reviewing it every few months would
 * cost a child time for almost nothing, as long-term studies of school vocabulary suggest.
 */
export const GRADUATE_S = 180;
export const isGraduated = (c?: CardState) => !!c && c.st === State.Review && c.s >= GRADUATE_S;
/** Every skill the word is learnt in has graduated. */
export const wordGraduated = (p: WordProgress | undefined, spell = true) =>
  !!p && isGraduated(p.skills.meaning) && isGraduated(p.skills.listen) && (!spell || isGraduated(p.skills.spell));

/** Long-term memory: still recalled with 90% odds three weeks after review. */
export const MASTERED_STABILITY = 21;
export const isMastered = (c?: CardState) => !!c && c.st === State.Review && c.s >= MASTERED_STABILITY;

/**
 * Skills unlock in order so a child never has to spell a word they cannot yet recognise:
 * meaning first, listening once the meaning has been answered, spelling once the meaning has
 * been recalled again on a later day. Only everyday words (`spell`) are ever spelled.
 */
export function unlockedSkills(p: WordProgress | undefined, spell = true): Skill[] {
  if (!p) return [];
  const m = p.skills.meaning;
  const out: Skill[] = ["meaning"];
  if (m && m.reps >= 1) out.push("listen");
  // spelling waits until the meaning has been recalled again on a later day, so a new word's first days
  // are not three questions at once
  if (spell && m && m.st === State.Review && m.reps >= 2) out.push("spell");
  return out;
}

/** 0 new · 1 learning · 2 knows the meaning · 3 fully mastered (every skill the word has). */
export type WordLevel = 0 | 1 | 2 | 3;
export function wordLevel(p: WordProgress | undefined, spell = true): WordLevel {
  if (!p || !p.skills.meaning) return 0;
  if (isMastered(p.skills.meaning) && isMastered(p.skills.listen) && (!spell || isMastered(p.skills.spell))) return 3;
  if (p.skills.meaning.st === State.Review) return 2;
  return 1;
}
