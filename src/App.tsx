import { useCallback, useEffect, useMemo, useState } from "react";
import { loadIndex, loadLibrary, loadStories, rereadDue, toOpen, type AppIndex, type Library } from "./lib/data";
import { Cards } from "./pages/Cards";
import { Home } from "./pages/Home";
import { Learn } from "./pages/Learn";
import { MapPage } from "./pages/MapPage";
import { Parent } from "./pages/Parent";
import { NewStickers, Stickers } from "./pages/Stickers";
import { Stories } from "./pages/Stories";
import { StoryReader } from "./pages/StoryReader";
import { checkupWords, giveStickers, loadProgress, persistStorage, recordCheckup, recordStory, saveProgress, toggleFlag, unreadableProgress, ungraduate, type Progress } from "./store/progress";
import { Checkup } from "./pages/Checkup";
import { Calendar } from "./pages/Calendar";
import { isEarned, newlyEarned, stickers as allStickers } from "./lib/stickers";
import { learningOrder, nextIsland } from "./session/today";
import type { Story, Topic } from "./types";
import { Icon, type IconName } from "./ui/Icons";
import { Max } from "./ui/Max";

type Page = "home" | "map" | "learn" | "stories" | "cards" | "parent" | "stickers" | "checkup" | "calendar";

const NAV: { id: Page & IconName; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "map", label: "地图" },
  { id: "stories", label: "故事" },
  { id: "cards", label: "卡册" },
];

export function App() {
  const [progress, setProgressState] = useState<Progress>(loadProgress);
  const [index, setIndex] = useState<AppIndex | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [error, setError] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [reading, setReading] = useState<Story | null>(null);
  /** New words to add after the day's plan is done ("one more group"), for the next session. */
  const [extra, setExtra] = useState(0);
  /** The island just finished, shown once on the home screen after moving on. */
  const [finished, setFinished] = useState<Topic | undefined>();

  /** The last save failed (storage full or blocked): answers now live only until the page closes. */
  const [unsaved, setUnsaved] = useState(false);

  const setProgress = useCallback((f: (p: Progress) => Progress) => {
    setProgressState((p) => {
      const next = f(p);
      setUnsaved(!saveProgress(next));
      return next;
    });
  }, []);

  // without this Safari may clear the site's storage, and with it the progress, after days away
  useEffect(() => {
    persistStorage();
  }, []);

  useEffect(() => {
    loadIndex()
      .then((ix) => {
        setIndex(ix);
        return loadLibrary(ix.topics.filter((t) => t.ready).map((t) => t.id));
      })
      .then(setLibrary, (e) => setError(String(e)));
    loadStories().then(setStories, () => setStories([]));
  }, []);

  const topic = useMemo(() => index?.topics.find((t) => t.id === progress.topic), [index, progress.topic]);
  const words = useMemo(() => learningOrder(library?.topics[progress.topic] ?? []), [library, progress.topic]);
  const stickers = useMemo(
    () =>
      index && library
        ? allStickers({ progress, words: library.all, topics: index.topics, byTopic: library.topics, stories, now: Date.now() })
        : [],
    [progress, index, library, stories],
  );
  const fresh = newlyEarned(stickers, progress.stickers);

  // every word on this island met: move on to the next island with new words
  useEffect(() => {
    if (!index || !library || page !== "home") return;
    if ((library.topics[progress.topic] ?? []).some((w) => !progress.words[w.id])) return;
    const to = nextIsland(index.topics, library, progress, progress.topic);
    if (!to) return;
    setFinished(index.topics.find((t) => t.id === progress.topic));
    setProgress((p) => ({ ...p, topic: to }));
  }, [index, library, progress, page, setProgress]);

  if (!progress.profile) return <Onboarding onDone={(name, age) => setProgress((p) => ({ ...p, profile: { name, age } }))} />;
  if (error) return <div className="page center">加载失败：{error}</div>;
  if (!index || !library || words.length === 0) return <div className="page center muted">正在打开单词岛…</div>;

  if (reading)
    return (
      <StoryReader
        story={reading}
        library={library}
        accent={progress.settings.accent}
        sound={progress.settings.sound}
        readBefore={!!progress.stories[reading.id]}
        met={(id) => !!progress.words[id]}
        onDone={(right) => setProgress((p) => recordStory(p, reading.id, right, Date.now()))}
        onExit={() => setReading(null)}
      />
    );

  if (page === "checkup")
    return (
      <Checkup
        wordIds={checkupWords(progress, Date.now())}
        library={library}
        accent={progress.settings.accent}
        sound={progress.settings.sound}
        last={progress.checkups?.at(-1)}
        onDone={(r) => setProgress((p) => recordCheckup(p, r))}
        onMiss={(id) => setProgress((p) => ungraduate(p, id, Date.now()))}
        onExit={() => setPage("home")}
      />
    );

  if (page === "learn")
    return <Learn words={words} library={library} topics={index.topics} progress={progress} setProgress={setProgress} extra={extra} onExit={() => setPage("home")} />;

  return (
    <div className="shell">
      {(unsaved || unreadableProgress()) && (
        <div className="save-warn" role="alert">
          {unsaved ? "⚠️ 进度没能保存到这台设备（存储空间满或被浏览器禁止）。" : "⚠️ 发现一份读不出来的旧进度。"}
          请家长到“家长 → 备份”处理。
          {page !== "parent" && (
            <button className="btn btn-ghost" onClick={() => setPage("parent")}>
              去处理
            </button>
          )}
        </div>
      )}
      <main>
        {page === "home" && (
          <Home
            progress={progress}
            topic={topic}
            topics={index.topics}
            library={library}
            finished={finished}
            newStories={stories.filter((s) => !progress.stories[s.id] && toOpen(s, progress.words) === 0).length}
            rereadStories={stories.filter((s) => rereadDue(progress.stories[s.id], Date.now())).length}
            checkupDue={checkupWords(progress, Date.now()).length > 0}
            onCheckup={() => setPage("checkup")}
            onStart={(more = 0) => {
              setExtra(more);
              setPage("learn");
            }}
            onMap={() => setPage("map")}
            onStories={() => setPage("stories")}
            stickers={[stickers.filter(isEarned).length, stickers.length]}
            onStickers={() => setPage("stickers")}
            onCalendar={() => setPage("calendar")}
            onParent={() => setPage("parent")}
          />
        )}
        {page === "map" && (
          <MapPage
            topics={index.topics}
            progress={progress}
            library={library}
            onPick={(id) => {
              setProgress((p) => ({ ...p, topic: id }));
              setFinished(undefined);
              setPage("home");
            }}
          />
        )}
        {page === "stickers" && <Stickers all={stickers} onBack={() => setPage("home")} />}
        {page === "calendar" && <Calendar progress={progress} onBack={() => setPage("home")} />}
        {page === "stories" && (
          <Stories
            stories={stories}
            topics={index.topics}
            library={library}
            progress={progress}
            onRead={setReading}
            onIsland={(id) => {
              setProgress((p) => ({ ...p, topic: id }));
              setFinished(undefined);
              setPage("home");
            }}
          />
        )}
        {page === "cards" && <Cards topics={index.topics.filter((t) => t.ready)} byTopic={library.topics} progress={progress} onFlag={(id) => setProgress((p) => toggleFlag(p, id, Date.now()))} />}
        {page === "parent" && <Parent words={library.all} library={library} topics={index.topics} progress={progress} setProgress={setProgress} credits={index.credits} source={index.source} stories={stories} />}
      </main>
      {fresh.length > 0 && <NewStickers stickers={fresh} onTake={() => setProgress((p) => giveStickers(p, fresh.map((x) => x.id), Date.now()))} />}
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? "nav-on" : ""}`} onClick={() => setPage(n.id)} aria-current={page === n.id ? "page" : undefined}>
            <Icon name={n.id} />
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
      <Max pose="wave" size="lg" say="你好！我是小狗 Max～" />
      <h1>欢迎来到 KET 单词岛！</h1>
      <p className="muted">我会陪你一座岛一座岛地认识 KET 的全部单词。</p>
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
