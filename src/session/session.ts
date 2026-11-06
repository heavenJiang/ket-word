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

/** A new word's unscored spelling, done with the letters on show; a graded spelling's retries are unscored too, but are not copies. */
export const isCopy = (s: Step) => s.type === "q" && s.kind === "tiles" && !s.graded && s.retry === 0;

/** Reviews between a group's unscored practice and its scored recall, so the recall comes after a pause. */
export const RECALL_GAP = 6;

/**
 * New words come early, in small groups, so a child who stops after a round has still met them:
 * each group is met, matched and practised once without scoring, then a few reviews, then the group
 * is recalled once more and that answer is the one that counts (memory scored after a pause, not
 * straight after seeing the word). A word that is spelled is also copied once, unscored, with its
 * letters on show: the child's hands go through the spelling on day one, though it is only tested
 * from the third day. The reviews left over come last.
 */
export function buildSession(
  plan: Plan,
  progress: Record<string, WordProgress>,
  rng: () => number = Math.random,
  /** Whether a word has a sentence that can take a gap; without it, no gap questions. */
  canGap: (wordId: string) => boolean = () => false,
  /** Whether a word is ever spelled; the others are not copied either. */
  spells: (wordId: string) => boolean = () => false,
): Session {
  const reviews: Step[] = spreadOut(shuffle(plan.reviews, rng)).map((t) => {
    const card = progress[t.wordId]?.skills[t.skill];
    return { type: "q", wordId: t.wordId, skill: t.skill, kind: kindFor(t.skill, card, 0, { gap: canGap(t.wordId), roll: rng() }), graded: true, retry: 0 };
  });
  const steps: Step[] = [];
  for (let i = 0; i < plan.newWords.length; i += GROUP_SIZE) {
    const group = plan.newWords.slice(i, i + GROUP_SIZE);
    steps.push({ type: "intro", wordIds: group });
    if (group.length > 1) steps.push({ type: "match", wordIds: group });
    for (const wordId of shuffle(group, rng)) steps.push({ type: "q", wordId, skill: "meaning", kind: "pickImage", graded: false, retry: 0 });
    for (const wordId of shuffle(group.filter(spells), rng)) steps.push({ type: "q", wordId, skill: "spell", kind: "tiles", graded: false, retry: 0 });
    steps.push(...reviews.splice(0, RECALL_GAP));
    for (const { wordId } of spreadOut(shuffle(group.map((wordId) => ({ wordId })), rng)))
      steps.push({ type: "q", wordId, skill: "meaning", kind: "pickMeaning", graded: true, retry: 0 });
  }
  steps.push(...reviews);
  return { steps, index: 0, answered: [] };
}

/**
 * Whether a group of new words has been met but not yet recalled: a break now would lose it (the
 * words count as learnt only once recalled), so a round does not end until the group is done.
 */
export const groupOpen = (s: Session): boolean => openWords(s).length > 0;

/** Questions in a round: a long day is cut into short rounds, each ending with a small celebration. */
export const ROUND = 10;

/** Questions still ahead in the session. */
export const questionsLeft = (s: Session) => s.steps.slice(s.index).filter((x) => x.type === "q").length;

/**
 * Whether a round ends after its `n`-th question: after ROUND questions, unless the day is about to
 * end anyway, and never in the middle of a group of new words, which would be lost if the child stopped.
 */
export const roundEnds = (n: number, s: Session) => n >= ROUND && questionsLeft(s) >= ROUND / 2 && !groupOpen(s);

/** New words met in this session but not yet recalled: leaving now, they are met again as new another day. */
export function openWords(s: Session): string[] {
  const met = new Set(s.steps.slice(0, s.index).flatMap((x) => (x.type === "intro" ? x.wordIds : [])));
  const todo = s.steps.slice(s.index).flatMap((x) => (x.type === "q" && x.graded && met.has(x.wordId) && !s.answered.includes(keyOf(x.wordId, x.skill)) ? [x.wordId] : []));
  return [...new Set(todo)];
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
