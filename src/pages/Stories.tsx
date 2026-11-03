import { rereadDue, toOpen, type Library } from "../lib/data";
import { routeOrder } from "../lib/route";
import type { Progress } from "../store/progress";
import type { Story, Topic, Word } from "../types";
import { Picture } from "../ui/Picture";

const base = import.meta.env.BASE_URL;
/** Locked stories shown as "coming up"; the rest are only counted, so the page is not a wall of locks. */
const SOON = 6;

/**
 * The story book from a child's side: one story to read next at the top (a new one, else one due for
 * another reading, else the one closest to opening, with the very words still missing), then the
 * bookshelf of stories the child can read, then the few stories about to open.
 */
export function Stories(props: {
  stories: Story[];
  topics: Topic[];
  library: Library;
  progress: Progress;
  onRead: (s: Story) => void;
  /** Move to an island, to learn the words a story still needs. */
  onIsland: (id: string) => void;
}) {
  const { stories, topics, library, progress, onRead, onIsland } = props;
  const now = Date.now();
  const route = routeOrder(topics);
  // the island the child is on first, then along the route
  const rank = (s: Story) => (s.topic === progress.topic ? -1 : route.indexOf(s.topic));
  const shown = stories.filter((s) => topics.some((t) => t.id === s.topic && t.ready)).sort((a, b) => rank(a) - rank(b));
  const missing = (s: Story) => toOpen(s, progress.words);
  const fresh = shown.filter((s) => !missing(s) && !progress.stories[s.id]);
  const again = shown.filter((s) => rereadDue(progress.stories[s.id], now));
  const read = shown.filter((s) => progress.stories[s.id] && !again.includes(s));
  // along the route first, so the story suggested is one the child's own learning will open, not a detour
  const locked = shown.filter((s) => missing(s) > 0).sort((a, b) => rank(a) - rank(b) || missing(a) - missing(b));
  const next = fresh[0] ?? again[0] ?? locked[0];
  const shelf = [...fresh, ...again, ...read].filter((s) => s !== next);
  const soon = locked.filter((s) => s !== next).slice(0, SOON);
  const later = locked.length - soon.length - (locked.includes(next) ? 1 : 0);
  const island = (s: Story) => topics.find((t) => t.id === s.topic);

  return (
    <div className="page storybook">
      <h2>故事书</h2>
      <p className="muted">Lily 和 Max 的故事。认识故事里大部分单词，它就会打开；读完答对问题还能得 ⭐。</p>

      {next && (
        <NextStory
          story={next}
          missing={missing(next)}
          again={again.includes(next)}
          island={island(next)}
          here={next.topic === progress.topic}
          words={next.needs.filter((id) => !progress.words[id]).map((id) => library.byId.get(id)).filter((w): w is Word => !!w)}
          onRead={() => onRead(next)}
          onIsland={() => onIsland(next.topic)}
        />
      )}

      <section>
        <h3 className="shelf-title">📚 我的书架 <span className="muted small">{fresh.length + again.length + read.length} 本</span></h3>
        {shelf.length ? (
          <div className="shelf">
            {shelf.map((s) => {
              const log = progress.stories[s.id];
              return (
                <button key={s.id} className="book" onClick={() => onRead(s)}>
                  <Cover story={s} />
                  {!log && <span className="book-ribbon">新</span>}
                  {log && <span className="book-done">✓</span>}
                  <b className="book-title">{s.title}</b>
                  <span className="book-state">
                    {!log ? "新故事！" : again.includes(s) ? "🔁 可以再读一遍" : `⭐ 答对 ${log.best}/${s.questions.length}`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted small shelf-empty">读完第一本故事，它就会放在这里。</p>
        )}
      </section>

      {soon.length > 0 && (
        <section>
          <h3 className="shelf-title">🔒 快要打开的故事</h3>
          <div className="shelf">
            {soon.map((s) => (
              <div key={s.id} className="book book-locked">
                <Cover story={s} />
                <span className="book-lock">🔒</span>
                <b className="book-title">{s.title}</b>
                <span className="book-state">还差 {missing(s)} 个词</span>
              </div>
            ))}
          </div>
          {later > 0 && <p className="muted small">还有 {later} 本故事，学会更多单词就会一本本打开。</p>}
        </section>
      )}
    </div>
  );
}

/** The one story to read next, made big. */
function NextStory(props: {
  story: Story;
  missing: number;
  again: boolean;
  island?: Topic;
  here: boolean;
  words: Word[];
  onRead: () => void;
  onIsland: () => void;
}) {
  const { story, missing, again, island, here, words, onRead, onIsland } = props;
  const open = missing === 0;
  return (
    <section className={`card next-story ${open ? "" : "next-locked"}`}>
      <div className="next-cover">
        <Cover story={story} />
        <span className="next-badge">{open ? (again ? "🔁 再读一遍" : "✨ 新故事") : "🔒 快打开了"}</span>
      </div>
      <div className="next-body">
        <b className="next-title">{story.title}</b>
        <span className="muted">{story.zh}{island ? ` · ${island.zh}岛` : ""}</span>
        {open ? (
          <button className="btn btn-primary btn-huge" onClick={onRead}>
            {again ? "再读一遍 📖" : "开始读 📖"}
          </button>
        ) : (
          <>
            <p className="next-need">再认识 {missing} 个词就能打开，比如：</p>
            <div className="next-words">
              {words.slice(0, 4).map((w) => (
                <span key={w.id} className="next-word">
                  <Picture word={w} size="sm" />
                  <span>{w.word}</span>
                </span>
              ))}
            </div>
            {here ? (
              <p className="muted small">这些词就在你现在的岛上，接着学就能打开。</p>
            ) : (
              <button className="btn btn-primary" onClick={onIsland}>
                去{island?.zh ?? "这座"}岛学这些词 ⛵
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Cover({ story }: { story: Story }) {
  const img = story.pages[0]?.img;
  return <span className="book-cover">{img ? <img src={base + img} alt="" draggable={false} loading="lazy" /> : <span>📖</span>}</span>;
}
