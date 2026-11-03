import { useEffect, useRef, useState } from "react";
import { wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import type { Library } from "../lib/data";
import { ROUTE, routeOrder } from "../lib/route";
import { nextIsland } from "../session/today";
import type { Topic } from "../types";
import { Picture } from "../ui/Picture";
import { islandCover, islandEmoji } from "../lib/islands";

const BOOKS = [
  { book: "Think Starter", title: "第一段航线", level: "A1" },
  { book: "Think 1", title: "第二段航线", level: "A2 · KET" },
  { book: "Think 2", title: "第三段航线", level: "B1" },
] as const;

/** Where each island sits across the page, as a share of the width: the path winds left and right. */
const X = [50, 76, 50, 24];
const ROW = 148;

/**
 * The map as a child sees it: one sea route winding down the page, island after island in learning
 * order (the Think course), Max standing on the island the child is on, the next one glowing, and a
 * flag on every island whose words have all been met. The course's books are the legs of the voyage;
 * its unit-by-unit details are for grown-ups and stay off this page. Tapping an island first shows a
 * peek at it, so a stray tap never moves the child to another island.
 */
export function MapPage(props: { topics: Topic[]; progress: Progress; library: Library; onPick: (id: string) => void }) {
  const { topics, progress, library, onPick } = props;
  const [peek, setPeek] = useState<Topic | null>(null);
  const here = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: "center" });
  }, []);

  const byId = new Map(topics.filter((t) => t.ready).map((t) => [t.id, t]));
  const words = (t: Topic) => library.topics[t.id] ?? [];
  const learned = (t: Topic) => words(t).filter((w) => wordLevel(progress.words[w.id], w.spell) >= 2).length;
  const seen = (t: Topic) => words(t).filter((w) => progress.words[w.id]).length;
  const next = nextIsland(topics, library, progress, progress.topic);

  // each island once, on the leg of the voyage where the route first reaches it
  const order = routeOrder(topics);
  const legOf = new Map<string, string>();
  for (const r of ROUTE) for (const id of r.islands) if (!legOf.has(id)) legOf.set(id, r.book);
  const legs = BOOKS.map((b, i) => ({
    ...b,
    islands: order.filter((id) => (legOf.get(id) ?? BOOKS[BOOKS.length - 1].book) === b.book).map((id) => byId.get(id)!).filter(Boolean),
    first: i === 0,
  })).filter((l) => l.islands.length);
  const soon = topics.filter((t) => !t.ready);

  return (
    <div className="page voyage">
      <header className="voyage-head">
        <h2>单词岛航线</h2>
        <p className="muted">每认识一个单词，岛上就多一面小旗 🚩。想去别的岛，点它看看。</p>
      </header>

      {legs.map((leg) => (
        <section key={leg.book} className="leg">
          <h3 className="leg-title">
            <span className="leg-flag">
              ⛵ {leg.title}
              <small>
                {leg.book} · {leg.level} · {leg.islands.length} 座岛
              </small>
            </span>
          </h3>
          <div className="leg-path" style={{ height: leg.islands.length * ROW }}>
            <svg className="leg-sea" viewBox={`0 0 100 ${leg.islands.length * ROW}`} preserveAspectRatio="none" aria-hidden>
              <path d={pathThrough(leg.islands.length)} />
            </svg>
            {leg.islands.map((t, i) => {
              const all = words(t).length || t.count;
              const on = t.id === progress.topic;
              const done = seen(t) === all;
              const state = on ? "isle-on" : t.id === next ? "isle-next" : done ? "isle-done" : "";
              const share = all ? learned(t) / all : 0;
              return (
                <button
                  key={t.id}
                  ref={on ? here : undefined}
                  className={`isle ${state}`}
                  style={{ left: `${X[i % X.length]}%`, top: i * ROW }}
                  onClick={() => setPeek(t)}
                  aria-label={`${t.zh}岛，认识了 ${learned(t)} / ${all} 个词${on ? "，你在这里" : ""}`}
                >
                  <span className="isle-disc">
                    <svg viewBox="0 0 84 84" className="isle-ring" aria-hidden>
                      <circle cx="42" cy="42" r="38" className="isle-ring-bg" />
                      {share > 0 && <circle cx="42" cy="42" r="38" className="isle-ring-fill" strokeDasharray={`${share * 238.8} 238.8`} transform="rotate(-90 42 42)" />}
                    </svg>
                    <Cover library={library} topic={t} />
                    {on && <img className="isle-max" src={`${import.meta.env.BASE_URL}media/ui/max-happy.webp`} alt="" />}
                    {!on && done && <span className="isle-flag">🚩</span>}
                  </span>
                  <b className="isle-name">{t.zh}</b>
                  <span className="isle-tag">{on ? "📍 在这里" : t.id === next ? "👉 下一座" : `${learned(t)} / ${all}`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {soon.length > 0 && (
        <section className="leg">
          <h3 className="leg-title">🔒 还没开放的岛</h3>
          <div className="soon">
            {soon.map((t) => (
              <span key={t.id} className="soon-item">
                {islandEmoji(t)} {t.zh}
              </span>
            ))}
          </div>
        </section>
      )}

      {peek && (
        <div className="sheet" onClick={() => setPeek(null)}>
          <div className="card sheet-card isle-peek" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-x" onClick={() => setPeek(null)} aria-label="关闭">
              ✕
            </button>
            <span className="isle-peek-cover">
              <Cover library={library} topic={peek} />
            </span>
            <h3>
              {peek.zh}岛 <span className="muted small">{peek.en}</span>
            </h3>
            <div className="isle-peek-words">
              {[...words(peek)]
                .sort((a, b) => Number(!!b.media.img) - Number(!!a.media.img))
                .slice(0, 4)
                .map((w) => (
                  <Picture key={w.id} word={w} size="sm" />
                ))}
            </div>
            <p className="muted">
              {words(peek).length} 个单词 · 已经认识 {seen(peek)} 个
            </p>
            {peek.id === progress.topic ? (
              <button className="btn btn-primary btn-huge" onClick={() => setPeek(null)}>
                你就在这座岛上 📍
              </button>
            ) : (
              <button className="btn btn-primary btn-huge" onClick={() => onPick(peek.id)}>
                去这座岛 ⛵
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** An island's cover picture, or its emoji when it has none. */
function Cover({ library, topic }: { library: Library; topic: Topic }) {
  const w = islandCover(library, topic);
  return w?.media.img ? (
    <img className="isle-img" src={import.meta.env.BASE_URL + w.media.img} alt="" draggable={false} loading="lazy" />
  ) : (
    <span className="isle-emoji">{islandEmoji(topic)}</span>
  );
}

/** A smooth dashed sea lane through the centre of each island on a leg, in the SVG's 0–100 wide space. */
export function pathThrough(n: number): string {
  const pt = (i: number) => [X[i % X.length], i * ROW + 42] as const;
  let d = `M ${pt(0)[0]} ${pt(0)[1]}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pt(i - 1);
    const [x1, y1] = pt(i);
    const mid = (y0 + y1) / 2;
    d += ` C ${x0} ${mid}, ${x1} ${mid}, ${x1} ${y1}`;
  }
  return d;
}
