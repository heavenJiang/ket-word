import { useEffect, useRef, useState } from "react";
import { playRecording, playSentence, playWord, sfx, stop } from "../lib/audio";
import { canScore, listen, score, type Score } from "../lib/speech";
import type { Accent, Word } from "../types";
import { Chunks, PhonicsKey, Picture, SentenceRow, Senses, SpeakButton } from "../ui/Picture";

/** First meeting with a small group of words: see, hear, read in chunks, say it back. */
export function Intro({ words, accent, sound, onDone }: { words: Word[]; accent: Accent; sound: boolean; onDone: () => void }) {
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
        <PhonicsKey word={w} />
        <Echo key={`w-${w.id}`} text={w.word} accent={accent} sound={sound} label="🎤 读单词" onModel={() => playWord(w, accent)} />
        <div className="intro-ipa">{w.ipa}</div>
        <Senses word={w} />
        <SentenceRow en={w.sentence.en} zh={w.sentence.zh} onPlay={() => playSentence(w, accent)} />
        <Echo key={`s-${w.id}`} text={w.sentence.en} accent={accent} sound={sound} label="🎤 读句子" onModel={() => playSentence(w, accent)} />
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
 * plus time to start. It also stops when the child stops talking, or taps again.
 */
const echoMs = (text: string) => Math.min(15000, 3000 + text.split(/\s+/).length * 1000);

const CHEERS: Record<Score["stars"], string> = {
  3: "太棒了！每个词都读得清清楚楚！",
  2: "很好！再读一次，争取 3 颗星！",
  1: "有进步！先听原声，再跟着读一遍吧。",
  0: "没听清楚哦，先听原声，再大声读一次！",
};

/**
 * Read the word or sentence aloud: the reading is recorded and played back to compare with the model,
 * and, where the device can recognise speech, scored with up to three stars, each word shown green
 * when it was heard and orange when it was not. A low score invites another go.
 */
function Echo({ text, accent, sound, label, onModel }: { text: string; accent: Accent; sound: boolean; label: string; onModel: () => void }) {
  const [state, setState] = useState<"idle" | "rec" | "ready" | "denied">("idle");
  const [result, setResult] = useState<Score | null>(null);
  const [best, setBest] = useState(0);
  const url = useRef<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  /** Set while the microphone is being opened, so a double tap never starts two recordings. */
  const opening = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopListening = useRef<() => void>(() => {});

  useEffect(() => () => {
    clearTimeout(timer.current);
    stop();
    stopListening.current();
    if (url.current) URL.revokeObjectURL(url.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return null;

  const start = async () => {
    if (opening.current || rec.current?.state === "recording") return;
    opening.current = true;
    stop(); // the model voice would end up in the recording
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        clearTimeout(timer.current);
        stopListening.current();
        stream.getTracks().forEach((t) => t.stop());
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
        setState("ready");
        playRecording(url.current);
      };
      rec.current = r;
      r.start();
      setState("rec");
      if (canScore())
        stopListening.current = listen(accent, (heard) => {
          // the recogniser stops when the child stops talking: so does the recording
          if (r.state === "recording") r.stop();
          if (!heard) return;
          const sc = score(text, heard);
          setResult(sc);
          setBest((b) => Math.max(b, sc.stars));
          if (sc.stars >= 2) sfx(sc.stars === 3 ? "done" : "right", sound);
        });
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), echoMs(text));
    } catch {
      setState("denied");
    } finally {
      opening.current = false;
    }
  };

  const finish = () => rec.current?.state === "recording" && rec.current.stop();

  if (state === "denied") return <div className="echo muted">没有麦克风权限，大声读三遍也很棒！</div>;
  return (
    <div className="echo">
      <div className="echo-row">
        <button className={`btn btn-small ${state === "rec" ? "btn-rec" : result && result.stars < 2 ? "btn-primary" : ""}`} onClick={state === "rec" ? finish : start}>
          {state === "rec" ? "🎙️ 读完了，点我" : state === "ready" ? "🔁 再读一次" : label}
        </button>
        {state === "ready" && (
          <button className="btn btn-small btn-ghost" onClick={() => url.current && playRecording(url.current)}>
            ▶️ 听听我的
          </button>
        )}
        {state === "ready" && (
          <button className="btn btn-small btn-ghost" onClick={onModel}>
            👂 听原声
          </button>
        )}
      </div>
      {result && state !== "rec" && (
        <div className={`echo-score echo-${result.stars}`} key={url.current}>
          <div className="echo-stars" aria-label={`${result.stars} 颗星`}>
            {[1, 2, 3].map((k) => (
              <span key={k} className={k <= result.stars ? "echo-star on" : "echo-star"} style={{ animationDelay: `${k * 0.15}s` }}>
                ★
              </span>
            ))}
          </div>
          {result.words.length > 1 && (
            <div className="echo-words">
              {result.words.map((x, i) => (
                <span key={i} className={x.ok ? "echo-ok" : "echo-miss"}>
                  {x.w}{" "}
                </span>
              ))}
            </div>
          )}
          <span className="small">{CHEERS[result.stars]}</span>
          {best === 3 && result.stars < 3 && <span className="muted small">你读到过 3 颗星，再来一次！</span>}
        </div>
      )}
      {state === "ready" && !result && canScore() && <span className="muted small">这次没能打分，听听自己读得像不像原声？</span>}
    </div>
  );
}
