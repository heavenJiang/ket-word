import { useState } from "react";

const base = import.meta.env.BASE_URL;

/** Max's moods and growth stages, drawn by scripts/ket/gen_mascot.py into public/media/ui. */
export type Pose = "happy" | "cheer" | "think" | "sleep" | "wave" | "stage2" | "stage3" | "stage4";

const FALLBACK: Record<Pose, string> = {
  happy: "🐶", cheer: "🐶", think: "🐶", sleep: "😴", wave: "🐶", stage2: "🐕", stage3: "🐕‍🦺", stage4: "🦮",
};

/** The mascot, with an optional speech bubble. Falls back to an emoji if the picture is missing. */
export function Max({ pose = "happy", size = "md", say }: { pose?: Pose; size?: "sm" | "md" | "lg"; say?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`max max-${size}`}>
      <div className="max-pic">
        {broken ? (
          <span className="max-emoji" aria-hidden>
            {FALLBACK[pose]}
          </span>
        ) : (
          <img src={`${base}media/ui/max-${pose}.webp`} alt="" draggable={false} onError={() => setBroken(true)} />
        )}
      </div>
      {say && <div className="bubble">{say}</div>}
    </div>
  );
}

const PRAISE = ["太棒了！", "Great!", "答对啦！", "Well done!", "真厉害！", "Super!", "Yes!", "好样的！"];

export const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

/** Shown for a moment after a right answer, before the next question slides in. */
export function Cheer({ text }: { text: string }) {
  return (
    <div className="cheer" role="status">
      <Max pose="cheer" size="sm" />
      <span className="cheer-text">{text}</span>
    </div>
  );
}
