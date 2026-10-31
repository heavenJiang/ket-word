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
/**
 * …until it is answered right (at most this many times, each easier than the last), and never counts
 * toward the score: a word is not left behind on a miss, it is relearnt in the same session.
 */
export const MAX_RETRIES = 3;

export const keyOf = (wordId: string, skill: Skill) => `${wordId}:${skill}`;

/** Stability (days) from which a meaning is asked in a sentence, and a listening card hears a whole sentence. */
export const SENTENCE_MEANING_S = 3;
export const SENTENCE_LISTEN_S = 5;
/** Stability (days) from which a meaning is asked the productive way: see the meaning, pick the English word. */
export const PRODUCE_S = 10;

/**
 * Question type for a skill, harder as the memory gets stronger. A weak meaning gets the picture
 * question (hear and see the word); a familiar one the Chinese-meaning question; a strong one is asked
 * the productive way (see the meaning, pick the English), since recognising a word does not mean being
 * able to come up with it. Familiar words also go back in a sentence for half their questions (fill the
 * gap, or hear a sentence and pick the picture). Retries get easier: another single-word type first,
 * then the picture question. `roll` is a random number in [0, 1); `gap` says whether the word has a
 * sentence with the word in it.
 */
export function kindFor(skill: Skill, card: CardState | undefined, retry = 0, opt: { gap?: boolean; roll?: number } = {}): QuestionKind {
  const sentence = retry === 0 && (opt.roll ?? 1) < 0.5;
  if (skill === "listen") return sentence && card && card.s >= SENTENCE_LISTEN_S ? "listenSentence" : "listenPick";
  if (skill === "spell") return "tiles";
  const easy = !card || card.s < SENTENCE_MEANING_S;
  if (retry > 1) return "pickImage";
  if (retry === 1) return easy ? "pickMeaning" : "pickImage";
  if (!easy && sentence && opt.gap) return "cloze";
  if (easy) return "pickImage";
  return card.s >= PRODUCE_S ? "pickWord" : "pickMeaning";
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

/** Reviews first, then the new words, taught as `newWordSteps` lays out. */
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
  steps.push(...newWordSteps(plan.newWords, rng));
  return { steps, index: 0, answered: [] };
}

/**
 * New words in small groups: meet them, play the match game, then practise each once without
 * scoring. At the very end every one of them is recalled once more, and that answer is the one that
 * counts, so memory is scored after a pause rather than straight after seeing the word.
 */
export function newWordSteps(wordIds: string[], rng: () => number = Math.random): Step[] {
  const add: Step[] = [];
  for (let i = 0; i < wordIds.length; i += GROUP_SIZE) {
    const group = wordIds.slice(i, i + GROUP_SIZE);
    add.push({ type: "intro", wordIds: group });
    if (group.length > 1) add.push({ type: "match", wordIds: group });
    for (const wordId of shuffle(group, rng)) add.push({ type: "q", wordId, skill: "meaning", kind: "pickImage", graded: false, retry: 0 });
  }
  const recall = spreadOut(shuffle(wordIds.map((wordId) => ({ wordId })), rng));
  for (const { wordId } of recall) add.push({ type: "q", wordId, skill: "meaning", kind: "pickMeaning", graded: true, retry: 0 });
  return add;
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
    let kind = kindFor(step.skill, card, retry);
    // the first retry asks another way: the final recall of a new word is a meaning question, so its retry is a picture one
    if (retry === 1 && kind === step.kind && step.skill === "meaning") kind = kind === "pickImage" ? "pickMeaning" : "pickImage";
    steps.splice(at, 0, { ...step, kind, graded: false, retry });
  }
  return {
    session: { steps, index: s.index + 1, answered: grade ? [...s.answered, key] : s.answered },
    grade,
  };
}
