import { wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import type { Library } from "../lib/data";
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
 * The topic map: the KET topic islands and the small core-word islands, in two groups. The island
 * after the current one is marked as next; islands whose words are all met fold away at the end of
 * their group, so the map shows what is still ahead.
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

  return (
    <div className="page">
      <h2>单词岛地图</h2>
      <p className="muted">选一座岛去探险。每认识一个单词，岛上就多一面小旗 🚩</p>
      {group("🏝️ 话题岛", "KET 官方话题，每座岛一个主题，还有 Lily 和 Max 的故事。", open.filter((t) => !t.core))}
      {group("🧩 核心小岛", "不属于任何话题的常用词：小词、动作、描述、时间……", open.filter((t) => t.core))}

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
