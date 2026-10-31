import { rereadDue, toOpen } from "../lib/data";
import type { Progress } from "../store/progress";
import type { Story, Topic } from "../types";

const base = import.meta.env.BASE_URL;

/** The story book: each open island's stories, read ones with their score, locked ones with how far to go. */
export function Stories(props: { stories: Story[]; topics: Topic[]; progress: Progress; onRead: (s: Story) => void }) {
  const { stories, topics, progress, onRead } = props;
  const now = Date.now();
  // the island the child is on first
  const open = topics
    .filter((t) => t.ready && stories.some((s) => s.topic === t.id))
    .sort((a, b) => Number(b.id === progress.topic) - Number(a.id === progress.topic));

  return (
    <div className="page">
      <h2>故事书</h2>
      <p className="muted">认识故事里大部分单词，就能读到 Lily 和 Max 的新故事。读完答对问题，还能得 ⭐。读过的故事过一阵再读一遍，单词记得更牢。</p>
      {open.map((t) => (
        <section key={t.id}>
          <h3>{t.zh}</h3>
          <div className="books">
            {stories
              .filter((s) => s.topic === t.id)
              .sort((a, b) => toOpen(a, progress.words) - toOpen(b, progress.words)) // ready to read first
              .map((s) => {
                const missing = toOpen(s, progress.words);
                const log = progress.stories[s.id];
                const again = rereadDue(log, now);
                const cover = s.pages[0]?.img;
                return (
                  <button key={s.id} className={`book ${missing ? "book-locked" : ""}`} disabled={missing > 0} onClick={() => onRead(s)}>
                    <div className="book-cover">
                      {cover ? <img src={base + cover} alt="" draggable={false} /> : <span>📖</span>}
                      {missing > 0 && <span className="book-lock">🔒</span>}
                      {log && <span className="book-done">✓</span>}
                    </div>
                    <b className="book-title">{s.title}</b>
                    <span className="book-zh">{s.zh}</span>
                    <span className="book-state">
                      {missing
                        ? `再学 ${missing} 个词就能读`
                        : again
                          ? "🔁 可以再读一遍啦"
                          : log
                            ? `读过 ${log.reads} 次 · 答对 ${log.best}/${s.questions.length}`
                            : "新故事！"}
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
