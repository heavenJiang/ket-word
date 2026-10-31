export interface Sense {
  pos: string[];
  zh: string;
  /** An example, given for a meaning unrelated to the one taught here. */
  en?: string;
}

export interface Sentence {
  en: string;
  zh: string;
  /** Higgs Audio recording (scripts/ket/gen_audio.py); without one the browser's voice reads it. */
  audio?: string;
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
  /** Meanings, the first being the one this island teaches and pictures (can: 罐头 n., then 能 mv.). */
  senses?: Sense[];
  /** For a second-meaning card (can.2 = "can" as in "I can swim"): the word it belongs to, and that word's meaning. */
  of?: string;
  ofZh?: string;
  /** An everyday (A1) word the child also learns to spell; other words stop at meaning and listening. */
  spell?: boolean;
  /** A memory hook for a word the child keeps forgetting (content/hooks.json); shown only once it proves hard. */
  hook?: Hook;
  /** Words too alike to be fair wrong options for this one (plate / dish / bowl). */
  avoid?: string[];
}

/**
 * How a hook ties the word to something the child knows: its parts (bookshop = book + shop), a prefix
 * or suffix, a word it is easily confused with, a little scene, or, last, a Chinese sound-alike.
 */
export type HookKind = "split" | "affix" | "contrast" | "story" | "sound";
export interface Hook {
  kind: HookKind;
  text: string;
}

export interface Topic {
  id: string;
  en: string;
  zh: string;
  count: number;
  /** Kid content has been written and reviewed for this topic. */
  ready: boolean;
  /** A core-word island (words on no KET topic list) brings its own emoji. */
  core?: boolean;
  emoji?: string;
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
  | "pickWord" // see the meaning (and picture), pick the English word (meaning, once it is strong)
  | "listenPick" // hear only, pick the written word            (listen)
  | "cloze" // read a sentence with a gap, pick the word        (meaning, once it is familiar)
  | "listenSentence" // hear a sentence, pick its picture       (listen, once it is familiar)
  | "tiles"; // see picture + hear, build the word from letters (spell)

export type Accent = "uk" | "us";

/** A short island story (content/stories), built by build_app_data.py. */
export interface Story {
  id: string;
  topic: string;
  title: string;
  zh: string;
  pages: StoryPage[];
  questions: StoryQuestion[];
  /** The island's words in the story: it opens once the child has met them all. */
  needs: string[];
}

export interface StoryPage {
  en: string;
  zh: string;
  /** The text as plain strings and tappable words ({t: "monkeys", id: "monkey"}). */
  segments: (string | { t: string; id: string })[];
  img: string | null;
  /** Higgs Audio recording of the page; without one the browser's voice reads it. */
  audio?: string;
  /** [character index in `en`, second in the recording] for each word, to light it up as it is said. */
  marks?: [number, number][];
}

/** True / false when `answer` is a boolean, else pick one of `options`. */
export interface StoryQuestion {
  q: string;
  zh: string;
  answer: boolean | number;
  options?: string[];
}
