import { wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import type { Library } from "../lib/data";
import type { Topic } from "../types";

const ISLAND_EMOJI: Record<string, string> = {
  animals: "🦁", colours: "🎨", family: "👨‍👩‍👧", food: "🍎", clothes: "👕", home: "🏠", school: "🏫",
  nature: "🌳", weather: "🌦️", time: "⏰", sport: "⚽", hobbies: "🎸", health: "💪", town: "🏙️",
  buildings: "🏛️", countryside: "🌾", shopping: "🛒", services: "🏥", travel: "✈️", jobs: "👩‍🚒",
  media: "🎬", tech: "💻", appliances: "📺", documents: "✉️", measure: "📏", feelings: "😊",
  numbers: "🔢", world: "🌍", core: "⭐",
};

/** The topic map: each KET topic is an island; islands open as their kid content is reviewed. */
export function MapPage(props: { topics: Topic[]; progress: Progress; library: Library; onPick: (id: string) => void }) {
  const { topics, progress, library, onPick } = props;
  const total = topics.reduce((n, t) => n + (t.id === "core" ? t.count : 0), 0);
  const learned = (t: Topic) => (library.topics[t.id] ?? []).filter((w) => wordLevel(progress.words[w.id]) >= 2).length;

  return (
    <div className="page">
      <h2>单词岛地图</h2>
      <p className="muted">
        {topics.filter((t) => t.id !== "core").length} 座话题岛覆盖 KET 官方全部话题，另有 {total} 个核心词。新岛屿陆续开放中！
      </p>
      <div className="islands">
        {[...topics.filter((t) => t.ready), ...topics.filter((t) => !t.ready)].map((t) => {
          const on = t.id === progress.topic;
          return (
            <button
              key={t.id}
              className={`island ${t.ready ? "" : "island-locked"} ${on ? "island-on" : ""}`}
              disabled={!t.ready}
              onClick={() => onPick(t.id)}
            >
              <span className="island-emoji">{ISLAND_EMOJI[t.id] ?? "🏝️"}</span>
              <b>{t.zh}</b>
              <span className="island-en">{t.en}</span>
              <span className="island-count">{t.ready ? `${learned(t)} / ${t.count} 已认识` : `${t.count} 词 · 建设中`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
