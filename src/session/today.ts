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
 * "One more group" after the day's plan is done: `extra` new words on top of those met today, and
 * only the reviews still waiting (none, normally, once the plan is done).
 */
const extraOptions = (opt: ReturnType<typeof planOptions>, extra: number) =>
  extra > 0 ? { ...opt, newPerDay: opt.newToday + extra, reviewCap: opt.reviewedToday + opt.reviewCap } : opt;

/** Most new words in a day, extra groups included: past this the child is told to rest, as reviews pile up. */
export const extraCap = (planned: number) => Math.max(16, planned * 2);

/**
 * Today's plan: reviews from every island, new words from the current island first and then the
 * islands after it on the course route, so a goal is never held up by an island running out of words.
 */
export function todayPlan(library: Library, topics: Topic[], progress: Progress, now: number, extra = 0): Plan {
  const open = routeOrder(topics);
  const i = Math.max(0, open.indexOf(progress.topic));
  const newOrder = [...open.slice(i), ...open.slice(0, i)].flatMap((id) => learningOrder(library.topics[id] ?? []).map((w) => w.id));
  const unstarted = library.all.filter((w) => !progress.words[w.id]).length;
  return buildPlan(
    library.all.map((w) => w.id),
    progress.words,
    now,
    extraOptions(planOptions(progress, now, unstarted), extra),
    [...new Set(newOrder)],
    canStart(library, progress.words),
    (id) => !!library.byId.get(id)?.spell,
  );
}
