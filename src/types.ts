export interface Sentence {
  en: string;
  zh: string;
}

/** One learnable word, as built by scripts/ket/build_app_data.py. */
export interface Word {
  id: string;
  word: string;
  zh: string;
  pos: string[];
  ipa: string;
  /** Syllable / phonics chunks for reading aloud, e.g. ["el", "e", "phant"]. */
  chunks: string[];
  emoji: string;
  sentence: { en: string; zh: string };
  /** Every example sentence, the main one first; sentence questions draw from these. */
  sentences?: Sentence[];
  media: { img?: string; uk?: string; us?: string };
  /** Words too alike to be fair wrong options for this one (plate / dish / bowl). */
  avoid?: string[];
}

export interface Topic {
  id: string;
  en: string;
  zh: string;
  count: number;
  /** Kid content has been written and reviewed for this topic. */
  ready: boolean;
}

/**
 * Each word is remembered as three separate skills, each with its own FSRS card:
 * knowing what it means, recognising it by ear, and spelling it.
 */
export type Skill = "meaning" | "listen" | "spell";
export const SKILLS: Skill[] = ["meaning", "listen", "spell"];

export type QuestionKind =
  | "pickImage" // hear + see the word, pick the picture       (meaning)
  | "pickMeaning" // see the word, pick the Chinese meaning     (meaning)
  | "listenPick" // hear only, pick the written word            (listen)
  | "cloze" // read a sentence with a gap, pick the word        (meaning, once it is familiar)
  | "listenSentence" // hear a sentence, pick its picture       (listen, once it is familiar)
  | "tiles"; // see picture + hear, build the word from letters (spell)

export type Accent = "uk" | "us";
