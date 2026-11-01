import { describe, expect, it } from "vitest";
import { Rating, review, type WordProgress } from "../srs/srs";
import { buildPlan } from "./plan";
import { dayTasks } from "./today";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1, 8);
const order = Array.from({ length: 20 }, (_, i) => `w${i}`);
/** Words met at `at`, one graded answer each, so only their meaning card exists. */
const learned = (ids: string[], at = t0): Record<string, WordProgress> =>
  Object.fromEntries(ids.map((id) => [id, { seen: at, skills: { meaning: review(undefined, Rating.Good, at) } }]));

describe("dayTasks", () => {
  it("says the day is over once its words are done, with minutes still unused", () => {
    // the day's 8 new words are met and 12 reviews answered: nothing is waiting, although the
    // review cap (a whole time budget) is nowhere near used up
    const opt = { newPerDay: 8, reviewCap: 120, retention: 0.9, newToday: 8, reviewedToday: 12 };
    const plan = buildPlan(order, learned(order.slice(0, 8), t0), t0 + 5 * 60_000, opt);
    expect(plan).toEqual({ reviews: [], newWords: [], backlog: 0 });
    expect(dayTasks(plan, opt)).toEqual({ done: 20, left: 0 });
  });

  it("counts only today's share when reviews pile up, not every waiting card", () => {
    const opt = { newPerDay: 8, reviewCap: 10, retention: 0.9, newToday: 0, reviewedToday: 0 };
    const plan = buildPlan(order, learned(order.slice(0, 18), t0), t0 + 3 * DAY, opt);
    expect(plan.backlog).toBeGreaterThan(10);
    expect(plan.newWords).toEqual([]);
    expect(dayTasks(plan, opt)).toEqual({ done: 0, left: 10 });
  });

  it("has no tasks at all when nothing is due and every word is met", () => {
    const opt = { newPerDay: 8, reviewCap: 120, retention: 0.9, newToday: 0, reviewedToday: 0 };
    const plan = buildPlan(order, learned(order, t0), t0 + 5 * 60_000, opt);
    expect(dayTasks(plan, opt)).toEqual({ done: 0, left: 0 });
  });
});
