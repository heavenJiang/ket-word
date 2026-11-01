import { describe, expect, it } from "vitest";
import { emptyProgress, recordGrade, type Progress } from "../store/progress";
import { Rating } from "../srs/srs";
import { FINAL_DAYS, paceFor, REVIEW_SAFETY, secsPerReview, targets } from "./goal";

const DAY = 86_400_000;
const now = new Date(2026, 10, 1, 18).getTime();
const withGoal = (days: number, newPerDay = 10): Progress => {
  const p = emptyProgress();
  const d = new Date(now + (days - 1) * DAY);
  const goal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ...p, settings: { ...p.settings, goal, newPerDay } };
};

describe("targets", () => {
  it("asks for the parent's new words a day, 10 by default, never more than are left", () => {
    expect(targets(emptyProgress(), now, 1000)).toMatchObject({ newPerDay: 10, phase: "free" });
    expect(targets(emptyProgress(), now, 3).newPerDay).toBe(3);
    expect(targets(withGoal(200, 14), now, 1000)).toMatchObject({ newPerDay: 14, phase: "learn" });
  });

  it("does not cut reviews by time, only past the safety cap for days away", () => {
    expect(targets(emptyProgress(), now, 1000).reviewCap).toBe(REVIEW_SAFETY);
  });

  it("aims reviews at the goal date in its last weeks, and stops new words once all are met", () => {
    expect(targets(withGoal(100 + FINAL_DAYS), now, 1000).examAt).toBeUndefined();
    const end = targets(withGoal(10), now, 0);
    expect(end).toMatchObject({ phase: "final", newPerDay: 0 });
    expect(end.examAt).toBeGreaterThan(now);
  });

  it("works out the pace a goal date needs, leaving the last three weeks for reviews", () => {
    expect(paceFor(withGoal(100 + FINAL_DAYS), now, 1000)).toBe(10);
    expect(paceFor(emptyProgress(), now, 1000)).toBeUndefined();
    expect(paceFor(withGoal(10), now, 1000)).toBeUndefined();
  });

  it("measures how long this child takes per review", () => {
    let p = emptyProgress();
    expect(secsPerReview(p)).toBe(10);
    p = recordGrade(p, "w", "meaning", Rating.Good, now, 3000);
    for (let i = 0; i < 30; i++) p = recordGrade(p, "w", "meaning", Rating.Good, now + i, 5000);
    expect(secsPerReview(p)).toBe(9);
  });
});

describe("the answer log", () => {
  it("logs every graded answer, marking a word's first one as new", () => {
    let p = recordGrade(emptyProgress(), "cat", "meaning", Rating.Good, now, 1800);
    p = recordGrade(p, "cat", "meaning", Rating.Good, now + 1000, 2500);
    const day = Object.values(p.days)[0];
    expect(day).toMatchObject({ answered: 2, newWords: 1 });
    expect(p.log?.map((e) => [e[1], e[5]])).toEqual([["cat", 1], ["cat", 0]]);
  });
});
