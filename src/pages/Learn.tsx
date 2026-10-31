import { useState } from "react";
import { sfx } from "../lib/audio";
import { Choice } from "../questions/Choice";
import { Intro } from "../questions/Intro";
import { Match } from "../questions/Match";
import { QuickCheck } from "../questions/QuickCheck";
import { gapSentences } from "../lib/sentence";
import { Tiles } from "../questions/Tiles";
import { answer, buildSession, current, isDone, advance, teach } from "../session/session";
import { todayPlan } from "../session/today";
import { ageFactor, gradeAttempt, type Attempt } from "../srs/grade";
import { isHard, Rating, type Grade } from "../srs/srs";
import { addStars, recordCombo, recordGrade, type Progress } from "../store/progress";
import type { Library } from "../lib/data";
import type { Topic, Word } from "../types";
import { Max } from "../ui/Max";
import { Picture } from "../ui/Picture";

/** Bonus stars for finishing a session. */
const FINISH_BONUS = 3;

export function Learn(props: {
  /** The current island, in learning order: where new words come from. */
  words: Word[];
  library: Library;
  topics: Topic[];
  progress: Progress;
  setProgress: (f: (p: Progress) => Progress) => void;
  onExit: () => void;
}) {
  const { words, library, topics, progress, setProgress, onExit } = props;
  const byId = library.byId;
  const { settings } = progress;
  const factor = ageFactor(progress.profile?.age ?? 9);

  const [session, setSession] = useState(() => {
    const plan = todayPlan(library, topics, progress, Date.now());
    return buildSession(plan, progress.words, Math.random, (id) => gapSentences(byId.get(id)!).length > 0);
  });
  const [tally, setTally] = useState({ right: 0, total: 0, stars: 0 });
  /** Right answers in a row, retries included: a small "on fire" reward for focus. */
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState(false);
  /** Words the quick check found the child already knew. */
  const [known, setKnown] = useState<string[]>([]);

  const step = current(session);
  const total = session.steps.length;

  const onAnswer = (a: Attempt) => {
    if (!step || step.type !== "q") return;
    const w = byId.get(step.wordId)!;
    const grade: Grade = gradeAttempt(a, step.kind, factor, [...w.word].filter((c) => /[a-z]/i.test(c)).length);
    const r = answer(session, a.correct, progress.words);
    const run = a.correct ? combo + 1 : 0;
    setCombo(run);
    if (run > progress.records.combo) setProgress((p) => recordCombo(p, run));
    if (r.grade) {
      setProgress((p) => recordGrade(p, step.wordId, step.skill, grade, Date.now(), a.ms));
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
    const met = session.steps.flatMap((x) => (x.type === "intro" ? x.wordIds : [])).map((id) => byId.get(id)!);
    const knew = known.map((id) => byId.get(id)!);
    return (
      <div className="page center finish">
        <Confetti />
        <Max pose="cheer" size="lg" />
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
        {met.length > 0 && (
          <div className="card finish-new">
            <b>今天收集了 {met.length} 张新卡片</b>
            <div className="finish-cards">
              {met.map((w) => (
                <div key={w.id} className="finish-card">
                  <Picture word={w} size="sm" />
                  <span>{w.word}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {knew.length > 0 && <p className="muted">还有 {knew.length} 个词你早就认识：{knew.map((w) => w.word).join("、")}</p>}
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
        {combo >= 3 && (
          <span key={combo} className="combo">
            🔥×{combo}
          </span>
        )}
        <span key={tally.stars} className="learn-stars">
          ⭐ {tally.stars}
        </span>
      </div>
      {step.type === "check" ? (
        <QuickCheck
          key={session.index}
          words={step.wordIds.map((id) => byId.get(id)!)}
          want={step.want}
          poolOf={(w) => library.poolOf.get(w.id) ?? words}
          accent={settings.accent}
          sound={settings.sound}
          factor={factor}
          onKnown={(w, a) => {
            setKnown((k) => [...k, w.id]);
            setProgress((p) => recordGrade(p, w.id, "meaning", Rating.Easy, Date.now(), a.ms, true));
            setTally((t) => ({ ...t, stars: t.stars + 1 }));
          }}
          onDone={(unknown) => next(unknown.length ? teach(session, unknown) : advance(session))}
        />
      ) : step.type === "intro" ? (
        <Intro
          key={session.index}
          words={step.wordIds.map((id) => byId.get(id)!)}
          accent={settings.accent}
          onDone={() => next(advance(session))}
        />
      ) : step.type === "match" ? (
        <Match
          key={session.index}
          words={step.wordIds.map((id) => byId.get(id)!)}
          accent={settings.accent}
          sound={settings.sound}
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
          hard={isHard(progress.words[step.wordId])}
          onAnswer={onAnswer}
        />
      ) : (
        <Choice
          key={session.index}
          word={byId.get(step.wordId)!}
          pool={library.poolOf.get(step.wordId) ?? words}
          kind={step.kind}
          accent={settings.accent}
          sound={settings.sound}
          hard={isHard(progress.words[step.wordId])}
          onAnswer={onAnswer}
        />
      )}
    </div>
  );
}

/** A one-off burst of coloured paper, pure CSS. */
function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, background: CONFETTI[i % CONFETTI.length] }} />
      ))}
    </div>
  );
}

const CONFETTI = ["#ff8a3d", "#4cb8ff", "#2fbf71", "#ffc531", "#ff5a8a"];
