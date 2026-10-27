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

export function SpeakButton({ onClick, label = "听", big }: { onClick: () => void; label?: string; big?: boolean }) {
  return (
    <button className={`speak ${big ? "speak-big" : ""}`} onClick={onClick} aria-label={label}>
      <span aria-hidden>🔊</span>
      {label && <span className="speak-label">{label}</span>}
    </button>
  );
}
