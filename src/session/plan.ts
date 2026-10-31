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
  /** Due skills left out because of today's time; a lot of them means "catch-up mode". */
  backlog: number;
}

export interface PlanOptions {
  newPerDay: number;
  /** Most reviews that fit in today's time, so a few missed days never turn into a wall of 200 cards. */
  reviewCap: number;
  /** Most reviews that fit when new words are paused and reviews have the whole day; reviewCap without it. */
  reviewCapAlone?: number;
  retention: number;
  /** New words already met earlier today. */
  newToday: number;
  /** Reviews already answered earlier today; they count toward the cap. */
  reviewedToday: number;
  /**
   * The exam day, once it is close: reviews left over in the day's time go to the skills that would
   * be weakest on that day, even before they are due, so everything is fresh for the exam.
   */
  examAt?: number;
}

/** Whether a word is ever spelled (everyday words only); everything is spelled when not given. */
export type Spells = (wordId: string) => boolean;

/**
 * Today's plan. Reviews always come before new words; new words pause only while more than half
 * a day's reviews are waiting, so a small backlog never stops progress (it clears by itself, most
 * forgotten first). Reviews come from `order` (every word the app knows, across islands); new words
 * come from `newOrder`, so switching islands never strands old words.
 */
export function buildPlan(
  order: string[],
  progress: Record<string, WordProgress>,
  now: number,
  opt: PlanOptions,
  newOrder: string[] = order,
  /** Whether a new word may start yet: a second meaning waits until its word's first meaning is learnt. */
  canStart: (wordId: string) => boolean = () => true,
  spells: Spells = () => true,
): Plan {
  const due: { task: Task; r: number }[] = [];
  const firstTime: Task[] = [];
  const early: { task: Task; r: number }[] = [];
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const wordId of order) {
    const p = progress[wordId];
    if (!p) continue;
    // a skill unlocked by today's practice waits until tomorrow, keeping the spacing
    const unlockedBeforeToday = (p.skills.meaning?.last ?? now) < today;
    for (const skill of unlockedSkills(p, spells(wordId))) {
      const card = p.skills[skill];
      if (!card) {
        if (unlockedBeforeToday) firstTime.push({ wordId, skill });
      } else if (card.due <= now) due.push({ task: { wordId, skill }, r: retrievability(card, now, opt.retention) });
      else if (opt.examAt && (card.last ?? 0) < today) {
        const r = retrievability(card, opt.examAt, opt.retention);
        if (r < opt.retention) early.push({ task: { wordId, skill }, r });
      }
    }
  }
  due.sort((a, b) => a.r - b.r);
  early.sort((a, b) => a.r - b.r);
  const all = [...due.map((d) => d.task), ...firstTime];
  // more than half a day's reviews waiting: catch up first, with the whole day's time
  const catchUp = all.length - Math.max(0, opt.reviewCap - opt.reviewedToday) > opt.reviewCap / 2;
  const room = Math.max(0, (catchUp ? opt.reviewCapAlone ?? opt.reviewCap : opt.reviewCap) - opt.reviewedToday);
  const reviews = all.slice(0, room);
  const backlog = all.length - reviews.length;
  reviews.push(...early.slice(0, room - reviews.length).map((e) => e.task));

  const limit = catchUp ? 0 : Math.max(0, opt.newPerDay - opt.newToday);
  const fresh = newOrder.filter((id) => !progress[id] && canStart(id));

  return { reviews, newWords: fresh.slice(0, limit), backlog };
}
