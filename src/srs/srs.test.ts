import { describe, expect, it } from "vitest";
import { isHard, Rating, review, unlockedSkills, wordLevel, type WordProgress } from "./srs";
import { gradeAttempt } from "./grade";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1, 8);

describe("gradeAttempt", () => {
  const ok = { correct: true, hinted: false, mistakes: 0, ms: 2000 };
  it("maps answers to grades without asking the child", () => {
    expect(gradeAttempt({ ...ok, correct: false }, "pickImage", 1)).toBe(Rating.Again);
    expect(gradeAttempt(ok, "pickImage", 1)).toBe(Rating.Good);
    expect(gradeAttempt({ ...ok, hinted: true }, "pickImage", 1)).toBe(Rating.Hard);
    expect(gradeAttempt({ ...ok, ms: 9000 }, "pickImage", 1)).toBe(Rating.Hard);
  });
  it("gives younger children more time before an answer counts as slow", () => {
    expect(gradeAttempt({ ...ok, ms: 9000 }, "pickImage", 2)).toBe(Rating.Good);
  });
  it("grades letter tiles by slips and speed", () => {
    expect(gradeAttempt({ ...ok, mistakes: 1, ms: 4000 }, "tiles", 1, 5)).toBe(Rating.Hard);
    expect(gradeAttempt({ ...ok, mistakes: 2, ms: 4000 }, "tiles", 1, 5)).toBe(Rating.Again);
    expect(gradeAttempt({ ...ok, ms: 4000 }, "tiles", 1, 5)).toBe(Rating.Easy);
    expect(gradeAttempt({ ...ok, ms: 8000 }, "tiles", 1, 5)).toBe(Rating.Good);
  });
});

describe("skills", () => {
  it("unlock listening after the first meaning answer and spelling after it graduates", () => {
    const meaning = review(undefined, Rating.Good, t0);
    const p: WordProgress = { seen: t0, skills: { meaning } };
    expect(unlockedSkills(p)).toEqual(["meaning", "listen"]);
    const graduated = review(meaning, Rating.Good, meaning.due + 1);
    expect(unlockedSkills({ seen: t0, skills: { meaning: graduated } })).toContain("spell");
    expect(wordLevel({ seen: t0, skills: { meaning: graduated } })).toBe(2);
  });

  it("schedules later reviews further apart", () => {
    let c = review(undefined, Rating.Good, t0);
    let now = c.due;
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      c = review(c, Rating.Good, now);
      gaps.push(c.due - now);
      now = c.due;
    }
    expect(gaps[3]).toBeGreaterThan(gaps[1]);
    expect(gaps[3]).toBeGreaterThan(DAY);
  });
});

describe("hard words", () => {
  it("counts a word as hard once any skill has been forgotten twice after being learnt", () => {
    const m = review(undefined, Rating.Good, t0);
    expect(isHard({ seen: t0, skills: { meaning: { ...m, lapses: 1 } } })).toBe(false);
    expect(isHard({ seen: t0, skills: { meaning: m, spell: { ...m, lapses: 2 } } })).toBe(true);
    expect(isHard(undefined)).toBe(false);
  });
});
