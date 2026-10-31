import { useState } from "react";
import { shuffle } from "../lib/choice";
import type { Library } from "../lib/data";
import { Choice } from "../questions/Choice";
import { CHECKUP_SIZE, type Checkup as Result } from "../store/progress";
import type { Accent } from "../types";
import { Max } from "../ui/Max";

/**
 * The monthly check-up: a random sample of words met at least a week ago, each asked the productive
 * way (see the meaning, pick the English). It leaves memory cards alone, so it measures progress
 * without changing the plan; the parent centre shows how the score moves month by month.
 */
export function Checkup(props: {
  wordIds: string[];
  library: Library;
  accent: Accent;
  sound: boolean;
  last?: Result;
  onDone: (r: Result) => void;
  onExit: () => void;
}) {
  const { library, accent, sound, onDone, onExit } = props;
  /** The previous result, kept from the start: once this one is saved it becomes the latest. */
  const [last] = useState(props.last);
  const [ids] = useState(() => shuffle(props.wordIds, Math.random).slice(0, CHECKUP_SIZE));
  const [i, setI] = useState(-1);
  const [right, setRight] = useState(0);

  if (i < 0)
    return (
      <div className="page center">
        <Max pose="think" size="lg" say="月度小测来啦！看看这个月你记住了多少。" />
        <p className="muted">
          {ids.length} 道题，看中文选英文，大约 3 分钟。
          <br />
          只是看看进步，答错也不会影响你的单词卡。
        </p>
        <button className="btn btn-primary btn-huge" onClick={() => setI(0)}>
          开始小测
        </button>
        <button className="btn btn-ghost" onClick={onExit}>
          下次再说
        </button>
      </div>
    );

  if (i >= ids.length) {
    const better = last && right > Math.round((last.right / last.total) * ids.length);
    return (
      <div className="page center">
        <Max pose="cheer" size="lg" />
        <h2>
          答对 {right} / {ids.length}
        </h2>
        {last && <p className="muted">上次答对 {last.right} / {last.total}{better ? "，进步啦！" : "。"}</p>}
        <button className="btn btn-primary" onClick={onExit}>
          好的
        </button>
      </div>
    );
  }

  const w = library.byId.get(ids[i])!;
  return (
    <div className="page learn">
      <div className="learn-top">
        <button className="icon-btn" onClick={onExit} aria-label="退出">
          ✕
        </button>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${(i / ids.length) * 100}%` }} />
        </div>
        <span className="learn-stars">📝 月度小测</span>
      </div>
      <Choice
        key={w.id}
        word={w}
        pool={library.poolOf.get(w.id) ?? library.all}
        kind="pickWord"
        accent={accent}
        sound={sound}
        onAnswer={(a) => {
          const r = right + (a.correct ? 1 : 0);
          setRight(r);
          if (i + 1 >= ids.length) onDone({ t: Date.now(), right: r, total: ids.length });
          setI(i + 1);
        }}
      />
    </div>
  );
}
