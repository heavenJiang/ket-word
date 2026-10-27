import { useState } from "react";
import { playSentence, playWord } from "../lib/audio";
import { isMastered, wordLevel } from "../srs/srs";
import type { Progress } from "../store/progress";
import { SKILLS, type Skill, type Word } from "../types";
import { Chunks, Picture, SpeakButton } from "../ui/Picture";

const SKILL_BADGE: Record<Skill, string> = { meaning: "👀 认识", listen: "👂 听懂", spell: "✏️ 会拼" };

/** Card album: every word met becomes a card; each mastered skill earns a badge. */
export function Cards({ words, progress }: { words: Word[]; progress: Progress }) {
  const [open, setOpen] = useState<Word | null>(null);
  const met = words.filter((w) => progress.words[w.id]).length;
  const gold = words.filter((w) => wordLevel(progress.words[w.id]) === 3).length;
  const accent = progress.settings.accent;

  return (
    <div className="page">
      <h2>我的单词卡</h2>
      <p className="muted">
        已收集 {met} / {words.length} 张 · 金卡 {gold} 张（认识 + 听懂 + 会拼都掌握）
      </p>
      <div className="album">
        {words.map((w) => {
          const p = progress.words[w.id];
          const level = wordLevel(p);
          return (
            <button key={w.id} className={`album-card level-${level}`} onClick={() => p && setOpen(w)} disabled={!p}>
              {p ? <Picture word={w} size="sm" /> : <div className="album-mystery">?</div>}
              <span className="album-word">{p ? w.word : "· · ·"}</span>
              {p && (
                <span className="album-badges">
                  {SKILLS.map((s) => (
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
              <SpeakButton onClick={() => playWord(open, accent)} label="" big />
            </div>
            <div className="intro-zh">{open.zh}</div>
            <button className="sentence" onClick={() => playSentence(open, accent)}>
              <span className="sentence-en">🔊 {open.sentence.en}</span>
              <span className="sentence-zh">{open.sentence.zh}</span>
            </button>
            <div className="skill-badges">
              {SKILLS.map((s) => (
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
