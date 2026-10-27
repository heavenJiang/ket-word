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

export { Rating };
export type { Grade };

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
const scheduler = (retention: number) => {
  let s = schedulers.get(retention);
  if (!s) {
    s = fsrs({
      request_retention: retention,
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: ["1m", "10m"],
      relearning_steps: ["10m"],
      // children forget long gaps more easily than adults; cap intervals at ~4 months
      maximum_interval: 120,
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

/** Long-term memory: still recalled with 90% odds three weeks after review. */
export const MASTERED_STABILITY = 21;
export const isMastered = (c?: CardState) => !!c && c.st === State.Review && c.s >= MASTERED_STABILITY;

/**
 * Skills unlock in order so a child never has to spell a word they cannot yet recognise:
 * meaning first, listening once the meaning has been answered, spelling once the meaning
 * has graduated to long-term review.
 */
export function unlockedSkills(p: WordProgress | undefined): Skill[] {
  if (!p) return [];
  const m = p.skills.meaning;
  const out: Skill[] = ["meaning"];
  if (m && m.reps >= 1) out.push("listen");
  if (m && m.st === State.Review) out.push("spell");
  return out;
}

/** 0 new · 1 learning · 2 knows the meaning · 3 fully mastered (all three skills). */
export type WordLevel = 0 | 1 | 2 | 3;
export function wordLevel(p: WordProgress | undefined): WordLevel {
  if (!p || !p.skills.meaning) return 0;
  if (isMastered(p.skills.meaning) && isMastered(p.skills.listen) && isMastered(p.skills.spell)) return 3;
  if (p.skills.meaning.st === State.Review) return 2;
  return 1;
}
