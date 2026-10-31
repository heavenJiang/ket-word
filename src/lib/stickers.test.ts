import { describe, expect, it } from "vitest";
import { emptyProgress, recordGrade, type Progress } from "../store/progress";
import { Rating } from "../srs/srs";
import type { Word } from "../types";
import { isEarned, newlyEarned, stickers, type StickerWorld } from "./stickers";

const word = (id: string): Word => ({ id, word: id, zh: id, pos: ["n"], ipa: "", chunks: [id], emoji: "", sentence: { en: "", zh: "" }, media: {} });
const words = Array.from({ length: 12 }, (_, i) => word(`w${i}`));
const day = 86_400_000;
const t0 = Date.UTC(2026, 9, 1, 9);
const world = (progress: Progress, now = t0): StickerWorld => ({
  progress, words, topics: [{ id: "animals", en: "Animals", zh: "动物", count: 12, ready: true }], byTopic: { animals: words }, stories: [], now,
});
const byId = (w: StickerWorld) => Object.fromEntries(stickers(w).map((s) => [s.id, s]));

describe("stickers", () => {
  it("counts words met towards the word stickers", () => {
    let p = emptyProgress();
    for (const w of words.slice(0, 10)) p = recordGrade(p, w.id, "meaning", Rating.Good, t0);
    const s = byId(world(p));
    expect(isEarned(s["words-1"])).toBe(true);
    expect(isEarned(s["words-10"])).toBe(true);
    expect(s["words-50"].progress).toEqual([10, 50]);
  });

  it("keeps the longest streak even after a missed day", () => {
    let p = emptyProgress();
    for (let d = 0; d < 3; d++) p = recordGrade(p, "w0", "meaning", Rating.Good, t0 + d * day);
    expect(p.records.streak).toBe(3);
    const later = byId(world(p, t0 + 10 * day)); // the streak is broken by now
    expect(isEarned(later["streak-3"])).toBe(true);
  });

  it("gives each sticker once", () => {
    let p = emptyProgress();
    p = recordGrade(p, "w0", "meaning", Rating.Good, t0);
    const fresh = newlyEarned(stickers(world(p)), p.stickers).map((s) => s.id);
    expect(fresh).toEqual(["words-1"]);
    expect(newlyEarned(stickers(world(p)), { "words-1": t0 })).toEqual([]);
  });
});
