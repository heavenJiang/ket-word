import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ISLAND_COVER } from "./islands";

const index = JSON.parse(readFileSync("public/data/index.json", "utf8")) as { topics: { id: string; ready: boolean }[] };
const pictured = new Set<string>();
for (const t of index.topics.filter((t) => t.ready)) {
  for (const w of JSON.parse(readFileSync(`public/data/topics/${t.id}.json`, "utf8")).words) if (w.media.img) pictured.add(w.id);
}

describe("island covers", () => {
  it("give every open island a word that has a picture", () => {
    for (const t of index.topics.filter((t) => t.ready)) {
      expect(ISLAND_COVER[t.id], t.id).toBeDefined();
      expect(pictured.has(ISLAND_COVER[t.id]), `${t.id}: ${ISLAND_COVER[t.id]}`).toBe(true);
    }
  });
});
