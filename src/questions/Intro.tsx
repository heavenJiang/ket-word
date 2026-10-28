import { useEffect, useRef, useState } from "react";
import { playSentence, playWord } from "../lib/audio";
import type { Accent, Word } from "../types";
import { Chunks, Picture, SpeakButton } from "../ui/Picture";

/** First meeting with a small group of words: see, hear, read in chunks, say it back. */
export function Intro({ words, accent, onDone }: { words: Word[]; accent: Accent; onDone: () => void }) {
  const [i, setI] = useState(0);
  const w = words[i];

  useEffect(() => {
    const t = setTimeout(() => playWord(w, accent), 350);
    return () => clearTimeout(t);
  }, [w, accent]);

  return (
    <div className="intro">
      <div className="intro-dots">
        {words.map((x, k) => (
          <span key={x.id} className={`dot ${k === i ? "dot-on" : k < i ? "dot-done" : ""}`} />
        ))}
      </div>
      <div className="card intro-card" key={w.id}>
        <button className="tap-pic" onClick={() => playWord(w, accent)} aria-label={`听 ${w.word}`}>
          <Picture word={w} size="lg" />
        </button>
        <div className="intro-word">
          <Chunks word={w} />
          <SpeakButton onClick={() => playWord(w, accent)} label="" big />
        </div>
        <div className="intro-ipa">{w.ipa}</div>
        <div className="intro-zh">{w.zh}</div>
        <button className="sentence" onClick={() => playSentence(w, accent)}>
          <span className="sentence-en">🔊 {w.sentence.en}</span>
          <span className="sentence-zh">{w.sentence.zh}</span>
        </button>
        <Echo key={w.id} />
      </div>
      <div className="row">
        {i > 0 && (
          <button className="btn btn-ghost" onClick={() => setI(i - 1)}>
            ← 上一个
          </button>
        )}
        <button className="btn btn-primary btn-grow" onClick={() => (i + 1 < words.length ? setI(i + 1) : onDone())}>
          {i + 1 < words.length ? "下一个 →" : "我记住啦，开始挑战！"}
        </button>
      </div>
    </div>
  );
}

/** Record the child saying the word and play it back, so they can compare with the model. */
function Echo() {
  const [state, setState] = useState<"idle" | "rec" | "ready" | "denied">("idle");
  const url = useRef<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);

  useEffect(() => () => {
    if (url.current) URL.revokeObjectURL(url.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return null;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
        setState("ready");
        new Audio(url.current).play().catch(() => {});
      };
      rec.current = r;
      r.start();
      setState("rec");
      setTimeout(() => r.state === "recording" && r.stop(), 2500);
    } catch {
      setState("denied");
    }
  };

  return (
    <div className="echo">
      {state === "denied" ? (
        <span className="muted">没有麦克风权限，大声读三遍也很棒！</span>
      ) : (
        <>
          <button className={`btn btn-small ${state === "rec" ? "btn-rec" : ""}`} onClick={start} disabled={state === "rec"}>
            {state === "rec" ? "🎙️ 正在听你说…" : "🎤 跟我读"}
          </button>
          {state === "ready" && (
            <button className="btn btn-small btn-ghost" onClick={() => url.current && new Audio(url.current).play()}>
              ▶️ 听听我的
            </button>
          )}
        </>
      )}
    </div>
  );
}
