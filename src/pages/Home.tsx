import { buildPlan } from "../session/plan";
import { dayKey, planOptions, streak, type Progress } from "../store/progress";
import type { Topic, Word } from "../types";

/** Max grows with the stars the child earns. */
export function petStage(stars: number) {
  if (stars >= 600) return { emoji: "🦮", name: "超级狗狗 Max 👑", next: null };
  if (stars >= 250) return { emoji: "🐕‍🦺", name: "能干的大狗 Max", next: 600 };
  if (stars >= 80) return { emoji: "🐕", name: "小狗 Max", next: 250 };
  return { emoji: "🐶", name: "小奶狗 Max", next: 80 };
}

export function Home(props: { progress: Progress; topic?: Topic; words: Word[]; onStart: () => void; onMap: () => void }) {
  const { progress, topic, words, onStart, onMap } = props;
  const now = Date.now();
  const today = progress.days[dayKey(now)];
  const plan = buildPlan(words.map((w) => w.id), progress.words, now, planOptions(progress, now));
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
          <span className="chip">🔥 {days} 天</span>
          <span className="chip">⭐ {progress.stars}</span>
        </div>
      </header>

      <section className="pet card">
        <div className="pet-emoji">{pet.emoji}</div>
        <div className="pet-info">
          <b>{pet.name}</b>
          {pet.next ? (
            <>
              <div className="bar bar-thin">
                <div className="bar-fill" style={{ width: `${Math.min(100, (progress.stars / pet.next) * 100)}%` }} />
              </div>
              <span className="muted small">再得 {pet.next - progress.stars} 颗星，Max 就会长大</span>
            </>
          ) : (
            <span className="muted small">Max 已经是最厉害的狗狗啦！</span>
          )}
        </div>
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
            <div className="big-emoji">🎉</div>
            <b>今天的任务完成啦！</b>
            <p className="muted">明天再来，记得更牢。</p>
          </div>
        )}
      </section>

      {today && (
        <section className="card today-log">
          今天已练习 <b>{today.answered}</b> 次，答对 <b>{today.correct}</b> 次，认识了 <b>{today.newWords}</b> 个新单词
        </section>
      )}
    </div>
  );
}
