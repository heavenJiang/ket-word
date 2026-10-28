import type { Accent, Word } from "../types";

const base = import.meta.env.BASE_URL;
let current: HTMLAudioElement | null = null;

function stop() {
  current?.pause();
  current = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** Read text aloud with the browser's voice; used for sentences and words without a recording. */
export function speak(text: string, accent: Accent = "uk", rate = 0.85): void {
  if (!("speechSynthesis" in window)) return;
  stop();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  u.rate = rate;
  const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang);
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/**
 * Play the word's recording in the chosen accent, falling back to the other accent, then TTS.
 * `slow` plays it at 70% speed (pitch kept), so a child can hear each sound.
 */
export function playWord(w: Word, accent: Accent, slow = false): void {
  const rate = slow ? 0.55 : 0.8;
  const src = w.media[accent] ?? w.media[accent === "uk" ? "us" : "uk"];
  if (!src) return speak(w.word, accent, rate);
  stop();
  current = new Audio(base + src);
  if (slow) current.playbackRate = 0.7;
  current.play().catch(() => speak(w.word, accent, rate));
}

export function playSentence(w: Word, accent: Accent): void {
  speak(w.sentence.en, accent, 0.8);
}

/** Read any sentence aloud; `slow` for a second, clearer listen. */
export function playText(text: string, accent: Accent, slow = false): void {
  speak(text, accent, slow ? 0.6 : 0.8);
}

let ctx: AudioContext | null = null;

/** Tiny synthesized sound effects, so the app needs no sound assets. */
export function sfx(kind: "right" | "wrong" | "tap" | "done", enabled = true): void {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    const notes: Record<typeof kind, [number, number][]> = {
      right: [[660, 0], [880, 0.09]],
      wrong: [[220, 0], [196, 0.12]],
      tap: [[520, 0]],
      done: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]],
    };
    for (const [freq, at] of notes[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === "wrong" ? "triangle" : "sine";
      o.frequency.value = freq;
      const t = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
    }
  } catch {
    // audio not available: stay silent
  }
}
