import { describe, expect, it } from "vitest";
import { longestStreak } from "./Calendar";

const day = (answered: number) => ({ answered, correct: answered, newWords: 0, stars: 0 });

describe("study calendar", () => {
  it("finds the longest run of study days, across months and the clock change", () => {
    const days = { "2026-10-24": day(5), "2026-10-25": day(5), "2026-10-26": day(5), "2026-10-27": day(0), "2026-10-30": day(5), "2026-10-31": day(5), "2026-11-01": day(5), "2026-11-02": day(5) };
    expect(longestStreak(days)).toBe(4);
    expect(longestStreak({})).toBe(0);
  });
});
