import { useEffect, useRef, useState } from "react";
import type { Word } from "../types";

const base = import.meta.env.BASE_URL;

/** The word's illustration, or its emoji on a soft tile when no illustration exists yet. */
export function Picture({ word, size = "md" }: { word: Word; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`picture picture-${size}`}>
      {word.media.img ? (
        <img src={base + word.media.img} alt="" draggable={false} />
      ) : (
        <span className="picture-emoji" aria-hidden>
          {word.emoji}
        </span>
      )}
    </div>
  );
}

export function Chunks({ word }: { word: Word }) {
  return (
    <span className="chunks">
      {word.chunks.map((c, i) => (
        <span key={i} className={`chunk chunk-${i % 3}`}>
          {c}
        </span>
      ))}
    </span>
  );
}

/** A speaker with two sound waves; the waves pulse while `playing`. Drawn here so it looks the same on every device. */
export function SpeakerIcon({ playing }: { playing?: boolean }) {
  return (
    <svg className={`speaker ${playing ? "speaker-on" : ""}`} viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 9.2h3.2l4.6-3.9c.6-.5 1.5-.1 1.5.7v12c0 .8-.9 1.2-1.5.7l-4.6-3.9H3.5c-.6 0-1-.4-1-1V10.2c0-.6.4-1 1-1z" fill="currentColor" />
      <path className="wave wave-1" d="M15.6 9.1a4 4 0 0 1 0 5.8" />
      <path className="wave wave-2" d="M18.4 6.3a8 8 0 0 1 0 11.4" />
    </svg>
  );
}

/** Shows the waves moving for about as long as a word or short sentence takes to say. */
function usePlaying(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return [on, () => {
    clearTimeout(t.current);
    setOn(true);
    t.current = setTimeout(() => setOn(false), ms);
  }];
}

/**
 * Round "listen" button, always placed to the right of what it reads. Sizes: sm 44px (sentences, answer
 * card), md 52px (next to a word), lg 76px (listening questions). An optional label sits under a big one.
 */
export function SpeakButton({ onClick, label = "听", size = "md", ms = 1200 }: { onClick: () => void; label?: string; size?: "sm" | "md" | "lg"; ms?: number }) {
  const [playing, play] = usePlaying(ms);
  return (
    <button
      className={`spk spk-${size}`}
      onClick={(e) => {
        e.stopPropagation(); // inside a tappable card, listening should not also move on
        play();
        onClick();
      }}
      aria-label={label || "听发音"}
    >
      <span className="spk-dot">
        <SpeakerIcon playing={playing} />
      </span>
      {label && size === "lg" && <span className="spk-label">{label}</span>}
    </button>
  );
}

/** Replay slowly: a second, smaller round button next to the speaker. */
export function SlowButton({ onClick, size = "md" }: { onClick: () => void; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      className={`spk spk-slow spk-${size === "lg" ? "md" : size}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="慢速再听"
    >
      <span className="spk-dot" aria-hidden>
        🐢
      </span>
    </button>
  );
}

/** An example sentence with its translation, and the listen button on the right. */
export function SentenceRow({ en, zh, onPlay }: { en: string; zh: string; onPlay?: () => void }) {
  return (
    <div className="sentence">
      <div className="sentence-text">
        <span className="sentence-en">{en}</span>
        <span className="sentence-zh">{zh}</span>
      </div>
      {onPlay && <SpeakButton onClick={onPlay} label="听句子" size="sm" ms={2600} />}
    </div>
  );
}

/** Parts of speech as children see them in Chinese textbooks, with the abbreviation they will meet in dictionaries. */
const POS: Record<string, [string, string]> = {
  n: ["名词", "n."], "n pl": ["名词复数", "n."], v: ["动词", "v."], "phr v": ["短语动词", "phr v."], mv: ["情态动词", "v."],
  av: ["助动词", "v."], adj: ["形容词", "adj."], adv: ["副词", "adv."], pron: ["代词", "pron."], prep: ["介词", "prep."],
  "prep phr": ["介词短语", "prep."], det: ["限定词", "det."], conj: ["连词", "conj."], exclam: ["感叹词", "excl."],
};

/** The answer, shown after every question: word, then its meanings with their parts of speech. */
export function AnswerCard({ word, picture = true, onSpeak }: { word: Word; picture?: boolean; onSpeak?: () => void }) {
  return (
    <div className="answer">
      {picture && <Picture word={word} size="sm" />}
      <div className="answer-text">
        <div className="answer-word">
          {word.word}
          {word.ipa && <span className="answer-ipa">{word.ipa}</span>}
        </div>
        <Senses word={word} />
      </div>
      {onSpeak && <SpeakButton onClick={onSpeak} label={`听 ${word.word}`} size="sm" />}
    </div>
  );
}

const sensesOf = (w: Word) => w.senses ?? [{ pos: w.pos, zh: w.zh }];

/** The meaning taught here, big; other meanings below, smaller, so a child is not surprised by "I can swim". */
export function Senses({ word }: { word: Word }) {
  const [main, ...others] = sensesOf(word);
  return (
    <div className="senses">
      <PosTags pos={main.pos} />
      <div className="answer-zh">{main.zh}</div>
      {others.length > 0 && (
        <div className="senses-more">
          <span className="senses-label">其他意思</span>
          {others.map((s) => (
            <div key={s.zh} className="sense-more">
              <PosTags pos={s.pos} />
              <span>{s.zh}</span>
              {s.en && <span className="sense-en">{s.en}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Part-of-speech tags: 名词 n. · 动词 v. */
export function PosTags({ pos }: { pos: string[] }) {
  return (
    <div className="answer-pos">
      {pos.map((p) => (
        <span key={p} className="pos">
          {POS[p]?.[0] ?? p} <i>{POS[p]?.[1] ?? ""}</i>
        </span>
      ))}
    </div>
  );
}
