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
