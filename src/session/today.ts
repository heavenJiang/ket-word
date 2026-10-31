import { canStart, type Library } from "../lib/data";
import { routeOrder } from "../lib/route";
import { planOptions, type Progress } from "../store/progress";
import type { Topic, Word } from "../types";
import { buildPlan, type Plan } from "./plan";

/** Shortest, simplest words first: one-syllable everyday animals before "crocodile". */
export const learningOrder = (ws: Word[]) =>
  [...ws].sort((a, b) => a.chunks.length - b.chunks.length || a.word.length - b.word.length);

/** The next island after `from` on the course route that still has words the child has not met. */
export function nextIsland(topics: Topic[], library: Library, progress: Progress, from: string): string | undefined {
  const order = routeOrder(topics);
  const i = order.indexOf(from);
  const rest = [...order.slice(i + 1), ...order.slice(0, Math.max(0, i))];
  return rest.find((id) => (library.topics[id] ?? []).some((w) => !progress.words[w.id]));
}

/**
 * Today's plan: reviews from every island, new words from the current island first and then the
 * islands after it on the course route, so a goal is never held up by an island running out of words.
 */
export function todayPlan(library: Library, topics: Topic[], progress: Progress, now: number): Plan {
  const open = routeOrder(topics);
  const i = Math.max(0, open.indexOf(progress.topic));
  const newOrder = [...open.slice(i), ...open.slice(0, i)].flatMap((id) => learningOrder(library.topics[id] ?? []).map((w) => w.id));
  const unstarted = library.all.filter((w) => !progress.words[w.id]).length;
  return buildPlan(
    library.all.map((w) => w.id),
    progress.words,
    now,
    planOptions(progress, now, unstarted),
    [...new Set(newOrder)],
    canStart(library, progress.words),
    (id) => !!library.byId.get(id)?.spell,
  );
}
