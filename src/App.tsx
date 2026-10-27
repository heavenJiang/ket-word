import { useCallback, useEffect, useMemo, useState } from "react";
import { loadIndex, loadTopic, type AppIndex } from "./lib/data";
import { Cards } from "./pages/Cards";
import { Home } from "./pages/Home";
import { Learn } from "./pages/Learn";
import { MapPage } from "./pages/MapPage";
import { Parent } from "./pages/Parent";
import { loadProgress, saveProgress, type Progress } from "./store/progress";
import type { Word } from "./types";

type Page = "home" | "map" | "learn" | "cards" | "parent";

const NAV: { id: Page; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "首页" },
  { id: "map", icon: "🗺️", label: "地图" },
  { id: "cards", icon: "🃏", label: "卡册" },
  { id: "parent", icon: "👨‍👩‍👧", label: "家长" },
];

/** Shortest, simplest words first: one-syllable everyday animals before "crocodile". */
const learningOrder = (ws: Word[]) =>
  [...ws].sort((a, b) => a.chunks.length - b.chunks.length || a.word.length - b.word.length);

export function App() {
  const [progress, setProgressState] = useState<Progress>(loadProgress);
  const [index, setIndex] = useState<AppIndex | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [page, setPage] = useState<Page>("home");
  const [error, setError] = useState<string | null>(null);

  const setProgress = useCallback((f: (p: Progress) => Progress) => {
    setProgressState((p) => {
      const next = f(p);
      saveProgress(next);
      return next;
    });
  }, []);

  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e)));
  }, []);
  useEffect(() => {
    loadTopic(progress.topic).then((ws) => setWords(learningOrder(ws)), (e) => setError(String(e)));
  }, [progress.topic]);

  const topic = useMemo(() => index?.topics.find((t) => t.id === progress.topic), [index, progress.topic]);

  if (!progress.profile) return <Onboarding onDone={(name, age) => setProgress((p) => ({ ...p, profile: { name, age } }))} />;
  if (error) return <div className="page center">加载失败：{error}</div>;
  if (!index || words.length === 0) return <div className="page center muted">正在打开单词岛…</div>;

  if (page === "learn") return <Learn words={words} progress={progress} setProgress={setProgress} onExit={() => setPage("home")} />;

  return (
    <div className="shell">
      <main>
        {page === "home" && <Home progress={progress} topic={topic} words={words} onStart={() => setPage("learn")} onMap={() => setPage("map")} />}
        {page === "map" && (
          <MapPage
            topics={index.topics}
            progress={progress}
            words={words}
            onPick={(id) => {
              setProgress((p) => ({ ...p, topic: id }));
              setPage("home");
            }}
          />
        )}
        {page === "cards" && <Cards words={words} progress={progress} />}
        {page === "parent" && <Parent words={words} progress={progress} setProgress={setProgress} credits={index.credits} source={index.source} />}
      </main>
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? "nav-on" : ""}`} onClick={() => setPage(n.id)}>
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Onboarding({ onDone }: { onDone: (name: string, age: number) => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState(9);
  return (
    <div className="page center onboarding">
      <div className="big-emoji">🏝️🐶</div>
      <h1>欢迎来到 KET 单词岛！</h1>
      <p className="muted">我是小狗 Max，我会陪你认识 KET 的全部单词。</p>
      <label>
        你叫什么名字？
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Lily" autoFocus />
      </label>
      <label>
        你几岁啦？
        <div className="ages">
          {[6, 7, 8, 9, 10, 11, 12].map((a) => (
            <button key={a} className={`age ${a === age ? "age-on" : ""}`} onClick={() => setAge(a)}>
              {a}
            </button>
          ))}
        </div>
      </label>
      <button className="btn btn-primary btn-huge" disabled={!name.trim()} onClick={() => onDone(name.trim(), age)}>
        出发！
      </button>
    </div>
  );
}
