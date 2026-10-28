import { describe, expect, it } from "vitest";
import { findWord, gapSentences, mentioned, splitAt } from "./sentence";
import type { Word } from "../types";

const word = (id: string, en: string[]): Word => ({
  id, word: id.replace("-", " "), zh: "", pos: ["n"], ipa: "", chunks: [id], emoji: "", media: {},
  sentence: { en: en[0], zh: "" }, sentences: en.map((e) => ({ en: e, zh: "" })),
});

describe("sentences", () => {
  it("finds the word itself only, not longer words or plurals", () => {
    expect(findWord("Lily eats a carrot.", "carrot")).toEqual({ start: 12, end: 18 });
    expect(findWord("Rabbits like carrots.", "carrot")).toBeNull();
    expect(findWord("Ice cream is cold.", "ice")).toEqual({ start: 0, end: 3 });
    expect(findWord("I like ice-cream.", "ice")).toBeNull();
    expect(findWord("I'd like some mineral water.", "mineral water")).not.toBeNull();
  });

  it("splits a sentence around the gap, keeping the original case", () => {
    expect(splitAt("Bees make honey.", "bee")).toBeNull();
    expect(splitAt("A bee is on the flower.", "bee")).toEqual(["A ", "bee", " is on the flower."]);
    expect(splitAt("Garlic is good.", "garlic")).toEqual(["", "Garlic", " is good."]);
  });

  it("keeps only sentences that can have a gap, and spots other pool words in them", () => {
    const carrot = word("carrot", ["Rabbits like carrots.", "The rabbit is eating a carrot."]);
    expect(gapSentences(carrot).map((s) => s.en)).toEqual(["The rabbit is eating a carrot."]);
    const rabbit = word("rabbit", ["A rabbit can jump."]);
    expect(mentioned("The rabbit is eating a carrot.", [carrot, rabbit])).toEqual(["carrot", "rabbit"]);
  });
});
