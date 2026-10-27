import type { CardState, WordProgress } from "../srs/srs";
import type { QuestionKind, Skill } from "../types";
import type { Plan } from "./plan";
import { shuffle } from "../lib/choice";

export type Step =
  | { type: "intro"; wordIds: string[] }
  | { type: "q"; wordId: string; skill: Skill; kind: QuestionKind; graded: boolean; retry: number };

export interface Session {
  steps: Step[];
  index: number;
  /** "wordId:skill" keys already answered once; only the first answer updates memory. */
  answered: string[];
}

/** New words are met in small groups: see all of them, then recall them in shuffled order. */
export const GROUP_SIZE = 4;
/** A wrong answer comes back after this many other questions… */
export const RETRY_GAP = 3;
/** …at most this many times, and never counts toward the score. */
export const MAX_RETRIES = 2;

export const keyOf = (wordId: string, skill: Skill) => `${wordId}:${skill}`;

/** Question type for a skill. Weak meanings get the easier picture question; retries switch type. */
export function kindFor(skill: Skill, card: CardState | undefined, retry = 0): QuestionKind {
  if (skill === "listen") return "listenPick";
  if (skill === "spell") return "tiles";
  const easy = !card || card.s < 3;
  return easy === (retry % 2 === 0) ? "pickImage" : "pickMeaning";
}

/** Reorder so the same word never appears twice in a row when it can be avoided. */
export function spreadOut<T extends { wordId: string }>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = 1; i < a.length; i++) {
    if (a[i].wordId !== a[i - 1].wordId) continue;
    const j = a.findIndex((x, k) => k > i && x.wordId !== a[i - 1].wordId);
    if (j > 0) [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildSession(plan: Plan, progress: Record<string, WordProgress>, rng: () => number = Math.random): Session {
  const steps: Step[] = [];
  const reviews = spreadOut(shuffle(plan.reviews, rng));
  for (const t of reviews) {
    const card = progress[t.wordId]?.skills[t.skill];
    steps.push({ type: "q", wordId: t.wordId, skill: t.skill, kind: kindFor(t.skill, card), graded: true, retry: 0 });
  }
  for (let i = 0; i < plan.newWords.length; i += GROUP_SIZE) {
    const group = plan.newWords.slice(i, i + GROUP_SIZE);
    steps.push({ type: "intro", wordIds: group });
    for (const wordId of shuffle(group, rng)) {
      steps.push({ type: "q", wordId, skill: "meaning", kind: "pickImage", graded: true, retry: 0 });
    }
  }
  return { steps, index: 0, answered: [] };
}

export const current = (s: Session): Step | undefined => s.steps[s.index];
export const isDone = (s: Session) => s.index >= s.steps.length;

/** Move past an intro step. */
export function advance(s: Session): Session {
  return { ...s, index: s.index + 1 };
}

/**
 * Record an answer to the current question. Returns whether this answer should update the
 * word's memory (first graded answer for that word and skill in this session).
 */
export function answer(
  s: Session,
  correct: boolean,
  progress: Record<string, WordProgress>,
): { session: Session; grade: boolean } {
  const step = s.steps[s.index];
  if (!step || step.type !== "q") return { session: s, grade: false };
  const key = keyOf(step.wordId, step.skill);
  const grade = step.graded && !s.answered.includes(key);
  const steps = [...s.steps];
  if (!correct && step.retry < MAX_RETRIES) {
    const retry = step.retry + 1;
    const card = progress[step.wordId]?.skills[step.skill];
    const at = Math.min(steps.length, s.index + 1 + RETRY_GAP);
    steps.splice(at, 0, { ...step, kind: kindFor(step.skill, card, retry), graded: false, retry });
  }
  return {
    session: { steps, index: s.index + 1, answered: grade ? [...s.answered, key] : s.answered },
    grade,
  };
}
