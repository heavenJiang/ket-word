import { buildPlan } from "../session/plan";
import { dayKey, planOptions, streak, type Progress } from "../store/progress";
import { canStart, type Library } from "../lib/data";
import type { Topic, Word } from "../types";
import { Max, type Pose } from "../ui/Max";

/** Max collects explorer gear as the child earns stars: always the same puppy, so he stays "theirs". */
export function petStage(stars: number): { pose: Pose; name: string; next: number | null } {
  if (stars >= 600) return { pose: "stage4", name: "国王 Max 👑", next: null };
  if (stars >= 250) return { pose: "stage3", name: "探险家 Max", next: 600 };
  if (stars >= 80) return { pose: "stage2", name: "小队长 Max", next: 250 };
  return { pose: "happy", name: "小狗 Max", next: 80 };
}

/** What Max says on the home screen. */
function maxLine(name: string, reviews: number, fresh: number, backlog: number): string {
  if (backlog > 0) return `${name}，好久不见！我们先把老朋友找回来吧。`;
  if (reviews + fresh === 0) return "今天的任务完成啦！单词要睡一觉才记得牢，明天见～";
  if (fresh > 0 && reviews > 0) return `先和 ${reviews} 个老朋友打招呼，再认识 ${fresh} 个新朋友！`;
  if (fresh > 0) return `今天有 ${fresh} 个新朋友等你认识！`;
  return `${reviews} 个老朋友想你了，快去看看它们！`;
}

export function Home(props: {
  progress: Progress;
  topic?: Topic;
  words: Word[];
  library: Library;
  /** Stories the child can open but has not read yet. */
  newStories: number;
  onStart: () => void;
  onMap: () => void;
  onStories: () => void;
  /** Stickers earned, out of all. */
  stickers: [number, number];
  onStickers: () => void;
}) {
  const { progress, topic, words, library, newStories, onStart, onMap, onStories, stickers, onStickers } = props;
  const now = Date.now();
  const today = progress.days[dayKey(now)];
  const plan = buildPlan(
    library.all.map((w) => w.id),
    progress.words,
    now,
    planOptions(progress, now),
    words.map((w) => w.id),
    canStart(library, progress.words),
  );
  const pet = petStage(progress.stars);
  const days = streak(progress.days, now);
  const hasWork = plan.reviews.length + plan.newWords.length > 0;
  const minutes = Math.max(1, Math.round((plan.reviews.length * 8 + plan.newWords.length * 30) / 60));

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <div className="hello">你好，{progress.profile?.name ?? "小探险家"}！</div>
          <div className="muted">今天也来认识新朋友吧</div>
        </div>
        <div className="chips">
          <span className="chip">{days > 0 ? `🔥 连续 ${days} 天` : "🌱 今天开始"}</span>
          <span className="chip">⭐ {progress.stars}</span>
        </div>
      </header>

      <section className="pet card">
        <Max
          pose={hasWork ? pet.pose : "sleep"}
          size="lg"
          say={maxLine(progress.profile?.name ?? "小探险家", plan.reviews.length, plan.newWords.length, plan.backlog)}
        />
        <div className="pet-info">
          <b>{pet.name}</b>
          {pet.next ? (
            <>
              <div className="bar bar-thin">
                <div className="bar-fill" style={{ width: `${Math.min(100, (progress.stars / pet.next) * 100)}%` }} />
              </div>
              <span className="muted small">再得 {pet.next - progress.stars} 颗 ⭐，Max 就能升级</span>
            </>
          ) : (
            <span className="muted small">Max 已经是最厉害的狗狗啦！</span>
          )}
        </div>
        <button className="sticker-entry" onClick={onStickers}>
          <span>🏅 我的贴纸</span>
          <b>
            {stickers[0]} / {stickers[1]}
          </b>
          <span className="muted">›</span>
        </button>
      </section>

      <section className="card today">
        <button className="today-topic" onClick={onMap}>
          <span>当前岛屿</span>
          <b>{topic ? `${topic.zh} · ${topic.en}` : "加载中…"}</b>
          <span className="muted">换一个 ›</span>
        </button>
        {hasWork ? (
          <>
            <div className="today-tasks">
              <div>
                <b>{plan.reviews.length}</b>
                <span>复习</span>
              </div>
              <div>
                <b>{plan.newWords.length}</b>
                <span>新单词</span>
              </div>
              <div>
                <b>~{minutes}</b>
                <span>分钟</span>
              </div>
            </div>
            {plan.backlog > 0 && (
              <p className="notice">欢迎回来！先把以前的单词找回来，新单词稍后再学（还有 {plan.backlog} 个排队中）。</p>
            )}
            <button className="btn btn-primary btn-huge" onClick={onStart}>
              开始今天的冒险 🚀
            </button>
          </>
        ) : (
          <div className="center">
            <b>🎉 今天的任务完成啦！</b>
            <p className="muted">明天再来，记得更牢。</p>
          </div>
        )}
      </section>

      {newStories > 0 && (
        <button className="card story-banner" onClick={onStories}>
          <span className="story-banner-icon">📖</span>
          <span>
            <b>有 {newStories} 个新故事可以读了！</b>
            <span className="muted small">你学过的单词都在故事里</span>
          </span>
          <span className="muted">›</span>
        </button>
      )}

      {today && (
        <section className="card today-log">
          今天已练习 <b>{today.answered}</b> 次，答对 <b>{today.correct}</b> 次，认识了 <b>{today.newWords}</b> 个新单词
        </section>
      )}
    </div>
  );
}
