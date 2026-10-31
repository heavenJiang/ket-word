import type { CardState, WordProgress } from "../srs/srs";
import type { QuestionKind, Skill } from "../types";
import type { Plan } from "./plan";
import { shuffle } from "../lib/choice";

export type Step =
  | { type: "intro"; wordIds: string[] }
  | { type: "match"; wordIds: string[] }
  | { type: "q"; wordId: string; skill: Skill; kind: QuestionKind; graded: boolean; retry: number };

export interface Session {
  steps: Step[];
  index: number;
  /** "wordId:skill" keys already answered once; only the first answer updates memory. */
  answered: string[];
}

/** New words are met in small groups: see all of them, pair them up in a game, then recall them in shuffled order. */
export const GROUP_SIZE = 4;
/** A wrong answer comes back after this many other questions… */
export const RETRY_GAP = 3;
/** …at most this many times, and never counts toward the score. */
export const MAX_RETRIES = 2;

export const keyOf = (wordId: string, skill: Skill) => `${wordId}:${skill}`;

/** Stability (days) from which a meaning is asked in a sentence, and a listening card hears a whole sentence. */
export const SENTENCE_MEANING_S = 3;
export const SENTENCE_LISTEN_S = 5;

/**
 * Question type for a skill. Weak meanings get the easier picture question; once a word is familiar,
 * half its questions put it back in a sentence (fill the gap, or hear a sentence and pick the picture),
 * so words are met in context without adding questions. Retries switch to a single-word type.
 * `roll` is a random number in [0, 1); `gap` says whether the word has a sentence with the word in it.
 */
export function kindFor(skill: Skill, card: CardState | undefined, retry = 0, opt: { gap?: boolean; roll?: number } = {}): QuestionKind {
  const sentence = retry === 0 && (opt.roll ?? 1) < 0.5;
  if (skill === "listen") return sentence && card && card.s >= SENTENCE_LISTEN_S ? "listenSentence" : "listenPick";
  if (skill === "spell") return "tiles";
  const easy = !card || card.s < SENTENCE_MEANING_S;
  if (!easy && sentence && opt.gap) return "cloze";
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

export function buildSession(
  plan: Plan,
  progress: Record<string, WordProgress>,
  rng: () => number = Math.random,
  /** Whether a word has a sentence that can take a gap; without it, no gap questions. */
  canGap: (wordId: string) => boolean = () => false,
): Session {
  const steps: Step[] = [];
  const reviews = spreadOut(shuffle(plan.reviews, rng));
  for (const t of reviews) {
    const card = progress[t.wordId]?.skills[t.skill];
    const kind = kindFor(t.skill, card, 0, { gap: canGap(t.wordId), roll: rng() });
    steps.push({ type: "q", wordId: t.wordId, skill: t.skill, kind, graded: true, retry: 0 });
  }
  for (let i = 0; i < plan.newWords.length; i += GROUP_SIZE) {
    const group = plan.newWords.slice(i, i + GROUP_SIZE);
    steps.push({ type: "intro", wordIds: group });
    if (group.length > 1) steps.push({ type: "match", wordIds: group });
    for (const wordId of shuffle(group, rng)) {
      steps.push({ type: "q", wordId, skill: "meaning", kind: "pickImage", graded: true, retry: 0 });
    }
  }
  return { steps, index: 0, answered: [] };
}

export const current = (s: Session): Step | undefined => s.steps[s.index];
export const isDone = (s: Session) => s.index >= s.steps.length;

/** Move past an ungraded step (intro, match). */
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
