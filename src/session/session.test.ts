import { describe, expect, it } from "vitest";
import { Rating, review, type CardState, type WordProgress } from "../srs/srs";
import { buildPlan } from "./plan";
import { distractors } from "../lib/choice";
import type { Word } from "../types";
import { answer, buildSession, current, kindFor, MAX_RETRIES, RETRY_GAP, spreadOut, type Session } from "./session";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1, 8);
const opt = { newPerDay: 8, reviewCap: 30, retention: 0.9, newToday: 0, reviewedToday: 0 };
const order = Array.from({ length: 20 }, (_, i) => `w${i}`);
const learned = (ids: string[], at = t0): Record<string, WordProgress> =>
  Object.fromEntries(ids.map((id) => [id, { seen: at, skills: { meaning: review(undefined, Rating.Good, at) } }]));
const seq = () => {
  let x = 0.37;
  return () => (x = (x * 9301 + 49297) % 233280 / 233280);
};

describe("buildPlan", () => {
  it("starts with new words only", () => {
    const p = buildPlan(order, {}, t0, opt);
    expect(p.reviews).toEqual([]);
    expect(p.newWords).toEqual(order.slice(0, 8));
  });

  it("keeps reviewing words from other islands while taking new words from the current one", () => {
    const p = buildPlan(order, learned(["w0"]), t0 + DAY, opt, ["w10", "w11"]);
    expect(p.reviews.some((t) => t.wordId === "w0")).toBe(true);
    expect(p.newWords).toEqual(["w10", "w11"]);
  });

  it("counts new words already met today", () => {
    expect(buildPlan(order, {}, t0, { ...opt, newToday: 6 }).newWords).toHaveLength(2);
  });

  it("brings back due words, and newly unlocked skills, before new ones", () => {
    const p = buildPlan(order, learned(["w0", "w1"]), t0 + DAY, opt);
    expect(p.reviews.filter((t) => t.skill === "meaning").map((t) => t.wordId).sort()).toEqual(["w0", "w1"]);
    expect(p.reviews.some((t) => t.skill === "listen")).toBe(true);
    expect(p.newWords[0]).toBe("w2");
  });

  it("waits until tomorrow before practising a skill unlocked today", () => {
    const p = buildPlan(order, learned(["w0"]), t0 + 60_000, opt);
    expect(p.reviews.some((t) => t.skill === "listen")).toBe(false);
  });

  it("counts reviews done earlier today toward the cap", () => {
    const p = buildPlan(order, learned(order.slice(0, 18)), t0 + 3 * DAY, { ...opt, reviewCap: 10, reviewedToday: 10 });
    expect(p.reviews).toEqual([]);
    expect(p.newWords).toEqual([]);
  });

  it("caps reviews and pauses new words while catching up", () => {
    const p = buildPlan(order, learned(order.slice(0, 18)), t0 + 3 * DAY, { ...opt, reviewCap: 10 });
    expect(p.reviews).toHaveLength(10);
    expect(p.backlog).toBeGreaterThan(0);
    expect(p.newWords).toEqual([]);
  });
});

describe("session", () => {
  it("introduces new words in groups before quizzing them", () => {
    const s = buildSession(buildPlan(order, {}, t0, opt), {}, seq());
    expect(s.steps[0]).toEqual({ type: "intro", wordIds: ["w0", "w1", "w2", "w3"] });
    expect(s.steps[1]).toEqual({ type: "match", wordIds: ["w0", "w1", "w2", "w3"] });
    expect(s.steps.slice(2, 6).every((x) => x.type === "q" && x.kind === "pickImage")).toBe(true);
    expect(s.steps[6]).toMatchObject({ type: "intro" });
  });

  it("grades only the first answer and retries wrong ones later with another question type", () => {
    let s = buildSession(buildPlan(order, {}, t0, { ...opt, newPerDay: 4 }), {}, seq());
    s = { ...s, index: 2 }; // past the intro and the match game
    const first = current(s)!;
    const r = answer(s, false, {});
    expect(r.grade).toBe(true);
    const retry = r.session.steps[2 + 1 + RETRY_GAP];
    expect(retry).toMatchObject({ type: "q", graded: false, retry: 1, kind: "pickMeaning" });
    expect(first.type === "q" && retry.type === "q" && retry.wordId === first.wordId).toBe(true);
  });

  it("stops retrying after MAX_RETRIES", () => {
    let s: Session = { steps: [{ type: "q", wordId: "w0", skill: "meaning", kind: "pickImage", graded: true, retry: 0 }], index: 0, answered: [] };
    let grades = 0;
    while (s.index < s.steps.length) {
      const r = answer(s, false, {});
      if (r.grade) grades++;
      s = r.session;
    }
    expect(s.steps).toHaveLength(1 + MAX_RETRIES);
    expect(grades).toBe(1);
  });

  it("keeps the same word apart", () => {
    const xs = spreadOut([{ wordId: "a" }, { wordId: "a" }, { wordId: "b" }, { wordId: "c" }]);
    expect(xs.map((x) => x.wordId)).toEqual(["a", "b", "a", "c"]);
  });

  it("uses the picture question for weak meanings and the Chinese-meaning question for strong ones", () => {
    expect(kindFor("meaning", undefined)).toBe("pickImage");
    expect(kindFor("meaning", { ...review(undefined, Rating.Good, t0), s: 10 })).toBe("pickMeaning");
    expect(kindFor("spell", undefined)).toBe("tiles");
  });
});

describe("distractors", () => {
  const w = (id: string, avoid: string[] = []) =>
    ({ id, word: id, zh: id, pos: [], ipa: "", chunks: [id], emoji: "", sentence: { en: "", zh: "" }, media: {}, avoid }) as Word;
  it("never offers a confusable word as a wrong option", () => {
    const plate = w("plate", ["dish", "bowl"]);
    const pool = [plate, w("dish", ["plate", "bowl"]), w("bowl", ["plate", "dish"]), w("apple"), w("milk"), w("egg")];
    for (let i = 0; i < 20; i++) {
      expect(distractors(plate, pool, 3, Math.random).map((x) => x.id).sort()).toEqual(["apple", "egg", "milk"]);
    }
  });

  it("puts familiar words back in sentences for about half their questions", () => {
    const weak = { s: 1 } as CardState;
    const familiar = { s: 10 } as CardState;
    expect(kindFor("meaning", weak, 0, { gap: true, roll: 0.1 })).toBe("pickImage");
    expect(kindFor("meaning", familiar, 0, { gap: true, roll: 0.1 })).toBe("cloze");
    expect(kindFor("meaning", familiar, 0, { gap: true, roll: 0.9 })).toBe("pickMeaning");
    expect(kindFor("meaning", familiar, 0, { gap: false, roll: 0.1 })).toBe("pickMeaning");
    expect(kindFor("meaning", familiar, 1, { gap: true, roll: 0.1 })).toBe("pickImage");
    expect(kindFor("listen", familiar, 0, { roll: 0.1 })).toBe("listenSentence");
    expect(kindFor("listen", weak, 0, { roll: 0.1 })).toBe("listenPick");
    expect(kindFor("listen", familiar, 1, { roll: 0.1 })).toBe("listenPick");
  });
});
