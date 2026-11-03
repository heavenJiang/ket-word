import { useEffect, useMemo, useRef, useState } from "react";
import { playText, playWord } from "../lib/audio";
import type { Library } from "../lib/data";
import { islandCover, islandEmoji } from "../lib/islands";
import { routeOrder } from "../lib/route";
import { searchWords } from "../lib/search";
import { sentencesOf } from "../lib/sentence";
import { isHard, isMastered, wordGraduated, wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import { SKILLS, type Skill, type Topic, type Word } from "../types";
import { Chunks, HookCard, PhonicsKey, Picture, SentenceRow, Senses, SpeakButton } from "../ui/Picture";

const SKILL_BADGE: Record<Skill, string> = { meaning: "👀 认识", listen: "👂 听懂", spell: "✏️ 会拼" };
const SKILL_ICON: Record<Skill, string> = { meaning: "👀", listen: "👂", spell: "✏️" };
const base = import.meta.env.BASE_URL;

/**
 * The card album, laid out like a collector's album: how many cards so far across every island, a strip
 * of island covers to flip between, then the island's cards. A card met is face up, its frame showing how
 * well it is known (gold when every skill is mastered) and one icon per skill; a card not met yet lies
 * face down, so the child sees what is left to collect without a page of greyed-out pictures.
 */
export function Cards({ topics: ready, library, progress, onFlag }: { topics: Topic[]; library: Library; progress: Progress; onFlag: (id: string) => void }) {
  const byTopic = library.topics;
  const topics = useMemo(() => {
    const order = routeOrder(ready);
    return [...ready].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [ready]);
  const [tab, setTab] = useState(progress.topic);
  const [query, setQuery] = useState("");
  const all = useMemo(() => {
    const seen = new Map<string, Word>();
    for (const t of topics) for (const w of byTopic[t.id] ?? []) if (!seen.has(w.id)) seen.set(w.id, w);
    return [...seen.values()];
  }, [topics, byTopic]);
  const found = useMemo(() => searchWords(all, query), [all, query]);
  const words = byTopic[tab] ?? [];
  const island = topics.find((t) => t.id === tab);
  const [openWord, setOpen] = useState<Word | null>(null);
  const metOf = (ws: Word[]) => ws.filter((w) => progress.words[w.id]).length;
  const goldOf = (ws: Word[]) => ws.filter((w) => wordLevel(progress.words[w.id], w.spell) === 3).length;
  const met = metOf(words);
  const gold = goldOf(words);
  const allMet = metOf(all);
  const allGold = goldOf(all);
  const accent = progress.settings.accent;
  const searching = query.trim() !== "";
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector(".isle-tab-on")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [searching]);

  const card = (w: Word) => {
    const p = progress.words[w.id];
    const level = wordLevel(p, w.spell);
    if (!p)
      return (
        <div key={w.id} className="album-card album-back">
          <span className="album-back-face">?</span>
          <span className="album-word">{searching ? w.word : "· · ·"}</span>
          {searching && <span className="album-sense">还没学</span>}
        </div>
      );
    return (
      <button key={w.id} className={`album-card level-${level}`} onClick={() => setOpen(w)}>
        <Picture word={w} size="sm" />
        <span className="album-word">{w.word}</span>
        {w.of && <span className="album-sense">新意思</span>}
        {level === 3 && <span className="album-star">⭐</span>}
        {wordGraduated(p, w.spell) && <span className="album-grad" title="毕业：半年后仍记得，不用天天复习了">🎓</span>}
        <span className="album-skills">
          {skillsOf(w).map((s) => (
            <i key={s} className={isMastered(p.skills[s]) ? "on" : ""}>
              {SKILL_ICON[s]}
            </i>
          ))}
        </span>
      </button>
    );
  };

  return (
    <div className="page">
      <header className="album-head">
        <div>
          <h2>我的单词卡</h2>
          <span className="album-head-sub">
            已收集 <b>{allMet}</b> / {all.length} 张 · 金卡 <b>{allGold}</b> 张
          </span>
        </div>
        <span className="album-head-icon">🃏</span>
        <div className="bar album-head-bar">
          <div className="bar-fill" style={{ width: `${(allMet / Math.max(1, all.length)) * 100}%` }} />
        </div>
      </header>
      <input
        className="album-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="找一个词：英文或中文，比如 cat / 猫"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {!searching && (
        <>
          <div className="isle-tabs" ref={strip}>
            {topics.map((t) => {
              const c = islandCover(library, t);
              const ws = byTopic[t.id] ?? [];
              return (
                <button key={t.id} className={`isle-tab ${t.id === tab ? "isle-tab-on" : ""}`} onClick={() => setTab(t.id)}>
                  <span className="isle-tab-pic">{c?.media.img ? <img src={base + c.media.img} alt="" loading="lazy" draggable={false} /> : islandEmoji(t)}</span>
                  <b>{t.zh}</b>
                  <small>
                    {metOf(ws)}/{ws.length}
                  </small>
                </button>
              );
            })}
          </div>
          {island && (
            <div className="album-island">
              <b>{island.zh}岛</b>
              <div className="bar bar-thin">
                <div className="bar-fill" style={{ width: `${(met / Math.max(1, words.length)) * 100}%` }} />
              </div>
              <span className="muted small">
                收集 {met} / {words.length} 张 · 金卡 {gold} 张
              </span>
              <span className="album-legend">👀 认识 · 👂 听懂 · ✏️ 会拼，都会了就是 ⭐ 金卡（会拼只要求常用词）</span>
            </div>
          )}
        </>
      )}
      <div className="album">{(searching ? found : words).map(card)}</div>
      {searching && !found.length && <p className="muted">卡册里没有「{query.trim()}」</p>}

      {openWord && (
        <div className="sheet" onClick={() => setOpen(null)}>
          <div className="card sheet-card" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-x" onClick={() => setOpen(null)} aria-label="关闭">
              ✕
            </button>
            <Picture word={openWord} size="lg" />
            <div className="intro-word">
              <Chunks word={openWord} />
              <SpeakButton onClick={() => playWord(openWord, accent)} label={`听 ${openWord.word}`} />
            </div>
            <PhonicsKey word={openWord} />
            {isHard(progress.words[openWord.id]) && <HookCard word={openWord} />}
            <Senses word={openWord} />
            {sentencesOf(openWord).map((x) => (
              <SentenceRow key={x.en} en={x.en} zh={x.zh} onPlay={() => playText(x, accent)} />
            ))}
            <div className="skill-badges">
              {skillsOf(openWord).map((s) => (
                <span key={s} className={`skill-badge ${isMastered(progress.words[openWord.id]?.skills[s]) ? "on" : ""}`}>
                  {SKILL_BADGE[s]}
                </span>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>
              关闭
            </button>
            {openWord.media.img && (
              <button className={`flag-btn ${progress.flags?.[openWord.id] ? "flag-on" : ""}`} onClick={() => onFlag(openWord.id)}>
                {progress.flags?.[openWord.id] ? "🚩 已告诉家长这张图不对（点一下取消）" : "🚩 这张图看不懂 / 画错了？"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The skills a word is learnt in: spelling only for everyday words. */
const skillsOf = (w: Word): Skill[] => SKILLS.filter((s) => s !== "spell" || w.spell);
