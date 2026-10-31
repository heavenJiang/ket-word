import { useEffect, useRef, useState } from "react";
import { playRecording, playSentence, playWord, stop } from "../lib/audio";
import type { Accent, Word } from "../types";
import { Chunks, Picture, SentenceRow, Senses, SpeakButton } from "../ui/Picture";

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
        {w.of && (
          <div className="new-sense">
            🔁 认识的词，新意思！你已经认识 <b>{w.word}</b>（{w.ofZh}），它还可以表示：
          </div>
        )}
        <button className="tap-pic" onClick={() => playWord(w, accent)} aria-label={`听 ${w.word}`}>
          <Picture word={w} size="lg" />
        </button>
        <div className="intro-word">
          <Chunks word={w} />
          <SpeakButton onClick={() => playWord(w, accent)} label={`听 ${w.word}`} />
        </div>
        <div className="intro-ipa">{w.ipa}</div>
        <Senses word={w} />
        <SentenceRow en={w.sentence.en} zh={w.sentence.zh} onPlay={() => playSentence(w, accent)} />
        <Echo key={w.id} text={w.sentence.en} />
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

/**
 * Longest a recording runs before it stops by itself: a child reads about one word a second,
 * plus time to start. The child can also tap again to finish early.
 */
const echoMs = (text: string) => Math.min(15000, 3000 + text.split(/\s+/).length * 1000);

/** Record the child reading the sentence and play it back, so they can compare with the model. */
function Echo({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "rec" | "ready" | "denied">("idle");
  const url = useRef<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  /** Set while the microphone is being opened, so a double tap never starts two recordings. */
  const opening = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => {
    clearTimeout(timer.current);
    stop();
    if (url.current) URL.revokeObjectURL(url.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return null;

  const start = async () => {
    if (opening.current || rec.current?.state === "recording") return;
    opening.current = true;
    stop(); // the model voice would end up in the recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        clearTimeout(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
        setState("ready");
        playRecording(url.current);
      };
      rec.current = r;
      r.start();
      setState("rec");
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), echoMs(text));
    } catch {
      setState("denied");
    } finally {
      opening.current = false;
    }
  };

  const finish = () => rec.current?.state === "recording" && rec.current.stop();

  return (
    <div className="echo">
      {state === "denied" ? (
        <span className="muted">没有麦克风权限，大声读三遍也很棒！</span>
      ) : (
        <>
          <button className={`btn btn-small ${state === "rec" ? "btn-rec" : ""}`} onClick={state === "rec" ? finish : start}>
            {state === "rec" ? "🎙️ 读完了，点我" : "🎤 跟我读"}
          </button>
          {state === "ready" && (
            <button className="btn btn-small btn-ghost" onClick={() => url.current && playRecording(url.current)}>
              ▶️ 听听我的
            </button>
          )}
        </>
      )}
    </div>
  );
}
