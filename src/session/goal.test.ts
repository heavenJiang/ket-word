import { describe, expect, it } from "vitest";
import { emptyProgress, recordGrade, type Progress } from "../store/progress";
import { Rating } from "../srs/srs";
import { FINAL_DAYS, NEW_WORD_SECS, secsPerReview, targets } from "./goal";

const DAY = 86_400_000;
const now = new Date(2026, 10, 1, 18).getTime();
const withGoal = (days: number, minutes = 25): Progress => {
  const p = emptyProgress();
  const d = new Date(now + (days - 1) * DAY);
  const goal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ...p, settings: { ...p.settings, goal, minutes } };
};

describe("targets", () => {
  it("spreads the words left over the days before the last three weeks", () => {
    const t = targets(withGoal(100 + FINAL_DAYS), now, 1000);
    expect(t.phase).toBe("learn");
    expect(t.newPerDay).toBe(10);
    expect(t.examAt).toBeUndefined();
  });

  it("gives reviews the time new words leave, and never less than 40% of it", () => {
    const t = targets(withGoal(100 + FINAL_DAYS), now, 1000);
    expect(t.reviewCap).toBe(Math.floor((25 * 60 - 10 * NEW_WORD_SECS) / 10));
    const rushed = targets(withGoal(10 + FINAL_DAYS), now, 1000);
    expect(rushed.reviewCap).toBe(Math.floor((25 * 60 * 0.4) / 10));
  });

  it("takes no new words in the last weeks once everything is met, and aims reviews at the exam", () => {
    const t = targets(withGoal(10), now, 0);
    expect(t.phase).toBe("final");
    expect(t.newPerDay).toBe(0);
    expect(t.examAt).toBeGreaterThan(now);
  });

  it("keeps going when behind in the last weeks, finishing a week early", () => {
    expect(targets(withGoal(17), now, 100).newPerDay).toBe(10);
  });

  it("takes at least the parent's minimum of new words, never more than are left", () => {
    const p = withGoal(100 + FINAL_DAYS);
    expect(targets({ ...p, settings: { ...p.settings, minNew: 16 } }, now, 1000).newPerDay).toBe(16);
    expect(targets({ ...p, settings: { ...p.settings, minNew: 16 } }, now, 5).newPerDay).toBe(5);
    expect(targets({ ...p, settings: { ...p.settings, minNew: 4 } }, now, 1000).newPerDay).toBe(10);
  });

  it("uses the fixed number of new words without a goal", () => {
    const t = targets(emptyProgress(), now, 1000);
    expect(t.phase).toBe("free");
    expect(t.newPerDay).toBe(8);
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
