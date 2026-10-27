import type { Topic, Word } from "../types";

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
