import { useMemo, useState } from "react";
import { sfx } from "../lib/audio";
import { Choice } from "../questions/Choice";
import { Intro } from "../questions/Intro";
import { Tiles } from "../questions/Tiles";
import { buildPlan } from "../session/plan";
import { advance, answer, buildSession, current, isDone } from "../session/session";
import { ageFactor, gradeAttempt, type Attempt } from "../srs/grade";
import { Rating, type Grade } from "../srs/srs";
import { addStars, planOptions, recordGrade, type Progress } from "../store/progress";
import type { Word } from "../types";

/** Bonus stars for finishing a session. */
const FINISH_BONUS = 3;

export function Learn(props: {
  words: Word[];
  progress: Progress;
  setProgress: (f: (p: Progress) => Progress) => void;
  onExit: () => void;
}) {
  const { words, progress, setProgress, onExit } = props;
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const { settings } = progress;
  const factor = ageFactor(progress.profile?.age ?? 9);

  const [session, setSession] = useState(() => {
    const now = Date.now();
    const plan = buildPlan(words.map((w) => w.id), progress.words, now, planOptions(progress, now));
    return buildSession(plan, progress.words);
  });
  const [tally, setTally] = useState({ right: 0, total: 0, stars: 0 });
  const [finished, setFinished] = useState(false);

  const step = current(session);
  const total = session.steps.length;

  const onAnswer = (a: Attempt) => {
    if (!step || step.type !== "q") return;
    const w = byId.get(step.wordId)!;
    const grade: Grade = gradeAttempt(a, step.kind, factor, [...w.word].filter((c) => /[a-z]/i.test(c)).length);
    const r = answer(session, a.correct, progress.words);
    if (r.grade) {
      setProgress((p) => recordGrade(p, step.wordId, step.skill, grade, Date.now()));
      const star = grade === Rating.Good || grade === Rating.Easy ? 1 : 0;
      setTally((t) => ({ right: t.right + (a.correct ? 1 : 0), total: t.total + 1, stars: t.stars + star }));
    }
    next(r.session);
  };

  const next = (s: typeof session) => {
    setSession(s);
    if (isDone(s)) {
      setFinished(true);
      sfx("done", settings.sound);
      setProgress((p) => addStars(p, FINISH_BONUS, Date.now()));
    }
  };

  if (total === 0) {
    return (
      <div className="page center">
        <div className="big-emoji">🌙</div>
        <h2>今天的任务都完成啦！</h2>
        <p className="muted">记忆需要休息。明天再来，单词会记得更牢。</p>
        <button className="btn btn-primary" onClick={onExit}>
          回到首页
        </button>
      </div>
    );
  }

  if (finished) {
    const pct = tally.total ? Math.round((tally.right / tally.total) * 100) : 100;
    return (
      <div className="page center finish">
        <div className="big-emoji">{pct >= 80 ? "🏆" : pct >= 50 ? "🌟" : "💪"}</div>
        <h2>{pct >= 80 ? "太厉害了！" : pct >= 50 ? "做得很好！" : "坚持就是胜利！"}</h2>
        <div className="finish-stats">
          <div>
            <b>{tally.total}</b>
            <span>练习</span>
          </div>
          <div>
            <b>{pct}%</b>
            <span>答对</span>
          </div>
          <div>
            <b>+{tally.stars + FINISH_BONUS}</b>
            <span>⭐ 星星</span>
          </div>
        </div>
        <p className="muted">Max 吃到了你的星星，长大了一点点！</p>
        <button className="btn btn-primary" onClick={onExit}>
          太好了！
        </button>
      </div>
    );
  }

  if (!step) return null;
  return (
    <div className="page learn">
      <div className="learn-top">
        <button className="icon-btn" onClick={onExit} aria-label="退出">
          ✕
        </button>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${(session.index / total) * 100}%` }} />
        </div>
        <span className="learn-stars">⭐ {tally.stars}</span>
      </div>
      {step.type === "intro" ? (
        <Intro
          key={session.index}
          words={step.wordIds.map((id) => byId.get(id)!)}
          accent={settings.accent}
          onDone={() => next(advance(session))}
        />
      ) : step.kind === "tiles" ? (
        <Tiles
          key={session.index}
          word={byId.get(step.wordId)!}
          accent={settings.accent}
          sound={settings.sound}
          decoys={(progress.words[step.wordId]?.skills.spell?.s ?? 0) >= 7 ? 3 : 0}
          firstLetter={step.retry > 0}
          onAnswer={onAnswer}
        />
      ) : (
        <Choice
          key={session.index}
          word={byId.get(step.wordId)!}
          pool={words}
          kind={step.kind}
          accent={settings.accent}
          sound={settings.sound}
          onAnswer={onAnswer}
        />
      )}
    </div>
  );
}
