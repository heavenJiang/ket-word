import { isMastered, wordLevel } from "../srs/srs";
import { streak, type Progress } from "../store/progress";
import type { Story, Topic, Word } from "../types";

/**
 * Stickers reward the habits that make words stick: coming back day after day, really knowing words
 * (gold cards, whole islands), focus and reading. Nothing rewards sheer volume of questions.
 */
export interface Sticker {
  id: string;
  emoji: string;
  name: string;
  /** How to earn it, in words a child understands. */
  how: string;
  kind: "words" | "gold" | "streak" | "combo" | "story" | "island";
  /** [where the child is, the goal]; earned once the first reaches the second. */
  progress: [number, number];
}

export interface StickerWorld {
  progress: Progress;
  /** Every word of the open islands. */
  words: Word[];
  topics: Topic[];
  byTopic: Record<string, Word[]>;
  stories: Story[];
  now: number;
}

const tiers = <T>(xs: [number, string, string][], make: (goal: number, emoji: string, name: string) => T) =>
  xs.map(([goal, emoji, name]) => make(goal, emoji, name));

export function stickers(w: StickerWorld): Sticker[] {
  const { progress } = w;
  const met = w.words.filter((x) => progress.words[x.id]).length;
  const gold = w.words.filter((x) => wordLevel(progress.words[x.id]) === 3).length;
  const days = streak(progress.days, w.now);
  const bestDays = Math.max(days, progress.records?.streak ?? 0);
  const combo = progress.records?.combo ?? 0;
  const read = w.stories.filter((s) => progress.stories[s.id]).length;
  const fullMarks = w.stories.filter((s) => (progress.stories[s.id]?.best ?? 0) === s.questions.length).length;
  const spelled = w.words.filter((x) => isMastered(progress.words[x.id]?.skills.spell)).length;

  return [
    ...tiers(
      [
        [1, "🐣", "第一个朋友"],
        [10, "🌱", "十个朋友"],
        [50, "🌿", "五十个朋友"],
        [100, "🌳", "一百个朋友"],
        [200, "🏝️", "两百个朋友"],
      ],
      (goal, emoji, name): Sticker => ({ id: `words-${goal}`, emoji, name, how: `认识 ${goal} 个单词`, kind: "words", progress: [met, goal] }),
    ),
    { id: "gold-1", emoji: "🥇", name: "第一张金卡", how: "一个词的认识、听懂、会拼都掌握", kind: "gold", progress: [gold, 1] },
    { id: "gold-10", emoji: "🏆", name: "金卡收藏家", how: "集齐 10 张金卡", kind: "gold", progress: [gold, 10] },
    { id: "spell-10", emoji: "✏️", name: "拼写小能手", how: "牢牢会拼 10 个词", kind: "gold", progress: [spelled, 10] },
    ...tiers(
      [
        [3, "🔥", "连续三天"],
        [7, "📅", "坚持一周"],
        [14, "💪", "坚持两周"],
        [30, "🌈", "坚持一个月"],
      ],
      (goal, emoji, name): Sticker => ({ id: `streak-${goal}`, emoji, name, how: `连续 ${goal} 天来学习`, kind: "streak", progress: [bestDays, goal] }),
    ),
    ...tiers(
      [
        [5, "⚡", "连对 5 题"],
        [10, "🚀", "连对 10 题"],
        [20, "🌟", "连对 20 题"],
      ],
      (goal, emoji, name): Sticker => ({ id: `combo-${goal}`, emoji, name, how: `一次学习里连续答对 ${goal} 题`, kind: "combo", progress: [combo, goal] }),
    ),
    { id: "story-1", emoji: "📖", name: "第一个故事", how: "读完一个故事", kind: "story", progress: [read, 1] },
    { id: "story-full-3", emoji: "🎯", name: "读书小达人", how: "3 个故事的问题全部答对", kind: "story", progress: [fullMarks, 3] },
    { id: "story-all", emoji: "📚", name: "故事书读完了", how: "读完所有已开放的故事", kind: "story", progress: [read, Math.max(1, w.stories.length)] },
    // one per open island: every word on it known (meaning in long-term memory)
    ...w.topics
      .filter((t) => t.ready)
      .map((t): Sticker => {
        const ws = w.byTopic[t.id] ?? [];
        return {
          id: `island-${t.id}`,
          emoji: "🚩",
          name: `征服${t.zh}岛`,
          how: `认识${t.zh}岛的全部 ${ws.length} 个词`,
          kind: "island",
          progress: [ws.filter((x) => wordLevel(progress.words[x.id]) >= 2).length, ws.length],
        };
      }),
  ];
}

export const isEarned = (s: Sticker) => s.progress[0] >= s.progress[1];

/** Stickers just earned and not yet given (shown once, then kept in progress.stickers). */
export const newlyEarned = (all: Sticker[], given: Record<string, number>) => all.filter((s) => isEarned(s) && !given[s.id]);
