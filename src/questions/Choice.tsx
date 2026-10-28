import { useEffect, useMemo, useRef, useState } from "react";
import { distractors, shuffle } from "../lib/choice";
import { playText, playWord, sfx } from "../lib/audio";
import { gapSentences, mentioned, sentencesOf, splitAt } from "../lib/sentence";
import type { Attempt } from "../srs/grade";
import type { Accent, Sentence, Word } from "../types";
import { Cheer, Max, praise } from "../ui/Max";
import { Picture, SlowButton, SpeakButton } from "../ui/Picture";

type Kind = "pickImage" | "pickMeaning" | "listenPick" | "cloze" | "listenSentence";

const PROMPTS: Record<Kind, string> = {
  pickImage: "听一听，选出对的图片",
  pickMeaning: "这个单词是什么意思？",
  listenPick: "听声音，选出你听到的单词",
  cloze: "选一个词，把句子补完整",
  listenSentence: "听句子，选出句子里说到的图片",
};

/** Options are pictures for these kinds, words or meanings for the others. */
const PICTURE_KINDS: Kind[] = ["pickImage", "listenSentence"];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * Four-option question. Single-word kinds show a picture, the Chinese meaning or the written word;
 * sentence kinds put the word back in one of its example sentences, with a gap to fill or read aloud.
 */
export function Choice(props: {
  word: Word;
  pool: Word[];
  kind: Kind;
  accent: Accent;
  sound: boolean;
  onAnswer: (a: Attempt) => void;
}) {
  const { word, pool, accent, sound, onAnswer } = props;
  // a gap question needs a sentence with the word in it; fall back to the meaning question without one
  const kind: Kind = props.kind === "cloze" && gapSentences(word).length === 0 ? "pickMeaning" : props.kind;
  const sentence = useMemo<Sentence | null>(() => {
    if (kind === "cloze") return pick(gapSentences(word)) ?? null;
    if (kind === "listenSentence") return pick(sentencesOf(word));
    return null;
  }, [word, kind]);
  const options = useMemo(() => {
    // a word the sentence also mentions would be a second right answer
    const exclude = sentence ? mentioned(sentence.en, pool) : [];
    const wrong = distractors(word, pool, 3, Math.random, kind === "listenPick", { samePos: kind === "cloze", exclude });
    return shuffle([word, ...wrong], Math.random);
  }, [word, pool, kind, sentence]);
  const [picked, setPicked] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [cheer] = useState(praise);
  const started = useRef(performance.now());
  const result = useRef<Attempt | null>(null);

  const listen = (slow = false) => (sentence && kind === "listenSentence" ? playText(sentence.en, accent, slow) : playWord(word, accent, slow));

  useEffect(() => {
    if (kind === "pickMeaning" || kind === "cloze") return;
    const t = setTimeout(() => listen(), 300);
    return () => clearTimeout(t);
  }, [word, kind, accent]);

  const choose = (w: Word) => {
    if (picked) return;
    const correct = w.id === word.id;
    setPicked(w.id);
    result.current = { correct, hinted: hidden.length > 0, mistakes: correct ? 0 : 1, ms: performance.now() - started.current };
    sfx(correct ? "right" : "wrong", sound);
    if (correct) {
      // hear the whole sentence once it is complete: the word in context is the point of the question
      if (sentence) setTimeout(() => playText(sentence.en, accent), 300);
      else if (kind === "pickMeaning") playWord(word, accent);
      setTimeout(() => onAnswer(result.current!), sentence ? 2600 : 900);
    } else {
      setTimeout(() => (sentence ? playText(sentence.en, accent) : playWord(word, accent)), 500);
    }
  };

  /** Remove one wrong option; the answer then counts as hinted. */
  const hint = () => {
    const wrong = options.find((o) => o.id !== word.id && !hidden.includes(o.id));
    if (wrong) setHidden([...hidden, wrong.id]);
  };

  const state = (w: Word) =>
    !picked ? "" : w.id === word.id ? "opt-right" : w.id === picked ? "opt-wrong" : "opt-dim";

  const gap = kind === "cloze" && sentence ? splitAt(sentence.en, word.word) : null;

  return (
    <div className="question">
      <div className="prompt">{PROMPTS[kind]}</div>
      <div className="stem">
        {kind === "pickImage" && (
          <>
            <div className="stem-word">{word.word}</div>
            <SpeakButton onClick={() => listen()} label="再听" />
          </>
        )}
        {kind === "pickMeaning" && <div className="stem-word stem-word-big">{word.word}</div>}
        {(kind === "listenPick" || kind === "listenSentence") && (
          <>
            <SpeakButton onClick={() => listen()} label={kind === "listenSentence" ? "再听一遍句子" : "再听一遍"} big />
            <SlowButton onClick={() => listen(true)} />
          </>
        )}
        {gap && (
          <div className="gap-sentence">
            {gap[0]}
            <span className={`gap ${picked === word.id ? "gap-filled" : ""}`}>{picked === word.id ? gap[1] : " ".repeat(6)}</span>
            {gap[2]}
          </div>
        )}
      </div>

      <div className={`options options-${PICTURE_KINDS.includes(kind) ? "grid" : "list"}`}>
        {options.map((o) =>
          hidden.includes(o.id) ? (
            <div key={o.id} className="opt opt-gone" />
          ) : (
            <button key={o.id} className={`opt ${state(o)}`} onClick={() => choose(o)}>
              {PICTURE_KINDS.includes(kind) && <Picture word={o} size="sm" />}
              {kind === "pickMeaning" && <span className="opt-text">{o.zh}</span>}
              {(kind === "listenPick" || kind === "cloze") && <span className="opt-text opt-en">{o.word}</span>}
            </button>
          ),
        )}
      </div>

      {!picked && hidden.length < 2 && (
        <button className="btn btn-ghost btn-small hint" onClick={hint}>
          💡 提示
        </button>
      )}

      {picked === word.id && (
        <>
          <Cheer text={cheer} />
          {sentence && <SentenceCard sentence={sentence} />}
        </>
      )}

      {picked && picked !== word.id && (
        <div className="reveal">
          <Max pose="think" size="sm" say="差一点点！记住它：" />
          <Picture word={word} size="sm" />
          <div>
            <div className="reveal-word">{word.word}</div>
            <div className="reveal-zh">{word.zh}</div>
          </div>
          {sentence && <SentenceCard sentence={sentence} />}
          <button className="btn btn-primary" onClick={() => onAnswer(result.current!)}>
            记住了！
          </button>
        </div>
      )}
    </div>
  );
}

/** The full sentence and its translation, shown once the question is answered. */
function SentenceCard({ sentence }: { sentence: Sentence }) {
  return (
    <div className="sentence sentence-after">
      <span className="sentence-en">{sentence.en}</span>
      <span className="sentence-zh">{sentence.zh}</span>
    </div>
  );
}
