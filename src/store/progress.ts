import { targets } from "../session/goal";
import { isGraduated, review, type Grade, Rating, type WordProgress } from "../srs/srs";
import { SKILLS, type Accent, type Skill } from "../types";

export interface Settings {
  /** New words a day: the day's target; reviews follow from it, and time is only an estimate. */
  newPerDay: number;
  /** Optional day to have every word learnt by ("2027-05-20"): suggests a pace, and its last weeks aim reviews at it. */
  goal?: string;
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
  /** Words passed as already known by the quick check of earlier versions; still counted for their day. */
  known?: number;
  stars: number;
}

/**
 * One graded answer: when, word, skill (index in SKILLS), FSRS grade, milliseconds to answer, and
 * 0 review · 1 new word (2: already known, from earlier versions) · 3 a check-up miss on a graduated word,
 * graded as forgotten without being a timed review (left out of answer speed and the parent's numbers).
 * Kept so the scheduler can later be fitted to this child.
 */
export type LogEntry = [t: number, wordId: string, skill: number, grade: number, ms: number, kind: 0 | 1 | 2 | 3];
/** Log kind of a check-up miss. */
export const CHECKUP_MISS = 3;
/** About 1.5 MB of storage at most; the oldest answers go first. */
const LOG_MAX = 40_000;

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
  /** Every graded answer, oldest first. */
  log?: LogEntry[];
  /** Monthly check-ups: see the meaning, pick the English, for a sample of words met; memory cards untouched. */
  checkups?: Checkup[];
  /** When the parent last saved a backup file. */
  backedUp?: number;
  /** Pictures marked as wrong from the card album (word id → when), for the parent to have redrawn. */
  flags?: Record<string, number>;
}

export interface Checkup {
  t: number;
  right: number;
  total: number;
}

/** A check-up comes round this often, once enough words have been met to sample. */
export const CHECKUP_DAYS = 30;
export const CHECKUP_SIZE = 20;
/** Only words met at least this long ago are sampled: a check-up measures what lasted. */
const CHECKUP_AGE_DAYS = 7;

/** Words a check-up may ask, or none when it is not due yet. */
export function checkupWords(p: Progress, now: number): string[] {
  const day = 86_400_000;
  const met = Object.entries(p.words);
  const first = Math.min(...met.map(([, w]) => w.seen));
  const last = p.checkups?.at(-1)?.t ?? first;
  if (!met.length || now - last < CHECKUP_DAYS * day) return [];
  const old = met.filter(([, w]) => w.skills.meaning && now - w.seen >= CHECKUP_AGE_DAYS * day).map(([id]) => id);
  return old.length >= CHECKUP_SIZE * 2 ? old : [];
}

export const recordCheckup = (p: Progress, c: Checkup): Progress => ({ ...p, checkups: [...(p.checkups ?? []), c] });

/**
 * A check-up miss on a graduated word: the meaning was forgotten after all, so it is graded as
 * forgotten, which brings the word back into the daily reviews. Words still in the reviews are left
 * alone: the check-up only measures them.
 */
export function ungraduate(p: Progress, wordId: string, now: number): Progress {
  const m = p.words[wordId]?.skills.meaning;
  return isGraduated(m) ? recordGrade(p, wordId, "meaning", Rating.Again, now, 0, true) : p;
}

const KEY = "ket-word:progress";
/** A saved progress that could not be read, kept aside instead of being overwritten by a fresh start. */
const BROKEN_KEY = "ket-word:progress-unreadable";

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  retention: 0.9,
  accent: "uk",
  sound: true,
};

export const emptyProgress = (): Progress => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  topic: "colours", // the first island of the Think course route
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
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyProgress(); // storage blocked: progress lives for this session only
  }
  if (!raw) return emptyProgress();
  try {
    return parseProgress(raw);
  } catch {
    // corrupt, or from another version: keep it aside before the fresh start overwrites it, so the
    // parent centre can offer it for download
    try {
      localStorage.setItem(BROKEN_KEY, raw);
    } catch {
      // no room for a second copy: the fresh start must not overwrite the only one
      unreadable = raw;
    }
    return emptyProgress();
  }
}

/** The unreadable progress found at start, when there was no room to keep it aside in storage. */
let unreadable: string | null = null;

/** A saved progress that could not be read at start, if any. */
export function unreadableProgress(): string | null {
  if (unreadable) return unreadable;
  try {
    return localStorage.getItem(BROKEN_KEY);
  } catch {
    return null;
  }
}

export function dropUnreadableProgress(): void {
  unreadable = null;
  try {
    localStorage.removeItem(BROKEN_KEY);
  } catch {
    // nothing to drop
  }
}

/** Save the progress; false when it could not be saved (private mode, storage full). */
export function saveProgress(p: Progress): boolean {
  // the only copy of an unreadable progress is still in KEY: never overwrite it
  if (unreadable) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to keep this site's storage: without it Safari may clear a site's storage after
 * days without a visit. Resolves to whether storage is persistent (false when unsupported).
 */
export async function persistStorage(): Promise<boolean> {
  try {
    const s = navigator.storage;
    if (!s?.persist) return false;
    return (await s.persisted?.()) || (await s.persist());
  } catch {
    return false;
  }
}

export function parseProgress(raw: string): Progress {
  const p = JSON.parse(raw) as Progress;
  if (p.version !== 1 || typeof p.words !== "object") throw new Error("不是有效的进度文件");
  return { ...emptyProgress(), ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
}

/**
 * Daily plan options from the child's settings, goal and what they already did today.
 * `unstarted` counts the words the child has not met yet.
 */
export function planOptions(p: Progress, now: number, unstarted: number) {
  const day = p.days[dayKey(now)];
  const startedToday = (day?.newWords ?? 0) + (day?.known ?? 0);
  const t = targets(p, now, unstarted + startedToday);
  return {
    newPerDay: t.newPerDay,
    reviewCap: t.reviewCap,
    reviewCapAlone: t.reviewCapAlone,
    retention: p.settings.retention,
    examAt: t.examAt,
    newToday: day?.newWords ?? 0,
    // every graded answer is a new word's first answer or a review
    reviewedToday: day ? day.answered - startedToday : 0,
  };
}

const emptyDay = (): DayLog => ({ answered: 0, correct: 0, newWords: 0, stars: 0 });

/**
 * Apply one graded answer: update the skill's memory card, today's log and the answer log. A
 * `checkup` miss updates the card only, and is logged apart: it is neither a review nor timed.
 */
export function recordGrade(p: Progress, wordId: string, skill: Skill, grade: Grade, now: number, ms = 0, checkup = false): Progress {
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
  const entry: LogEntry = [now, wordId, SKILLS.indexOf(skill), grade, Math.round(ms), checkup ? CHECKUP_MISS : isNew ? 1 : 0];
  const log = [...(p.log ?? []), entry];
  const words = { ...p.words, [wordId]: { ...word, skills: { ...word.skills, [skill]: card } } };
  if (checkup) return { ...p, words, log: log.length > LOG_MAX ? log.slice(-LOG_MAX) : log };
  return {
    ...p,
    records: { ...p.records, streak: Math.max(p.records.streak, streak(days, now)) },
    stars: p.stars + star,
    words,
    days,
    log: log.length > LOG_MAX ? log.slice(-LOG_MAX) : log,
  };
}

export function addStars(p: Progress, n: number, now: number): Progress {
  const k = dayKey(now);
  const day = p.days[k] ?? emptyDay();
  return { ...p, stars: p.stars + n, days: { ...p.days, [k]: { ...day, stars: day.stars + n } } };
}

/** Consecutive days with at least one answer, counting today or (if not yet studied) yesterday. */
/** Mark a word's picture as wrong, or take the mark back. */
export function toggleFlag(p: Progress, id: string, now: number): Progress {
  const flags = { ...p.flags };
  if (flags[id]) delete flags[id];
  else flags[id] = now;
  return { ...p, flags };
}

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
