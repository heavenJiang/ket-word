import { useEffect, useMemo, useRef, useState } from "react";
import { distractors, shuffle } from "../lib/choice";
import { playWord, sfx } from "../lib/audio";
import type { Attempt } from "../srs/grade";
import type { Accent, Word } from "../types";
import { Cheer, Max, praise } from "../ui/Max";
import { Picture, SlowButton, SpeakButton } from "../ui/Picture";

type Kind = "pickImage" | "pickMeaning" | "listenPick";

const PROMPTS: Record<Kind, string> = {
  pickImage: "听一听，选出对的图片",
  pickMeaning: "这个单词是什么意思？",
  listenPick: "听声音，选出你听到的单词",
};

/** Four-option question: picture, Chinese meaning, or written word, depending on the kind. */
export function Choice(props: {
  word: Word;
  pool: Word[];
  kind: Kind;
  accent: Accent;
  sound: boolean;
  onAnswer: (a: Attempt) => void;
}) {
  const { word, pool, kind, accent, sound, onAnswer } = props;
  const options = useMemo(
    () => shuffle([word, ...distractors(word, pool, 3, Math.random, kind === "listenPick")], Math.random),
    [word, pool, kind],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [cheer] = useState(praise);
  const started = useRef(performance.now());
  const result = useRef<Attempt | null>(null);

  useEffect(() => {
    if (kind === "pickMeaning") return;
    const t = setTimeout(() => playWord(word, accent), 300);
    return () => clearTimeout(t);
  }, [word, kind, accent]);

  const choose = (w: Word) => {
    if (picked) return;
    const correct = w.id === word.id;
    setPicked(w.id);
    result.current = { correct, hinted: hidden.length > 0, mistakes: correct ? 0 : 1, ms: performance.now() - started.current };
    sfx(correct ? "right" : "wrong", sound);
    if (correct) {
      if (kind === "pickMeaning") playWord(word, accent);
      setTimeout(() => onAnswer(result.current!), 900);
    } else {
      setTimeout(() => playWord(word, accent), 500);
    }
  };

  /** Remove one wrong option; the answer then counts as hinted. */
  const hint = () => {
    const wrong = options.find((o) => o.id !== word.id && !hidden.includes(o.id));
    if (wrong) setHidden([...hidden, wrong.id]);
  };

  const state = (w: Word) =>
    !picked ? "" : w.id === word.id ? "opt-right" : w.id === picked ? "opt-wrong" : "opt-dim";

  return (
    <div className="question">
      <div className="prompt">{PROMPTS[kind]}</div>
      <div className="stem">
        {kind === "pickImage" && (
          <>
            <div className="stem-word">{word.word}</div>
            <SpeakButton onClick={() => playWord(word, accent)} label="再听" />
          </>
        )}
        {kind === "pickMeaning" && <div className="stem-word stem-word-big">{word.word}</div>}
        {kind === "listenPick" && (
          <>
            <SpeakButton onClick={() => playWord(word, accent)} label="再听一遍" big />
            <SlowButton onClick={() => playWord(word, accent, true)} />
          </>
        )}
      </div>

      <div className={`options options-${kind === "pickImage" ? "grid" : "list"}`}>
        {options.map((o) =>
          hidden.includes(o.id) ? (
            <div key={o.id} className="opt opt-gone" />
          ) : (
            <button key={o.id} className={`opt ${state(o)}`} onClick={() => choose(o)}>
              {kind === "pickImage" && <Picture word={o} size="sm" />}
              {kind === "pickMeaning" && <span className="opt-text">{o.zh}</span>}
              {kind === "listenPick" && <span className="opt-text opt-en">{o.word}</span>}
            </button>
          ),
        )}
      </div>

      {!picked && hidden.length < 2 && (
        <button className="btn btn-ghost btn-small hint" onClick={hint}>
          💡 提示
        </button>
      )}

      {picked === word.id && <Cheer text={cheer} />}

      {picked && picked !== word.id && (
        <div className="reveal">
          <Max pose="think" size="sm" say="差一点点！记住它：" />
          <Picture word={word} size="sm" />
          <div>
            <div className="reveal-word">{word.word}</div>
            <div className="reveal-zh">{word.zh}</div>
          </div>
          <button className="btn btn-primary" onClick={() => onAnswer(result.current!)}>
            记住了！
          </button>
        </div>
      )}
    </div>
  );
}
