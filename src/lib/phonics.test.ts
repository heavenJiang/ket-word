import { describe, expect, it } from "vitest";
import { phonics, type Sound } from "./phonics";

/** Write a word back in the exceptions notation, so expectations read like the word. */
const show = (w: string) => {
  const cls = phonics(w);
  const open: Record<Sound, string> = { silent: "(", team: "[", r: "{", pair: "<" };
  const close: Record<Sound, string> = { silent: ")", team: "]", r: "}", pair: ">" };
  const letters = w.toLowerCase().replace(/[^a-z]/g, "");
  let out = "";
  for (let i = 0; i < letters.length; i++) {
    const c = cls[i];
    if (c && cls[i - 1] !== c) out += open[c];
    out += letters[i];
    if (c && cls[i + 1] !== c) out += close[c];
  }
  return out;
};

describe("phonics", () => {
  it("marks vowel teams, r-controlled vowels, consonant pairs and silent letters", () => {
    expect(show("rain")).toBe("r[ai]n");
    expect(show("night")).toBe("n[igh]t");
    expect(show("teacher")).toBe("t[ea]<ch>{er}");
    expect(show("bird")).toBe("b{ir}d");
    expect(show("bear")).toBe("b{ear}");
    expect(show("ship")).toBe("<sh>ip");
    expect(show("cake")).toBe("cak(e)");
    expect(show("knife")).toBe("(k)nif(e)");
    expect(show("lamb")).toBe("lam(b)");
    expect(show("careful")).toBe("c{ar}(e)ful");
    expect(show("there")).toBe("<th>{er}(e)");
  });

  it("leaves letters alone where the pattern does not hold", () => {
    expect(show("the")).toBe("<th>e");
    expect(show("very")).toBe("very");
    expect(show("carrot")).toBe("carrot");
    expect(show("parent")).toBe("parent");
    expect(show("scared")).toBe("sc{ar}(e)d");
    expect(show("away")).toBe("aw[ay]");
    expect(show("orange")).toBe("orang(e)");
    expect(show("singing")).toBe("si<ng>i<ng>");
    expect(show("going")).toBe("goi<ng>");
    expect(show("go out")).toBe("go[ou]t"); // each word on its own: no "oo" across the space
  });

  it("uses the exceptions for words that break the rules", () => {
    expect(show("listen")).toBe("lis(t)en");
    expect(show("island")).toBe("i(s)land");
    expect(show("Wednesday")).toBe("we(d)n(e)sd[ay]");
  });

  it("gives one class per letter for every word in the list", () => {
    for (const w of ["ice cream", "T-shirt", "CD player", "o'clock"]) {
      expect(phonics(w)).toHaveLength(w.replace(/[^a-z]/gi, "").length);
    }
  });
});
