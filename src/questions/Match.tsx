import { useMemo, useState } from "react";
import { shuffle } from "../lib/choice";
import { playWord, sfx } from "../lib/audio";
import type { Accent, Word } from "../types";
import { Picture } from "../ui/Picture";

type Side = "pic" | "word";

/**
 * Pair each picture (or, for a word with no picture, its meaning) with its word, right after meeting a group. Not graded: it is one more
 * easy retrieval of every new word, played as a game, before the scored questions start.
 */
export function Match({ words, accent, sound, onDone }: { words: Word[]; accent: Accent; sound: boolean; onDone: () => void }) {
  const pics = useMemo(() => shuffle(words, Math.random), [words]);
  const labels = useMemo(() => shuffle(words, Math.random), [words]);
  const [sel, setSel] = useState<{ side: Side; id: string } | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [miss, setMiss] = useState<string[]>([]);

  const tap = (side: Side, w: Word) => {
    if (matched.includes(w.id)) return;
    if (side === "word") playWord(w, accent);
    if (!sel || sel.side === side) return setSel({ side, id: w.id });
    if (sel.id === w.id) {
      const now = [...matched, w.id];
      setMatched(now);
      setSel(null);
      sfx("right", sound);
      if (now.length === words.length) setTimeout(onDone, 900);
    } else {
      sfx("wrong", sound);
      setMiss([`${sel.side}:${sel.id}`, `${side}:${w.id}`]);
      setSel(null);
      setTimeout(() => setMiss([]), 450);
    }
  };

  const cls = (side: Side, w: Word) =>
    `match-item ${matched.includes(w.id) ? "match-done" : ""} ${sel?.side === side && sel.id === w.id ? "match-sel" : ""} ${
      miss.includes(`${side}:${w.id}`) ? "match-miss" : ""
    }`;

  return (
    <div className="question">
      <div className="prompt">配对游戏：把图片和单词连起来</div>
      <div className="match">
        <div className="match-col">
          {pics.map((w) => (
            <button key={w.id} className={cls("pic", w)} onClick={() => tap("pic", w)}>
              {w.media.img ? <Picture word={w} size="sm" /> : <span className="match-zh">{w.zh}</span>}
            </button>
          ))}
        </div>
        <div className="match-col">
          {labels.map((w) => (
            <button key={w.id} className={`${cls("word", w)} match-word`} onClick={() => tap("word", w)}>
              {w.word}
            </button>
          ))}
        </div>
      </div>
      <p className="muted center small">{matched.length === words.length ? "全部配对成功！🎉" : `已配对 ${matched.length} / ${words.length}`}</p>
    </div>
  );
}
