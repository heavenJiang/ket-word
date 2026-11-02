import { describe, expect, it } from "vitest";
import { emptyProgress, recordStory, STORY_STARS } from "./progress";

describe("stories", () => {
  it("gives stars the first time a story is finished, and keeps the best score", () => {
    const t = Date.UTC(2026, 9, 28, 9);
    let p = recordStory(emptyProgress(), "zoo-day", 2, t);
    expect(p.stars).toBe(STORY_STARS + 2);
    expect(p.stories["zoo-day"]).toEqual({ reads: 1, best: 2, last: t });
    p = recordStory(p, "zoo-day", 3, t + 1000);
    expect(p.stars).toBe(STORY_STARS + 2); // reading again is for fun, not for stars
    expect(p.stories["zoo-day"]).toMatchObject({ reads: 2, best: 3 });
  });
});

describe("check-up misses", () => {
  it("bring a graduated word back without counting as a timed review", async () => {
    const { CHECKUP_MISS, recordGrade, ungraduate, dayKey } = await import("./progress");
    const { GRADUATE_S, Rating } = await import("../srs/srs");
    const { effect } = await import("../lib/effect");
    const { secsPerReview } = await import("../session/goal");
    const t = Date.UTC(2026, 9, 28, 9);
    let p = recordGrade(emptyProgress(), "cat", "meaning", Rating.Good, t, 3000);
    p = { ...p, words: { cat: { ...p.words.cat, skills: { meaning: { ...p.words.cat.skills.meaning!, st: 2, s: GRADUATE_S + 10 } } } } };
    const later = t + 200 * 86_400_000;
    const q = ungraduate(p, "cat", later);
    expect(q.words.cat.skills.meaning!.lapses).toBe(1);
    expect(q.log!.at(-1)![5]).toBe(CHECKUP_MISS);
    expect(q.days[dayKey(later)]).toBeUndefined(); // not a review answered that day
    expect(q.stars).toBe(p.stars);
    expect(effect(q, later).recall.n).toBe(0);
    expect(secsPerReview(q)).toBe(secsPerReview(p));
  });
});

describe("storage", () => {
  const fakeStorage = (init: Record<string, string> = {}, quota = Infinity) => {
    const m = new Map(Object.entries(init));
    const used = () => [...m.values()].reduce((a, v) => a + v.length, 0);
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (used() - (m.get(k)?.length ?? 0) + v.length > quota) throw new Error("QuotaExceededError");
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const fresh = async (s: ReturnType<typeof fakeStorage>) => {
    (globalThis as { localStorage?: unknown }).localStorage = s;
    const { vi } = await import("vitest");
    vi.resetModules();
    return import("./progress");
  };

  it("keeps an unreadable progress aside instead of overwriting it", async () => {
    const s = fakeStorage({ "ket-word:progress": "{broken" });
    const m = await fresh(s);
    expect(m.loadProgress().words).toEqual({});
    expect(m.unreadableProgress()).toBe("{broken");
    expect(m.saveProgress(m.emptyProgress())).toBe(true);
    expect(s.m.get("ket-word:progress-unreadable")).toBe("{broken");
    m.dropUnreadableProgress();
    expect(m.unreadableProgress()).toBeNull();
  });

  it("does not overwrite the only copy when there is no room to keep it aside", async () => {
    const s = fakeStorage({ "ket-word:progress": "{broken" }, 10);
    const m = await fresh(s);
    m.loadProgress();
    expect(m.unreadableProgress()).toBe("{broken");
    expect(m.saveProgress(m.emptyProgress())).toBe(false);
    expect(s.m.get("ket-word:progress")).toBe("{broken");
  });

  it("says when a save fails", async () => {
    const m = await fresh(fakeStorage({}, 10));
    expect(m.saveProgress(m.emptyProgress())).toBe(false);
  });
});
