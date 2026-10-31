import { review, type Grade, Rating, type WordProgress } from "../srs/srs";
import type { Accent, Skill } from "../types";

export interface Settings {
  newPerDay: number;
  reviewCap: number;
  retention: number;
  accent: Accent;
  sound: boolean;
}

export interface Profile {
  name: string;
  age: number;
}

export interface DayLog {
  answered: number;
  correct: number;
  newWords: number;
  stars: number;
}

/** A story read to the end: how often, and the best quiz score. */
export interface StoryLog {
  reads: number;
  best: number;
  last: number;
}

export interface Progress {
  version: 1;
  profile?: Profile;
  settings: Settings;
  topic: string;
  stars: number;
  words: Record<string, WordProgress>;
  days: Record<string, DayLog>;
  stories: Record<string, StoryLog>;
  /** Stickers given, with when; a sticker is shown once, when first earned. */
  stickers: Record<string, number>;
  /** Personal bests that stickers look at: longest run of right answers, longest streak of days. */
  records: { combo: number; streak: number };
}

const KEY = "ket-word:progress";

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 8,
  reviewCap: 30,
  retention: 0.9,
  accent: "uk",
  sound: true,
};

export const emptyProgress = (): Progress => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  topic: "animals",
  stars: 0,
  words: {},
  days: {},
  stories: {},
  stickers: {},
  records: { combo: 0, streak: 0 },
});

/** Local calendar day, e.g. "2026-10-27"; a learning day ends at local midnight. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseProgress(raw);
  } catch {
    // storage blocked or corrupt: start fresh rather than crash
  }
  return emptyProgress();
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private mode or quota: progress lives for this session only
  }
}

export function parseProgress(raw: string): Progress {
  const p = JSON.parse(raw) as Progress;
  if (p.version !== 1 || typeof p.words !== "object") throw new Error("不是有效的进度文件");
  return { ...emptyProgress(), ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
}

/** Daily plan options from the child's settings and what they already did today. */
export function planOptions(p: Progress, now: number) {
  const day = p.days[dayKey(now)];
  return {
    newPerDay: p.settings.newPerDay,
    reviewCap: p.settings.reviewCap,
    retention: p.settings.retention,
    newToday: day?.newWords ?? 0,
    // every graded answer is either a new word's first answer or a review
    reviewedToday: day ? day.answered - day.newWords : 0,
  };
}

const emptyDay = (): DayLog => ({ answered: 0, correct: 0, newWords: 0, stars: 0 });

/** Apply one graded answer: update the skill's memory card and today's log. */
export function recordGrade(p: Progress, wordId: string, skill: Skill, grade: Grade, now: number): Progress {
  const prev = p.words[wordId];
  const isNew = !prev;
  const word: WordProgress = prev ?? { seen: now, skills: {} };
  const card = review(word.skills[skill], grade, now, p.settings.retention);
  const correct = grade !== Rating.Again;
  const star = grade === Rating.Good || grade === Rating.Easy ? 1 : 0;
  const k = dayKey(now);
  const day = p.days[k] ?? emptyDay();
  const days = {
    ...p.days,
    [k]: {
      answered: day.answered + 1,
      correct: day.correct + (correct ? 1 : 0),
      newWords: day.newWords + (isNew ? 1 : 0),
      stars: day.stars + star,
    },
  };
  return {
    ...p,
    records: { ...p.records, streak: Math.max(p.records.streak, streak(days, now)) },
    stars: p.stars + star,
    words: { ...p.words, [wordId]: { ...word, skills: { ...word.skills, [skill]: card } } },
    days,
  };
}

export function addStars(p: Progress, n: number, now: number): Progress {
  const k = dayKey(now);
  const day = p.days[k] ?? emptyDay();
  return { ...p, stars: p.stars + n, days: { ...p.days, [k]: { ...day, stars: day.stars + n } } };
}

/** Consecutive days with at least one answer, counting today or (if not yet studied) yesterday. */
export function streak(days: Record<string, DayLog>, now: number): number {
  let n = 0;
  let t = now;
  if (!days[dayKey(t)]?.answered) t -= 86_400_000;
  while (days[dayKey(t)]?.answered) {
    n++;
    t -= 86_400_000;
  }
  return n;
}

/** Stars for a story: 5 the first time it is read to the end, plus one per right answer the first time. */
export const STORY_STARS = 5;

export function recordStory(p: Progress, id: string, right: number, now: number): Progress {
  const prev = p.stories[id];
  const stars = prev ? 0 : STORY_STARS + right;
  const log: StoryLog = { reads: (prev?.reads ?? 0) + 1, best: Math.max(prev?.best ?? 0, right), last: now };
  return addStars({ ...p, stories: { ...p.stories, [id]: log } }, stars, now);
}

/** A new longest run of right answers in one session. */
export const recordCombo = (p: Progress, combo: number): Progress =>
  combo > p.records.combo ? { ...p, records: { ...p.records, combo } } : p;

export const giveStickers = (p: Progress, ids: string[], now: number): Progress =>
  ids.length ? { ...p, stickers: { ...p.stickers, ...Object.fromEntries(ids.map((id) => [id, now])) } } : p;
