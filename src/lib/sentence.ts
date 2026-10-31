import type { Sentence, Word } from "../types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The word itself (any case) as a whole word in the sentence, e.g. "carrot" in "a carrot" but not "carrots". */
export function findWord(sentence: string, word: string): { start: number; end: number } | null {
  const m = new RegExp(`(?<![\\w-])${escape(word)}(?![\\w-])`, "i").exec(sentence);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export const sentencesOf = (w: Word): Sentence[] => w.sentences ?? [w.sentence];

/** Sentences that can become a fill-in-the-gap question for this word. */
export const gapSentences = (w: Word): Sentence[] => sentencesOf(w).filter((s) => findWord(s.en, w.word));

/** Split a sentence around the word: ["Lily eats a ", "apple", "."] for the gap question. */
export function splitAt(sentence: string, word: string): [string, string, string] | null {
  const at = findWord(sentence, word);
  return at ? [sentence.slice(0, at.start), sentence.slice(at.start, at.end), sentence.slice(at.end)] : null;
}

/** Words from the pool that the sentence also mentions: they would be a second right answer. */
export const mentioned = (sentence: string, pool: Word[]) => pool.filter((w) => findWord(sentence, w.word)).map((w) => w.id);
