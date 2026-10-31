import { useEffect, useMemo, useRef, useState } from "react";
import { playPage, playWord, readAloud, sfx } from "../lib/audio";
import type { Library } from "../lib/data";
import { STORY_STARS } from "../store/progress";
import type { Accent, Story, StoryQuestion, Word } from "../types";
import { Max, praise } from "../ui/Max";
import { Picture, Senses, SpeakButton, SpeakerIcon } from "../ui/Picture";

const base = import.meta.env.BASE_URL;

/**
 * Read a story page by page: tap any island word for its card, or have the page read aloud with each
 * word lit up as it is spoken. Then three questions about the story. Not graded into word memory:
 * reading is one more friendly meeting with words the child already knows.
 */
export function StoryReader(props: {
  story: Story;
  library: Library;
  accent: Accent;
  sound: boolean;
  /** Read before, so finishing again gives no new stars. */
  readBefore: boolean;
  /** Whether the child has met a word: only the island's words and new ones are underlined. */
  met: (wordId: string) => boolean;
  onDone: (right: number) => void;
  onExit: () => void;
}) {
  const { story, library, accent, sound, onDone, onExit } = props;
  // remembered as it was on opening: finishing records the story, and the stars message must not change
  const [readBefore] = useState(props.readBefore);
  const [page, setPage] = useState(0);
  const [stage, setStage] = useState<"read" | "quiz" | "done">("read");
  const [right, setRight] = useState(0);
  /** Reading the whole story aloud, turning pages by itself, like an audiobook. */
  const [auto, setAuto] = useState(false);
  const total = story.pages.length + story.questions.length;
  const step = stage === "read" ? page : story.pages.length + Math.min(right, story.questions.length);

  return (
    <div className="page story">
      <div className="learn-top">
        <button className="icon-btn" onClick={onExit} aria-label="退出">
          ✕
        </button>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${stage === "done" ? 100 : (step / total) * 100}%` }} />
        </div>
        <span className="story-name">{story.zh}</span>
      </div>

      {stage === "read" && (
        <StoryPageView
          key={page}
          story={story}
          index={page}
          library={library}
          accent={accent}
          met={props.met}
          auto={auto}
          setAuto={setAuto}
          onPrev={page > 0 ? () => setPage(page - 1) : undefined}
          onNext={() => (page + 1 < story.pages.length ? setPage(page + 1) : setStage("quiz"))}
          last={page + 1 === story.pages.length}
        />
      )}
      {stage === "quiz" && (
        <Quiz
          questions={story.questions}
          sound={sound}
          onDone={(n) => {
            setRight(n);
            setStage("done");
            sfx("done", sound);
            onDone(n);
          }}
        />
      )}
      {stage === "done" && (
        <div className="center finish">
          <Max pose="cheer" size="lg" />
          <h2>{right === story.questions.length ? "全部答对！" : "读完啦！"}</h2>
          <p>
            答对 <b>{right}</b> / {story.questions.length} 题
            {!readBefore && (
              <>
                ，得到 <b>+{STORY_STARS + right}</b> ⭐
              </>
            )}
          </p>
          <button className="btn btn-primary" onClick={onExit}>
            回到故事书
          </button>
        </div>
      )}
    </div>
  );
}

function StoryPageView(props: {
  story: Story;
  index: number;
  library: Library;
  accent: Accent;
  met: (wordId: string) => boolean;
  auto: boolean;
  setAuto: (on: boolean) => void;
  onPrev?: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const { story, index, library, accent, met, auto, setAuto, onPrev, onNext, last } = props;
  const island = useMemo(() => new Set(story.needs), [story]);
  const page = story.pages[index];
  const [open, setOpen] = useState<Word | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [showZh, setShowZh] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  // a page turned by continuous reading starts reading by itself
  useEffect(() => {
    if (auto) read(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, as the page opens

  // where each segment starts in the page text, to match the voice's word positions
  const starts = useMemo(() => {
    let at = 0;
    return page.segments.map((s) => {
      const start = at;
      at += typeof s === "string" ? s.length : s.t.length;
      return start;
    });
  }, [page]);

  const read = (continuous = false) => {
    if (reading) {
      stopRef.current();
      setReading(false);
      setLit(null);
      setAuto(false);
      return;
    }
    setReading(true);
    if (continuous) setAuto(true);
    const onWord = (at: number) => setLit(segmentAt(starts, at));
    const onEnd = () => {
      setReading(false);
      setLit(null);
      // reading the whole story: turn the page after a breath (the last page stops here)
      if (continuous || autoRef.current) {
        if (last) setAuto(false);
        else setTimeout(() => autoRef.current && onNext(), 900);
      }
    };
    // the recording when there is one; the browser's voice only for pages not recorded yet
    stopRef.current = page.audio && page.marks ? playPage(page.audio, page.marks, page.en, accent, onWord, onEnd) : readAloud(page.en, accent, onWord, onEnd);
  };

  return (
    <div className="story-page">
      {page.img && (
        <div className="story-pic">
          <img src={base + page.img} alt="" draggable={false} />
        </div>
      )}
      <p className="story-text">
        {page.segments.map((s, i) => {
          if (typeof s === "string") {
            // plain text: light up the word being read even when it is not an island word
            return (
              <span key={i} className={lit === i ? "lit" : ""}>
                {s}
              </span>
            );
          }
          const w = library.byId.get(s.id);
          return (
            <button
              key={i}
              className={`story-word ${island.has(s.id) || !met(s.id) ? "" : "story-word-plain"} ${lit === i ? "lit" : ""}`}
              onClick={() => w && (setOpen(w), playWord(w, accent))}
            >
              {s.t}
            </button>
          );
        })}
      </p>
      {showZh && <p className="story-zh">{page.zh}</p>}

      <div className="row row-center">
        <button className={`btn ${reading ? "btn-rec" : ""}`} onClick={() => read()}>
          <span className="btn-icon">
            <SpeakerIcon playing={reading} />
          </span>
          {reading ? "停一停" : "读给我听"}
        </button>
        {!reading && index === 0 && (
          <button className="btn btn-ghost" onClick={() => read(true)}>
            🎧 从头读到尾
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setShowZh(!showZh)}>
          {showZh ? "隐藏中文" : "看中文"}
        </button>
      </div>
      <p className="muted small center">点单词可以看它的卡片，带下划线的是这座岛的词和新词</p>

      <div className="row">
        {onPrev && (
          <button className="btn btn-ghost" onClick={onPrev}>
            ← 上一页
          </button>
        )}
        <button className="btn btn-primary btn-grow" onClick={onNext}>
          {last ? "读完了，来答题 →" : `下一页 →（${index + 1}/${story.pages.length}）`}
        </button>
      </div>

      {open && (
        <div className="sheet" onClick={() => setOpen(null)}>
          <div className="card sheet-card word-pop" onClick={(e) => e.stopPropagation()}>
            <Picture word={open} size="md" />
            <div className="intro-word">
              <span className="chunks">{open.word}</span>
              <SpeakButton onClick={() => playWord(open, accent)} label={`听 ${open.word}`} />
            </div>
            <Senses word={open} />
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>
              继续读故事
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The segment containing character `at`: the last one starting at or before it. */
function segmentAt(starts: number[], at: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= at) i++;
  return i;
}

function Quiz({ questions, sound, onDone }: { questions: StoryQuestion[]; sound: boolean; onDone: (right: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<boolean | number | null>(null);
  const [right, setRight] = useState(0);
  const [cheer] = useState(praise);
  const q = questions[i];
  const choices: (boolean | number)[] = q.options ? q.options.map((_, k) => k) : [true, false];
  const label = (c: boolean | number) => (typeof c === "boolean" ? (c ? "✓ 对" : "✗ 错") : q.options![c]);

  const choose = (c: boolean | number) => {
    if (picked !== null) return;
    setPicked(c);
    const ok = c === q.answer;
    sfx(ok ? "right" : "wrong", sound);
    if (ok) setRight(right + 1);
  };
  const next = () => {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setPicked(null);
    } else onDone(right);
  };

  return (
    <div className="question">
      <div className="prompt">
        {q.options ? "选一选" : "对还是错？"}（{i + 1}/{questions.length}）
      </div>
      <div className="quiz-q">
        <div className="quiz-en">{q.q}</div>
        <div className="quiz-zh">{q.zh}</div>
      </div>
      <div className={`options options-list ${q.options ? "options-col" : ""}`}>
        {choices.map((c) => (
          <button
            key={String(c)}
            className={`opt ${picked === null ? "" : c === q.answer ? "opt-right" : c === picked ? "opt-wrong" : "opt-dim"}`}
            onClick={() => choose(c)}
          >
            <span className="opt-text opt-en">{label(c)}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="after">
          {picked === q.answer ? <span className="cheer-text center">{cheer}</span> : <Max pose="think" size="sm" say="再看看故事，答案在里面哦" />}
          <button className="btn btn-primary" onClick={next}>
            {i + 1 < questions.length ? "下一题 →" : "看结果"}
          </button>
        </div>
      )}
    </div>
  );
}
