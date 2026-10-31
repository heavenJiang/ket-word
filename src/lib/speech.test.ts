import { describe, expect, it } from "vitest";
import { score, words } from "./speech";

describe("read-aloud score", () => {
  it("gives three stars when every word is heard, whatever the recogniser's spelling", () => {
    const s = score("Mum has 2 cats.", ["mom has two cats"]);
    expect(s.stars).toBe(3);
    expect(s.words.every((w) => w.ok)).toBe(true);
  });

  it("marks the words that were not heard, and gives fewer stars", () => {
    const s = score("The elephant drinks water with its long nose.", ["the elephant drinks water with nose"]);
    expect(s.words.filter((w) => !w.ok).map((w) => w.w)).toEqual(["its", "long"]);
    expect(s.stars).toBe(2);
  });

  it("takes the best of the recogniser's guesses and forgives a one-letter slip", () => {
    expect(score("giraffe", ["draft", "giraff"]).stars).toBe(3);
    expect(score("A bee is on the flower.", ["hello there"]).stars).toBe(0);
    expect(score("A bee is on the flower.", []).stars).toBe(0);
  });

  it("is kind to a single word heard as a sound-alike, and gives a star for trying", () => {
    expect(score("bee", ["be"]).stars).toBe(3);
    expect(score("two", ["to", "too"]).stars).toBe(3);
    expect(score("elephant", ["hello"]).stars).toBe(1);
    expect(score("elephant", []).stars).toBe(0);
  });

  it("reads digits as words and keeps apostrophes", () => {
    expect(words("I can't count to 10!")).toEqual(["i", "can't", "count", "to", "ten"]);
  });
});
