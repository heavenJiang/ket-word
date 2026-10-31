/**
 * Read-aloud feedback: the browser's speech recogniser writes down what the child said, and each
 * word of the text counts as read when it is heard. This measures "said clearly enough to be
 * understood", not phonetics; it needs a recogniser (Safari on iPad, Chrome on Android) and, on most
 * devices, the network. Without one the child still records and plays back, unscored.
 */
import type { Accent } from "../types";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

const Ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canScore = () => typeof window !== "undefined" && Ctor() !== null;

/**
 * Listen until the child stops talking; `done` gets every transcript the recogniser offers (best
 * first), or null when it could not listen (no network, no permission). Returns a stop function.
 */
export function listen(accent: Accent, done: (heard: string[] | null) => void): () => void {
  const C = Ctor();
  if (!C) {
    done(null);
    return () => {};
  }
  const r = new C();
  r.lang = accent === "uk" ? "en-GB" : "en-US";
  r.continuous = false; // stops by itself when the child stops talking
  r.interimResults = false;
  r.maxAlternatives = 5;
  let heard: string[] = [];
  let failed = false;
  r.onresult = (e) => {
    heard = [];
    // join the final pieces of each alternative across result chunks
    const n = e.results.length;
    for (let k = 0; k < 5; k++) {
      const parts: string[] = [];
      for (let i = 0; i < n; i++) if (e.results[i][k]) parts.push(e.results[i][k].transcript);
      if (parts.length) heard.push(parts.join(" "));
    }
  };
  r.onerror = (e) => {
    // "no-speech" just means nothing was heard: score it as such; anything else means no scoring
    if (e.error !== "no-speech" && e.error !== "aborted") failed = true;
  };
  r.onend = () => done(failed ? null : heard);
  try {
    r.start();
  } catch {
    done(null);
    return () => {};
  }
  return () => r.stop();
}

const NUMBERS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const SAME: Record<string, string> = { mom: "mum", color: "colour", favorite: "favourite", gray: "grey", center: "centre", theater: "theatre", meter: "metre", okay: "ok", alright: "allright" };

/** The words of a text, lower-case, with digits spelled out and US spellings made British. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b(\d{1,2})\b/g, (_, d) => NUMBERS[Number(d)] ?? d)
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((w) => SAME[w] ?? w);
}

function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  // one letter off: a recogniser's spelling slip, not a different word
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

/** One letter added, dropped or changed. */
function oneOff(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

/** Which words of `target` appear, in order, in `heard`: the longest common run, words compared loosely. */
function matched(target: string[], heard: string[]): boolean[] {
  const t = target.length;
  const h = heard.length;
  const L = Array.from({ length: t + 1 }, () => new Array<number>(h + 1).fill(0));
  for (let i = t - 1; i >= 0; i--)
    for (let j = h - 1; j >= 0; j--) L[i][j] = near(target[i], heard[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Array<boolean>(t).fill(false);
  let i = 0;
  let j = 0;
  while (i < t && j < h) {
    if (near(target[i], heard[j])) {
      ok[i] = true;
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return ok;
}

export interface Score {
  /** 0–3: 3 almost every word, 2 most, 1 some, 0 hardly any. */
  stars: 0 | 1 | 2 | 3;
  /** Each word of the text as written, and whether it was heard. */
  words: { w: string; ok: boolean }[];
}

/** Score a reading of `text` from the recogniser's transcripts, taking the kindest one. */
export function score(text: string, heard: string[]): Score {
  const shown = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const target = shown.map((w) => words(w).join(""));
  let best = new Array<boolean>(target.length).fill(false);
  for (const h of heard) {
    const ok = matched(target, words(h).flatMap((w) => [w]));
    if (ok.filter(Boolean).length > best.filter(Boolean).length) best = ok;
  }
  if (target.length === 1) {
    // one word alone is often written as a sound-alike (bee → "be", two → "to"): a letter off still counts,
    // and saying something at all is worth a star
    const said = heard.flatMap(words);
    const ok = said.some((w) => w === target[0] || oneOff(w, target[0]));
    return { stars: ok ? 3 : said.length ? 1 : 0, words: [{ w: shown[0], ok }] };
  }
  const share = target.length ? best.filter(Boolean).length / target.length : 0;
  const stars = share >= 0.9 ? 3 : share >= 0.7 ? 2 : share >= 0.4 ? 1 : 0;
  return { stars, words: shown.map((w, i) => ({ w, ok: best[i] })) };
}
