import { describe, expect, it } from "vitest";
import type { Word } from "../types";
import { caption, distractors, meanings } from "./choice";

const w = (id: string, zh: string): Word =>
  ({ id, word: id, zh, pos: ["adv"], ipa: "", chunks: [id], emoji: "", sentence: { en: "", zh: "" }, media: {} }) as Word;

describe("meanings", () => {
  it("splits the gloss and drops bracketed notes", () => {
    expect([...meanings(w("her", "她的；她（宾格）"))]).toEqual(["她的", "她"]);
  });
});

describe("caption", () => {
  it("is the first meaning of the gloss, with its note", () => {
    expect(caption(w("building", "建筑物；楼房"))).toBe("建筑物");
    expect(caption(w("her", "她（宾格）；她的"))).toBe("她（宾格）");
    expect(caption(w("cat", "猫"))).toBe("猫");
  });
});

describe("distractors", () => {
  const maybe = w("maybe", "也许；大概");
  const pool = [maybe, w("perhaps", "也许；可能"), w("thanks", "谢谢"), w("hello", "你好"), w("sorry", "对不起"), w("yes", "是")];

  it("never offers a word that shares a meaning, which would be a second right answer", () => {
    for (let i = 0; i < 20; i++) {
      expect(distractors(maybe, pool, 3, Math.random).map((x) => x.id)).not.toContain("perhaps");
    }
  });

  it("keeps such words when the child only tells sounds apart", () => {
    const ids = distractors(maybe, pool, 5, Math.random, true).map((x) => x.id);
    expect(ids).toContain("perhaps");
  });
});
