import { wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import type { Library } from "../lib/data";
import { ROUTE } from "../lib/route";
import { nextIsland } from "../session/today";
import type { Topic } from "../types";

const ISLAND_EMOJI: Record<string, string> = {
  animals: "🦁", colours: "🎨", family: "👨‍👩‍👧", food: "🍎", clothes: "👕", home: "🏠", school: "🏫",
  nature: "🌳", weather: "🌦️", time: "⏰", sport: "⚽", hobbies: "🎸", health: "💪", town: "🏙️",
  buildings: "🏛️", countryside: "🌾", shopping: "🛒", services: "🏥", travel: "✈️", jobs: "👩‍🚒",
  media: "🎬", tech: "💻", appliances: "📺", documents: "✉️", measure: "📏", feelings: "😊",
  numbers: "🔢", world: "🌍",
};

/**
 * The map follows the Think course: book by book, unit by unit, the islands for each unit's topics,
 * with the current island and the next one on the route marked. Every island stays open: tapping
 * any of them moves there. Below, all islands in their two groups (topics and core words), where
 * islands whose words are all met fold away.
 */
export function MapPage(props: { topics: Topic[]; progress: Progress; library: Library; onPick: (id: string) => void }) {
  const { topics, progress, library, onPick } = props;
  const total = topics.reduce((n, t) => n + (t.core ? t.count : 0), 0);
  const emoji = (t: Topic) => t.emoji ?? ISLAND_EMOJI[t.id] ?? "🏝️";
  const learned = (t: Topic) => (library.topics[t.id] ?? []).filter((w) => wordLevel(progress.words[w.id], w.spell) >= 2).length;
  const met = (t: Topic) => (library.topics[t.id] ?? []).every((w) => progress.words[w.id]);
  const next = nextIsland(topics, library, progress, progress.topic);

  const open = topics.filter((t) => t.ready);
  const soon = topics.filter((t) => !t.ready);

  const island = (t: Topic) => {
    const n = learned(t);
    const on = t.id === progress.topic;
    return (
      <button key={t.id} className={`island ${on ? "island-on" : ""} ${t.id === next ? "island-next" : ""}`} onClick={() => onPick(t.id)}>
        {on && <span className="island-here">📍 在这里</span>}
        {!on && t.id === next && <span className="island-here island-here-next">👉 下一座</span>}
        <span className="island-emoji">{emoji(t)}</span>
        <b>{t.zh}</b>
        <span className="island-en">{t.en}</span>
        <div className="bar bar-thin island-bar">
          <div className="bar-fill" style={{ width: `${(n / t.count) * 100}%` }} />
        </div>
        <span className="island-count">
          🚩 {n} / {t.count}
        </span>
      </button>
    );
  };

  const group = (title: string, note: string, ts: Topic[]) => {
    const ahead = ts.filter((t) => !met(t) || t.id === progress.topic);
    const done = ts.filter((t) => met(t) && t.id !== progress.topic);
    return (
      <section className="island-group">
        <h3>
          {title} <span className="muted small">{ts.length} 座</span>
        </h3>
        <p className="muted small">{note}</p>
        <div className="islands">{ahead.map(island)}</div>
        {done.length > 0 && (
          <details className="islands-done">
            <summary>✅ 单词都见过的岛（{done.length} 座）</summary>
            <div className="islands">{done.map(island)}</div>
          </details>
        )}
      </section>
    );
  };

  const byId = new Map(open.map((t) => [t.id, t]));
  const chip = (id: string) => {
    const t = byId.get(id);
    if (!t) return null;
    const on = id === progress.topic;
    const state = on ? "chip-on" : id === next ? "chip-next" : met(t) ? "chip-done" : "";
    return (
      <button key={id} className={`route-chip ${state}`} onClick={() => onPick(id)}>
        <span>{emoji(t)}</span>
        <b>{t.zh}</b>
        <span className="muted small">
          {on ? "📍 在这里" : id === next ? "👉 下一座" : `🚩 ${learned(t)}/${t.count}`}
        </span>
      </button>
    );
  };

  return (
    <div className="page">
      <h2>单词岛地图</h2>
      <p className="muted">跟着 Think 课本一个单元一个单元往前走，每认识一个单词，岛上就多一面小旗 🚩。想先去别的岛，点它就行。</p>

      {(["Think Starter", "Think 1", "Think 2"] as const).map((book) => (
        <section key={book} className="route-book card">
          <h3>
            📘 {book} <span className="muted small">{book === "Think Starter" ? "A1" : book === "Think 1" ? "A2 · KET 水平" : "B1"}</span>
          </h3>
          {ROUTE.filter((r) => r.book === book).map((r) => (
            <div key={r.unit} className="route-unit">
              <div className="route-unit-head">
                <b>{r.unit === "Welcome" ? "Welcome" : `Unit ${r.unit}`}</b>
                <span className="muted small">{r.zh}</span>
              </div>
              {r.islands.length ? (
                <div className="route-chips">{r.islands.map(chip)}</div>
              ) : (
                <span className="muted small">这个单元的词在前面的岛里已经有了，复习就好 👍</span>
              )}
            </div>
          ))}
        </section>
      ))}

      <details className="islands-all">
        <summary>🗺️ 全部单词岛（按话题和核心词分组）</summary>
        {group("🏝️ 话题岛", "KET 官方话题，每座岛一个主题，还有 Lily 和 Max 的故事。", open.filter((t) => !t.core))}
        {group("🧩 核心小岛", "不属于任何话题的常用词：小词、动作、描述、时间……", open.filter((t) => t.core))}
      </details>

      {soon.length > 0 && (
        <>
          <h3 className="soon-title">🔒 即将开放（{soon.length} 座）</h3>
          <p className="muted small">
            KET 官方全部 {topics.filter((t) => !t.core).length} 个话题和 {total} 个核心词都会陆续开放。
          </p>
          <div className="soon">
            {soon.map((t) => (
              <span key={t.id} className="soon-item">
                {emoji(t)} {t.zh}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
