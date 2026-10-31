import { wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import type { Library } from "../lib/data";
import type { Topic } from "../types";

const ISLAND_EMOJI: Record<string, string> = {
  animals: "🦁", colours: "🎨", family: "👨‍👩‍👧", food: "🍎", clothes: "👕", home: "🏠", school: "🏫",
  nature: "🌳", weather: "🌦️", time: "⏰", sport: "⚽", hobbies: "🎸", health: "💪", town: "🏙️",
  buildings: "🏛️", countryside: "🌾", shopping: "🛒", services: "🏥", travel: "✈️", jobs: "👩‍🚒",
  media: "🎬", tech: "💻", appliances: "📺", documents: "✉️", measure: "📏", feelings: "😊",
  numbers: "🔢", world: "🌍",
};

/** The topic map: each KET topic is an island; islands open as their kid content is reviewed. */
export function MapPage(props: { topics: Topic[]; progress: Progress; library: Library; onPick: (id: string) => void }) {
  const { topics, progress, library, onPick } = props;
  const total = topics.reduce((n, t) => n + (t.core ? t.count : 0), 0);
  const emoji = (t: Topic) => t.emoji ?? ISLAND_EMOJI[t.id] ?? "🏝️";
  const learned = (t: Topic) => (library.topics[t.id] ?? []).filter((w) => wordLevel(progress.words[w.id], w.spell) >= 2).length;

  const open = topics.filter((t) => t.ready);
  const soon = topics.filter((t) => !t.ready);

  return (
    <div className="page">
      <h2>单词岛地图</h2>
      <p className="muted">选一座岛去探险。每认识一个单词，岛上就多一面小旗 🚩</p>
      <div className="islands">
        {open.map((t) => {
          const n = learned(t);
          const on = t.id === progress.topic;
          return (
            <button key={t.id} className={`island ${on ? "island-on" : ""}`} onClick={() => onPick(t.id)}>
              {on && <span className="island-here">📍 在这里</span>}
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
        })}
      </div>

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
