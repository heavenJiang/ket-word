import { useEffect, useMemo, useRef, useState } from "react";
import { shuffle } from "../lib/choice";
import { playWord, sfx } from "../lib/audio";
import type { Attempt } from "../srs/grade";
import type { Accent, Word } from "../types";
import { Cheer, Max, praise } from "../ui/Max";
import { Picture, SlowButton, SpeakButton } from "../ui/Picture";

const isLetter = (c: string) => /[a-z]/i.test(c);
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/**
 * Spell the word by tapping letter tiles in order. Easier than typing on a tablet keyboard;
 * stronger memories get extra decoy letters, and retries start with the first letter shown.
 */
export function Tiles(props: {
  word: Word;
  accent: Accent;
  sound: boolean;
  decoys: number;
  firstLetter: boolean;
  onAnswer: (a: Attempt) => void;
}) {
  const { word, accent, sound, decoys, firstLetter, onAnswer } = props;
  const target = word.word.toLowerCase();
  const tiles = useMemo(() => {
    const letters = [...target].filter(isLetter);
    const extra = shuffle([...ALPHABET].filter((c) => !letters.includes(c)), Math.random).slice(0, decoys);
    return shuffle([...letters, ...extra], Math.random).map((ch, id) => ({ id, ch }));
  }, [target, decoys]);

  const firstPos = () => {
    let p = 0;
    while (p < target.length && !isLetter(target[p])) p++;
    return p;
  };
  const [pos, setPos] = useState(() => {
    let p = firstPos();
    if (firstLetter) {
      p++;
      while (p < target.length && !isLetter(target[p])) p++;
    }
    return p;
  });
  const [used, setUsed] = useState<number[]>(() => {
    if (!firstLetter) return [];
    const t = tiles.find((x) => x.ch === target[firstPos()]);
    return t ? [t.id] : [];
  });
  const [shake, setShake] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [done, setDone] = useState<"right" | "gaveup" | null>(null);
  const [cheer] = useState(praise);
  const started = useRef(performance.now());

  useEffect(() => {
    const t = setTimeout(() => playWord(word, accent), 300);
    return () => clearTimeout(t);
  }, [word, accent]);

  const nextPos = (p: number) => {
    p++;
    while (p < target.length && !isLetter(target[p])) p++;
    return p;
  };

  const place = (tileId: number, usedHint: boolean) => {
    const np = nextPos(pos);
    setUsed((u) => [...u, tileId]);
    setPos(np);
    if (np >= target.length) {
      setDone("right");
      sfx("right", sound);
      playWord(word, accent);
      const a = { correct: true, hinted: hinted || usedHint, mistakes, ms: performance.now() - started.current };
      setTimeout(() => onAnswer(a), 1000);
    } else sfx("tap", sound);
  };

  const tap = (t: { id: number; ch: string }) => {
    if (done || used.includes(t.id)) return;
    if (t.ch === target[pos]) return place(t.id, false);
    setMistakes((m) => m + 1);
    setShake(t.id);
    sfx("wrong", sound);
    setTimeout(() => setShake(null), 400);
  };

  const hint = () => {
    const t = tiles.find((x) => !used.includes(x.id) && x.ch === target[pos]);
    if (!t || done) return;
    setHinted(true);
    place(t.id, true);
  };

  const giveUp = () => {
    setDone("gaveup");
    setPos(target.length);
    playWord(word, accent);
  };

  return (
    <div className="question">
      <div className="prompt">拼一拼：点字母，拼出这个单词</div>
      <div className="stem stem-tiles">
        <Picture word={word} size="sm" />
        <div>
          <div className="stem-zh">{word.zh}</div>
          <SpeakButton onClick={() => playWord(word, accent)} label="听" />
          <SlowButton onClick={() => playWord(word, accent, true)} />
        </div>
      </div>

      <div className={`slots ${done === "right" ? "slots-right" : ""}`}>
        {[...word.word].map((c, i) =>
          isLetter(c) ? (
            <span key={i} className={`slot ${i < pos ? "slot-full" : ""} ${i === pos && !done ? "slot-next" : ""}`}>
              {i < pos ? c.toLowerCase() : ""}
            </span>
          ) : (
            <span key={i} className="slot-gap">
              {c === " " ? "" : c}
            </span>
          ),
        )}
      </div>

      <div className="tiles">
        {tiles.map((t) => (
          <button
            key={t.id}
            className={`tile ${used.includes(t.id) ? "tile-used" : ""} ${shake === t.id ? "tile-shake" : ""}`}
            onClick={() => tap(t)}
            disabled={used.includes(t.id) || !!done}
          >
            {t.ch}
          </button>
        ))}
      </div>

      {!done && (
        <div className="row row-center">
          <button className="btn btn-ghost btn-small" onClick={hint}>
            💡 给我一个字母
          </button>
          {mistakes >= 2 && (
            <button className="btn btn-ghost btn-small" onClick={giveUp}>
              👀 看答案
            </button>
          )}
        </div>
      )}
      {done === "right" && <Cheer text={cheer} />}
      {done === "gaveup" && (
        <div className="reveal">
          <Max pose="think" size="sm" say="没关系，看清楚再记一次：" />
          <div className="reveal-word">{word.word}</div>
          <button
            className="btn btn-primary"
            onClick={() => onAnswer({ correct: false, hinted: true, mistakes, ms: performance.now() - started.current })}
          >
            记住了！
          </button>
        </div>
      )}
    </div>
  );
}
