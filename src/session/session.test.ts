import { describe, expect, it } from "vitest";
import { Rating, review, unlockedSkills, type CardState, type WordProgress } from "../srs/srs";
import { buildPlan } from "./plan";
import { distractors } from "../lib/choice";
import type { Word } from "../types";
import { answer, buildSession, current, groupOpen, keyOf, kindFor, MAX_RETRIES, RECALL_GAP, RETRY_GAP, spreadOut, type Session } from "./session";

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

  it("brings back newly unlocked skills and due words before new ones, one question per word a day", () => {
    const next = buildPlan(order, learned(["w0", "w1"]), t0 + DAY, opt);
    expect(next.reviews).toEqual([{ wordId: "w0", skill: "listen" }, { wordId: "w1", skill: "listen" }]);
    expect(next.newWords[0]).toBe("w2");
    // a good first answer comes back three days later; listening, never heard yet, comes first and the
    // meaning (not late yet) waits a day, then wins as it is late
    const later = buildPlan(order, learned(["w0", "w1"]), t0 + 3 * DAY, opt);
    expect(later.reviews.map((t) => t.skill)).toEqual(["listen", "listen"]);
    const late = buildPlan(order, learned(["w0", "w1"]), t0 + 5 * DAY, opt);
    expect(late.reviews.map((t) => t.skill)).toEqual(["meaning", "meaning"]);
  });

  it("never asks a word twice in a day, and counts anything due before midnight as today's", () => {
    const words = learned(["w0"]);
    words.w0.skills.listen = { ...words.w0.skills.meaning!, due: t0 + 30 * DAY };
    words.w0.skills.spell = { ...words.w0.skills.meaning!, due: t0 + 30 * DAY };
    const due = words.w0.skills.meaning!.due;
    const morning = new Date(due).setHours(7, 0, 0, 0);
    expect(buildPlan(order, words, morning, opt).reviews).toEqual([{ wordId: "w0", skill: "meaning" }]);
    expect(buildPlan(order, learned(["w0"], t0), t0 + 60_000, opt).reviews).toEqual([]);
  });

  it("waits until tomorrow before practising a skill unlocked today", () => {
    const p = buildPlan(order, learned(["w0"]), t0 + 60_000, opt);
    expect(p.reviews.some((t) => t.skill === "listen")).toBe(false);
    // spelling waits for the day after the word was first heard
    const words = learned(["w0"]);
    words.w0.skills.listen = review(undefined, Rating.Good, t0 + DAY);
    expect(buildPlan(order, words, t0 + DAY + 60_000, opt).reviews).toEqual([]);
    expect(buildPlan(order, words, t0 + 2 * DAY, opt).reviews).toEqual([{ wordId: "w0", skill: "spell" }]);
  });

  it("counts reviews done earlier today toward the cap", () => {
    const p = buildPlan(order, learned(order.slice(0, 18)), t0 + 3 * DAY, { ...opt, reviewCap: 10, reviewedToday: 10 });
    expect(p.reviews).toEqual([]);
    expect(p.newWords).toEqual([]);
  });

  it("caps reviews and pauses new words while more than half a day's reviews wait", () => {
    const p = buildPlan(order, learned(order.slice(0, 18)), t0 + 3 * DAY, { ...opt, reviewCap: 10 });
    expect(p.reviews).toHaveLength(10);
    expect(p.backlog).toBeGreaterThan(5);
    expect(p.newWords).toEqual([]);
  });

  it("keeps adding new words while only a few reviews wait", () => {
    const p = buildPlan(order, learned(order.slice(0, 6)), t0 + 3 * DAY, { ...opt, reviewCap: 4 });
    expect(p.backlog).toBeGreaterThan(0);
    expect(p.backlog).toBeLessThanOrEqual(2);
    expect(p.newWords).toHaveLength(8);
  });

  it("spells only the words that are spelled", () => {
    const m = review(undefined, Rating.Good, t0);
    const word: WordProgress = { seen: t0, skills: { meaning: m, listen: review(undefined, Rating.Good, t0 + DAY) } };
    expect(unlockedSkills(word, true)).toContain("spell");
    expect(unlockedSkills(word, false)).not.toContain("spell");
  });

  it("near the exam, spends spare time on what would be weakest on the day", () => {
    const words = learned(order.slice(0, 4));
    const day = t0 + DAY + 3_600_000;
    const due = buildPlan(order.slice(0, 4), words, day, { ...opt, newPerDay: 0 }).reviews.length;
    const exam = buildPlan(order.slice(0, 4), words, day, { ...opt, newPerDay: 0, examAt: day + 60 * DAY }).reviews.length;
    expect(exam).toBeGreaterThanOrEqual(due);
  });
});

describe("one more group", () => {
  it("adds that many new words once the day's are done, and caps the day at twice the plan", async () => {
    const { todayPlan, extraCap } = await import("./today");
    const { emptyProgress, recordGrade } = await import("../store/progress");
    const words = order.map((id) => ({ id, word: id, zh: id, pos: [], ipa: "", chunks: [id], emoji: "", sentence: { en: "", zh: "" }, media: {} }) as Word);
    const library = { topics: { t: words }, byId: new Map(words.map((w) => [w.id, w])), poolOf: new Map(), all: words };
    const topics = [{ id: "t", en: "t", zh: "t", count: 20, ready: true }];
    const base = emptyProgress();
    let p = { ...base, topic: "t", settings: { ...base.settings, newPerDay: 8 } };
    for (const id of order.slice(0, 8)) p = recordGrade(p, id, "meaning", Rating.Good, t0);
    expect(todayPlan(library, topics, p, t0 + 60_000).newWords).toEqual([]);
    expect(todayPlan(library, topics, p, t0 + 60_000, 4).newWords).toEqual(order.slice(8, 12));
    expect(extraCap(8)).toBe(16);
  });
});

describe("session", () => {
  it("teaches each group of new words early, with a few reviews before its scored recall", () => {
    const words = learned(order.slice(10, 20));
    const plan = buildPlan(order, words, t0 + 3 * DAY, { ...opt, newPerDay: 6 });
    const s = buildSession(plan, words, seq());
    const kinds = s.steps.map((x) => (x.type === "q" ? (x.graded ? (order.slice(0, 6).includes(x.wordId) ? "recall" : "review") : "practice") : x.type));
    expect(kinds.slice(0, 6)).toEqual(["intro", "match", "practice", "practice", "practice", "practice"]);
    expect(kinds.slice(6, 6 + RECALL_GAP)).toEqual(Array(RECALL_GAP).fill("review"));
    expect(kinds.slice(6 + RECALL_GAP, 10 + RECALL_GAP)).toEqual(["recall", "recall", "recall", "recall"]);
    expect(kinds[10 + RECALL_GAP]).toBe("intro");
    expect(kinds.filter((k) => k === "recall")).toHaveLength(6);
  });

  it("keeps a group of new words open until it is recalled, so a break never loses it", () => {
    const s = buildSession(buildPlan(order, {}, t0, { ...opt, newPerDay: 4 }), {}, seq());
    expect(groupOpen({ ...s, index: 0 })).toBe(false);
    expect(groupOpen({ ...s, index: 3 })).toBe(true);
    const done = { ...s, index: s.steps.length, answered: order.slice(0, 4).map((id) => keyOf(id, "meaning")) };
    expect(groupOpen(done)).toBe(false);
  });

  it("grades only the first answer and retries wrong ones later with another question type", () => {
    let s = buildSession(buildPlan(order, {}, t0, { ...opt, newPerDay: 4 }), {}, seq());
    s = { ...s, index: s.steps.length - 4 }; // the scored recall at the end
    const first = current(s)!;
    const r = answer(s, false, {});
    expect(r.grade).toBe(true);
    const retry = r.session.steps.find((x, i) => i > s.index && x.type === "q" && x.retry === 1)!;
    expect(retry).toMatchObject({ type: "q", graded: false, retry: 1, kind: "pickImage" });
    expect(first.type === "q" && retry.type === "q" && retry.wordId === first.wordId).toBe(true);
    expect(RETRY_GAP).toBeGreaterThan(0);
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

  it("asks harder as a meaning gets stronger: picture, then Chinese meaning, then the English word", () => {
    const card = (s: number) => ({ ...review(undefined, Rating.Good, t0), s });
    expect(kindFor("meaning", undefined)).toBe("pickImage");
    expect(kindFor("meaning", card(5))).toBe("pickMeaning");
    expect(kindFor("meaning", card(12))).toBe("pickWord");
    expect(kindFor("spell", undefined)).toBe("tiles");
  });

  it("retries until right, each retry easier, and only the first answer counts", () => {
    let s: Session = { steps: [{ type: "q", wordId: "w0", skill: "meaning", kind: "pickWord", graded: true, retry: 0 }], index: 0, answered: [] };
    const card = { w0: { seen: t0, skills: { meaning: { ...review(undefined, Rating.Good, t0), s: 12 } } } };
    const kinds: string[] = [];
    for (let i = 0; i < 2; i++) {
      s = answer(s, false, card).session;
      kinds.push(s.steps[s.index].type === "q" ? (s.steps[s.index] as { kind: string }).kind : "");
    }
    expect(kinds).toEqual(["pickImage", "pickImage"]);
    const r = answer(s, true, card);
    expect(r.grade).toBe(false);
    expect(r.session.steps).toHaveLength(3); // right on the second retry: no more retries
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
    const middling = { s: 5 } as CardState;
    expect(kindFor("meaning", weak, 0, { gap: true, roll: 0.1 })).toBe("pickImage");
    expect(kindFor("meaning", familiar, 0, { gap: true, roll: 0.1 })).toBe("cloze");
    expect(kindFor("meaning", familiar, 0, { gap: true, roll: 0.9 })).toBe("pickWord");
    expect(kindFor("meaning", middling, 0, { gap: true, roll: 0.9 })).toBe("pickMeaning");
    expect(kindFor("meaning", familiar, 0, { gap: false, roll: 0.1 })).toBe("pickWord");
    expect(kindFor("meaning", familiar, 1, { gap: true, roll: 0.1 })).toBe("pickImage");
    expect(kindFor("listen", familiar, 0, { roll: 0.1 })).toBe("listenSentence");
    expect(kindFor("listen", weak, 0, { roll: 0.1 })).toBe("listenPick");
    expect(kindFor("listen", familiar, 1, { roll: 0.1 })).toBe("listenPick");
  });

  it("keeps a second meaning back until the word's first meaning is learnt", () => {
    const words = ["can", "can.2", "cup"];
    const gate = (learnt: boolean) => (id: string) => id !== "can.2" || learnt;
    expect(buildPlan(words, {}, t0, opt, words, gate(false)).newWords).toEqual(["can", "cup"]);
    expect(buildPlan(words, {}, t0, opt, words, gate(true)).newWords).toEqual(["can", "can.2", "cup"]);
  });
});

describe("graduation", () => {
  const strong = (s: number, dueAgo: number): Record<string, WordProgress> => {
    const c = { ...review(undefined, Rating.Good, t0), st: 2 as const, s, due: t0 - dueAgo * DAY, last: t0 - (s + dueAgo) * DAY };
    return { w0: { seen: t0 - 400 * DAY, skills: { meaning: c, listen: c } } };
  };

  it("leaves a card strong for half a year out of the daily reviews", () => {
    const noSpell = () => false;
    expect(buildPlan(["w0"], strong(60, 1), t0, { ...opt, newPerDay: 0 }, undefined, undefined, noSpell).reviews).toHaveLength(1);
    expect(buildPlan(["w0"], strong(200, 1), t0, { ...opt, newPerDay: 0 }, undefined, undefined, noSpell).reviews).toHaveLength(0);
  });

  it("brings a graduated card back for the exam sprint when it would be weak on the day", () => {
    const plan = buildPlan(["w0"], strong(200, 1), t0, { ...opt, newPerDay: 0, examAt: t0 + 400 * DAY });
    expect(plan.reviews).toHaveLength(1);
  });
});

describe("rounds and leaving", () => {
  it("ends a round after ROUND questions, but not inside an open group nor just before the day ends", async () => {
    const { ROUND, roundEnds, openWords, questionsLeft } = await import("./session");
    // 4 new words, then plenty of reviews: 4 practice + 6 reviews + 4 recall + the rest
    const reviews = Array.from({ length: 30 }, (_, i) => ({ wordId: `r${i}`, skill: "meaning" as const }));
    const s = buildSession({ reviews, newWords: ["a", "b", "c", "d"], backlog: 0 }, {}, seq());
    const recallStart = s.steps.findIndex((x) => x.type === "q" && x.graded && "abcd".includes(x.wordId));
    // inside the group (met, not recalled): never a break, and leaving would drop the four words
    const inGroup = { ...s, index: recallStart };
    expect(openWords(inGroup).sort()).toEqual(["a", "b", "c", "d"]);
    expect(roundEnds(ROUND, inGroup)).toBe(false);
    // the group recalled: a round may end
    const after = { ...s, index: recallStart + 4, answered: ["a", "b", "c", "d"].map((id) => keyOf(id, "meaning")) };
    expect(openWords(after)).toEqual([]);
    expect(roundEnds(ROUND, after)).toBe(true);
    expect(roundEnds(ROUND - 1, after)).toBe(false);
    // fewer than half a round left: finish the day instead
    const nearEnd = { ...after, index: s.steps.length - 2 };
    expect(questionsLeft(nearEnd)).toBe(2);
    expect(roundEnds(ROUND, nearEnd)).toBe(false);
  });
});
