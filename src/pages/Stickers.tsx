import { isEarned, type Sticker } from "../lib/stickers";
import { Max } from "../ui/Max";

const KINDS: [Sticker["kind"], string][] = [
  ["words", "认识的朋友"],
  ["streak", "天天坚持"],
  ["gold", "真正掌握"],
  ["combo", "专心致志"],
  ["story", "爱读故事"],
  ["island", "征服岛屿"],
];

/** The sticker book: earned stickers in colour, the rest as grey outlines with how far there is to go. */
export function Stickers({ all, onBack }: { all: Sticker[]; onBack: () => void }) {
  const got = all.filter(isEarned).length;
  return (
    <div className="page">
      <div className="learn-top">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          ←
        </button>
        <h2 className="grow">我的贴纸</h2>
        <span className="chip">
          {got} / {all.length}
        </span>
      </div>
      {KINDS.map(([kind, title]) => {
        const xs = all.filter((s) => s.kind === kind);
        if (!xs.length) return null;
        return (
          <section key={kind}>
            <h3>{title}</h3>
            <div className="stickers">
              {xs.map((s) => (
                <StickerBadge key={s.id} sticker={s} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function StickerBadge({ sticker: s, big }: { sticker: Sticker; big?: boolean }) {
  const earned = isEarned(s);
  const [now, goal] = s.progress;
  return (
    <div className={`sticker sticker-${s.kind} ${earned ? "" : "sticker-locked"} ${big ? "sticker-big" : ""}`}>
      <div className="sticker-disc">
        <span className="sticker-emoji">{s.emoji}</span>
      </div>
      <b className="sticker-name">{s.name}</b>
      {earned ? (
        <span className="sticker-how">{s.how}</span>
      ) : (
        <>
          <div className="bar bar-thin">
            <div className="bar-fill" style={{ width: `${Math.min(100, (now / goal) * 100)}%` }} />
          </div>
          <span className="sticker-how">
            {s.how} · 还差 {goal - now}
          </span>
        </>
      )}
    </div>
  );
}

/** Shown once when stickers are earned, never in the middle of a question. */
export function NewStickers({ stickers, onTake }: { stickers: Sticker[]; onTake: () => void }) {
  return (
    <div className="sheet sheet-center">
      <div className="card sheet-card new-stickers">
        <div className="confetti" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.1}s`, background: ["#ff8a3d", "#4cb8ff", "#2fbf71", "#ffc531", "#ff5a8a"][i % 5] }} />
          ))}
        </div>
        <Max pose="cheer" size="md" say={stickers.length > 1 ? `哇！你得到了 ${stickers.length} 张新贴纸！` : "哇！你得到了一张新贴纸！"} />
        <div className="stickers stickers-new">
          {stickers.map((s) => (
            <StickerBadge key={s.id} sticker={s} big={stickers.length === 1} />
          ))}
        </div>
        <button className="btn btn-primary btn-huge" onClick={onTake}>
          贴进我的贴纸册！
        </button>
      </div>
    </div>
  );
}
