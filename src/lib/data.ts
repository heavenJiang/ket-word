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

export async function loadTopic(id: string): Promise<Word[]> {
  const r = await fetch(`${base}data/topics/${id}.json`);
  if (!r.ok) throw new Error(`${id}.json: ${r.status}`);
  return (await r.json()).words;
}
