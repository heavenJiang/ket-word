import { describe, expect, it } from "vitest";
import type { Word } from "../types";
import { searchWords } from "./search";

const w = (word: string, zh: string) => ({ id: word, word, zh }) as Word;
const words = [w("catch", "接住；赶上"), w("cat", "猫"), w("bobcat", "山猫"), w("dog", "狗")];

describe("searchWords", () => {
  it("puts the exact word first, then words starting with it, then words containing it", () => {
    expect(searchWords(words, "Cat ").map((x) => x.word)).toEqual(["cat", "catch", "bobcat"]);
  });
  it("finds Chinese in the meaning", () => {
    expect(searchWords(words, "猫").map((x) => x.word)).toEqual(["cat", "bobcat"]);
  });
  it("finds nothing for an empty query", () => {
    expect(searchWords(words, "  ")).toEqual([]);
  });
});
