import type { Word } from "../types";

/**
 * Words matching a search, best first: an exact English word, then words starting with it, then containing it;
 * Chinese finds words whose meaning contains it, shortest meaning first.
 */
export function searchWords(words: Word[], raw: string, limit = 60): Word[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const zh = /[\u4e00-\u9fff]/.test(q);
  const hits: [number, Word][] = [];
  for (const w of words) {
    let score = 0;
    if (zh) {
      const i = w.zh.indexOf(q);
      if (i >= 0) score = 100 - Math.min(40, i) - w.zh.length;
    } else {
      const word = w.word.toLowerCase();
      if (word === q) score = 1000;
      else if (word.startsWith(q)) score = 500 - word.length;
      else if (word.includes(q)) score = 200 - word.indexOf(q) - word.length;
    }
    if (score > 0) hits.push([score, w]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map((h) => h[1]);
}
