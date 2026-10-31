import type { Word } from "../types";

export function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Wrong options for a multiple-choice question. "similar" prefers words that look alike;
 * "samePos" prefers the same part of speech, so a gap in a sentence gets grammatical options;
 * "exclude" drops words that would also be right (e.g. mentioned elsewhere in the sentence).
 */
export function distractors(
  target: Word,
  pool: Word[],
  n: number,
  rng: () => number,
  similar = false,
  opt: { samePos?: boolean; exclude?: string[] } = {},
): Word[] {
  const others = pool.filter(
    (w) =>
      w.id !== target.id &&
      w.zh !== target.zh &&
      !target.avoid?.includes(w.id) &&
      !w.avoid?.includes(target.id) &&
      !opt.exclude?.includes(w.id),
  );
  const pos = (w: Word) => (opt.samePos && !w.pos.some((p) => target.pos.includes(p)) ? 10 : 0);
  const scored = others.map((w) => ({
    w,
    score: pos(w) + (similar ? editDistance(w.word, target.word) : 0) + rng() * (similar ? 1.5 : 1),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, n).map((s) => s.w);
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
