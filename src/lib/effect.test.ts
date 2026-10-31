import { describe, expect, it } from "vitest";
import { Rating } from "../srs/srs";
import { checkupWords, emptyProgress, recordCheckup, recordGrade } from "../store/progress";
import type { Story } from "../types";
import { rereadDue, toOpen } from "./data";
import { effect } from "./effect";

const DAY = 86_400_000;
const t0 = new Date(2026, 10, 2, 18).getTime();

describe("effect", () => {
  it("scores each new word on its first review on a later day", () => {
    let p = recordGrade(emptyProgress(), "cat", "meaning", Rating.Good, t0, 2000);
    p = recordGrade(p, "dog", "meaning", Rating.Good, t0, 2000);
    p = recordGrade(p, "cat", "meaning", Rating.Good, t0 + 60_000, 2000); // same day: not the test
    p = recordGrade(p, "cat", "meaning", Rating.Good, t0 + DAY, 2000);
    p = recordGrade(p, "dog", "meaning", Rating.Again, t0 + DAY, 2000);
    expect(effect(p, t0 + DAY).firstReview).toEqual({ ok: 1, n: 2 });
  });

  it("scores review recall over the last 30 days", () => {
    let p = recordGrade(emptyProgress(), "cat", "meaning", Rating.Good, t0, 1500);
    p = recordGrade(p, "cat", "meaning", Rating.Again, t0 + 8 * DAY, 2000);
    p = recordGrade(p, "cat", "meaning", Rating.Good, t0 + 9 * DAY, 2000);
    expect(effect(p, t0 + 9 * DAY).recall).toEqual({ ok: 1, n: 2 });
  });

  it("estimates minutes a day from answer times", () => {
    let p = emptyProgress();
    for (let i = 0; i < 30; i++) p = recordGrade(p, "w0", "meaning", Rating.Good, t0 + i, 6000);
    expect(effect(p, t0).minutes).toBe(6); // 30 × (6 s + 4 s answer card) + 30 s for the one new word
  });
});

describe("check-ups and stories", () => {
  const met = (n: number, at: number) => {
    let p = emptyProgress();
    for (let i = 0; i < n; i++) p = recordGrade(p, `w${i}`, "meaning", Rating.Good, at);
    return p;
  };

  it("offers a check-up a month after starting, once there are enough old words to sample", () => {
    expect(checkupWords(met(50, t0), t0 + 10 * DAY)).toEqual([]);
    expect(checkupWords(met(50, t0), t0 + 30 * DAY)).toHaveLength(50);
    expect(checkupWords(met(10, t0), t0 + 30 * DAY)).toEqual([]);
    const done = recordCheckup(met(50, t0), { t: t0 + 30 * DAY, right: 15, total: 20 });
    expect(checkupWords(done, t0 + 40 * DAY)).toEqual([]);
    expect(checkupWords(done, t0 + 60 * DAY)).toHaveLength(50);
  });

  it("opens a story at 80% of its words and suggests rereading further apart each time", () => {
    const story = { needs: ["w0", "w1", "w2", "w3", "w4"] } as Story;
    expect(toOpen(story, met(3, t0).words)).toBe(1);
    expect(toOpen(story, met(4, t0).words)).toBe(0);
    expect(rereadDue({ reads: 1, best: 3, last: t0 }, t0 + 6 * DAY)).toBe(false);
    expect(rereadDue({ reads: 1, best: 3, last: t0 }, t0 + 7 * DAY)).toBe(true);
    expect(rereadDue({ reads: 2, best: 3, last: t0 }, t0 + 7 * DAY)).toBe(false);
    expect(rereadDue({ reads: 5, best: 3, last: t0 }, t0 + 60 * DAY)).toBe(true);
    expect(rereadDue(undefined, t0)).toBe(false);
  });
});
