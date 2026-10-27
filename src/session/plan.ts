import { retrievability, unlockedSkills, type WordProgress } from "../srs/srs";
import type { Skill } from "../types";

export interface Task {
  wordId: string;
  skill: Skill;
}

export interface Plan {
  /** Due skills to practise, most-forgotten first. */
  reviews: Task[];
  /** Words to meet for the first time today. */
  newWords: string[];
  /** Due skills left out because of the daily cap; non-zero means "catch-up mode". */
  backlog: number;
}

export interface PlanOptions {
  newPerDay: number;
  /** Most reviews in one day, so a few missed days never turn into a wall of 200 cards. */
  reviewCap: number;
  retention: number;
  /** New words already met earlier today. */
  newToday: number;
  /** Reviews already answered earlier today; they count toward the cap. */
  reviewedToday: number;
}

/**
 * Today's plan. Reviews always come before new words; while there is a backlog no new
 * words are added, and a heavy review day halves them, so the daily load stays small.
 * Reviews come from `order` (every word the app knows, across islands); new words come
 * from `newOrder` (the current island), so switching islands never strands old words.
 */
export function buildPlan(
  order: string[],
  progress: Record<string, WordProgress>,
  now: number,
  opt: PlanOptions,
  newOrder: string[] = order,
): Plan {
  const due: { task: Task; r: number }[] = [];
  const firstTime: Task[] = [];
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const wordId of order) {
    const p = progress[wordId];
    if (!p) continue;
    // a skill unlocked by today's practice waits until tomorrow, keeping the spacing
    const unlockedBeforeToday = (p.skills.meaning?.last ?? now) < today;
    for (const skill of unlockedSkills(p)) {
      const card = p.skills[skill];
      if (!card) {
        if (unlockedBeforeToday) firstTime.push({ wordId, skill });
      }
      else if (card.due <= now) due.push({ task: { wordId, skill }, r: retrievability(card, now, opt.retention) });
    }
  }
  due.sort((a, b) => a.r - b.r);
  const all = [...due.map((d) => d.task), ...firstTime];
  const reviews = all.slice(0, Math.max(0, opt.reviewCap - opt.reviewedToday));
  const backlog = all.length - reviews.length;

  let limit = Math.max(0, opt.newPerDay - opt.newToday);
  if (backlog > 0) limit = 0;
  else if (all.length + opt.reviewedToday > opt.reviewCap / 2) limit = Math.ceil(limit / 2);
  const newWords = newOrder.filter((id) => !progress[id]).slice(0, limit);

  return { reviews, newWords, backlog };
}
