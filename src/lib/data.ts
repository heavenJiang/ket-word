import { State, type WordProgress } from "../srs/srs";
import type { Story, Topic, Word } from "../types";

const base = import.meta.env.BASE_URL;

export interface AppIndex {
  source: string;
  credits: string;
  topics: Topic[];
}

export async function loadIndex(): Promise<AppIndex> {
  const r = await fetch(`${base}data/index.json`);
  if (!r.ok) throw new Error(`index.json: ${r.status}`);
  return r.json();
}

/** Every open island's words, plus lookups shared by planning and question building. */
export interface Library {
  topics: Record<string, Word[]>;
  byId: Map<string, Word>;
  /** Wrong-option pool for a word: the words of the first island it belongs to. */
  poolOf: Map<string, Word[]>;
  /** All distinct words, island by island. */
  all: Word[];
}

export async function loadLibrary(topicIds: string[]): Promise<Library> {
  const lists = await Promise.all(topicIds.map(loadTopic));
  const topics = Object.fromEntries(topicIds.map((id, i) => [id, lists[i]]));
  const byId = new Map<string, Word>();
  const poolOf = new Map<string, Word[]>();
  for (const ws of lists) {
    for (const w of ws) {
      if (byId.has(w.id)) continue;
      byId.set(w.id, w);
      poolOf.set(w.id, ws);
    }
  }
  return { topics, byId, poolOf, all: [...byId.values()] };
}

export async function loadTopic(id: string): Promise<Word[]> {
  const r = await fetch(`${base}data/topics/${id}.json`);
  if (!r.ok) throw new Error(`${id}.json: ${r.status}`);
  return (await r.json()).words;
}

/**
 * A second-meaning card (can.2) starts only once its word's first meaning has reached long-term review,
 * so a child meets "can = 能" after "can = 罐头" is solid, never both at once.
 */
export const canStart = (lib: Library, progress: Record<string, WordProgress>) => (id: string) => {
  const of = lib.byId.get(id)?.of;
  return !of || progress[of]?.skills.meaning?.st === State.Review;
};

/** Island stories; none yet is not an error. */
export async function loadStories(): Promise<Story[]> {
  const r = await fetch(`${base}data/stories.json`);
  return r.ok ? r.json() : [];
}

/** Island words a story still needs the child to meet before it opens. */
export const missingFor = (story: Story, progress: Record<string, WordProgress>) => story.needs.filter((id) => !progress[id]);
