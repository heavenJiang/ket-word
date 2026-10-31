import { useState } from "react";
import { playText, playWord } from "../lib/audio";
import { sentencesOf } from "../lib/sentence";
import { isHard, isMastered, wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import { SKILLS, type Skill, type Topic, type Word } from "../types";
import { Chunks, HookCard, PhonicsKey, Picture, SentenceRow, Senses, SpeakButton } from "../ui/Picture";

const SKILL_BADGE: Record<Skill, string> = { meaning: "👀 认识", listen: "👂 听懂", spell: "✏️ 会拼" };

/**
 * Card album, one tab per open island: every word met becomes a card, each mastered skill earns
 * a badge. Cards not yet met show as silhouettes, so the child can see what is left to collect.
 */
export function Cards({ topics, byTopic, progress }: { topics: Topic[]; byTopic: Record<string, Word[]>; progress: Progress }) {
  const [tab, setTab] = useState(progress.topic);
  const words = byTopic[tab] ?? [];
  const [open, setOpen] = useState<Word | null>(null);
  const met = words.filter((w) => progress.words[w.id]).length;
  const gold = words.filter((w) => wordLevel(progress.words[w.id], w.spell) === 3).length;
  const accent = progress.settings.accent;

  return (
    <div className="page">
      <h2>我的单词卡</h2>
      <div className="tabs">
        {topics.map((t) => (
          <button key={t.id} className={`tab ${t.id === tab ? "tab-on" : ""}`} onClick={() => setTab(t.id)}>
            {t.zh}
          </button>
        ))}
      </div>
      <p className="muted">
        已收集 {met} / {words.length} 张 · 金卡 {gold} 张（认识 + 听懂都掌握，常用词还要会拼）
      </p>
      <div className="album">
        {words.map((w) => {
          const p = progress.words[w.id];
          const level = wordLevel(p, w.spell);
          return (
            <button key={w.id} className={`album-card level-${level}`} onClick={() => p && setOpen(w)} disabled={!p}>
              {p ? <Picture word={w} size="sm" /> : <div className="album-mystery"><Picture word={w} size="sm" /></div>}
              <span className="album-word">{p ? w.word : "· · ·"}</span>
              {p && w.of && <span className="album-sense">新意思</span>}
              {p && (
                <span className="album-badges">
                  {skillsOf(w).map((s) => (
                    <i key={s} className={isMastered(p.skills[s]) ? "on" : ""} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open && (
        <div className="sheet" onClick={() => setOpen(null)}>
          <div className="card sheet-card" onClick={(e) => e.stopPropagation()}>
            <Picture word={open} size="lg" />
            <div className="intro-word">
              <Chunks word={open} />
              <SpeakButton onClick={() => playWord(open, accent)} label={`听 ${open.word}`} />
            </div>
            <PhonicsKey word={open} />
            {isHard(progress.words[open.id]) && <HookCard word={open} />}
            <Senses word={open} />
            {sentencesOf(open).map((x) => (
              <SentenceRow key={x.en} en={x.en} zh={x.zh} onPlay={() => playText(x, accent)} />
            ))}
            <div className="skill-badges">
              {skillsOf(open).map((s) => (
                <span key={s} className={`skill-badge ${isMastered(progress.words[open.id]?.skills[s]) ? "on" : ""}`}>
                  {SKILL_BADGE[s]}
                </span>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The skills a word is learnt in: spelling only for everyday words. */
const skillsOf = (w: Word): Skill[] => SKILLS.filter((s) => s !== "spell" || w.spell);
