import { useMemo, useRef, useState } from "react";
import { isMastered, retrievability, type CardState } from "../srs/srs";
import { dayKey, parseProgress, type Progress } from "../store/progress";
import { SKILLS, type Skill, type Story, type Word } from "../types";
import { OfflinePanel } from "../ui/Offline";

const SKILL_NAME: Record<Skill, string> = { meaning: "认识词义", listen: "听音辨词", spell: "拼写" };

/** A grown-up check so children don't change their own settings. */
function Gate({ onPass }: { onPass: () => void }) {
  const [q] = useState(() => [6 + Math.floor(Math.random() * 4), 6 + Math.floor(Math.random() * 4)]);
  const [v, setV] = useState("");
  return (
    <div className="page center">
      <div className="big-emoji">👨‍👩‍👧</div>
      <h2>家长中心</h2>
      <p className="muted">请家长回答：{q[0]} × {q[1]} = ?</p>
      <input className="input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <button className="btn btn-primary" onClick={() => Number(v) === q[0] * q[1] && onPass()}>
        进入
      </button>
    </div>
  );
}

export function Parent(props: {
  words: Word[];
  progress: Progress;
  setProgress: (f: (p: Progress) => Progress) => void;
  credits: string;
  stories: Story[];
  source: string;
}) {
  const { words, progress, setProgress, credits, source, stories } = props;
  const [ok, setOk] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const now = Date.now();
  const name = progress.profile?.name ?? "孩子";

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const t = now - (6 - i) * 86_400_000;
        const d = progress.days[dayKey(t)];
        return { label: "日一二三四五六"[new Date(t).getDay()], answered: d?.answered ?? 0, correct: d?.correct ?? 0 };
      }),
    [progress.days, now],
  );
  const maxDay = Math.max(10, ...week.map((d) => d.answered));

  const skillStats = SKILLS.map((s) => {
    const cards = words.map((w) => progress.words[w.id]?.skills[s]).filter(Boolean) as CardState[];
    return { s, started: cards.length, mastered: cards.filter(isMastered).length };
  });

  /** Weakest skill memories right now: what to quiz at dinner tonight. */
  const weak = useMemo(() => {
    const out: { w: Word; skill: Skill; r: number; lapses: number }[] = [];
    for (const w of words) {
      const p = progress.words[w.id];
      if (!p) continue;
      for (const s of SKILLS) {
        const c = p.skills[s];
        if (c && c.reps > 0) out.push({ w, skill: s, r: retrievability(c, now, progress.settings.retention), lapses: c.lapses });
      }
    }
    return out.sort((a, b) => b.lapses - a.lapses || a.r - b.r).slice(0, 5);
  }, [words, progress, now]);

  if (!ok) return <Gate onPass={() => setOk(true)} />;

  const set = <K extends keyof Progress["settings"]>(k: K, v: Progress["settings"][K]) =>
    setProgress((p) => ({ ...p, settings: { ...p.settings, [k]: v } }));

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(progress)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ket-word-${name}-${dayKey(now)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (f: File) => {
    try {
      const p = parseProgress(await f.text());
      if (confirm("用备份文件覆盖当前进度吗？")) setProgress(() => p);
    } catch (e) {
      alert(`导入失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="page parent">
      <h2>家长中心</h2>

      <section className="card">
        <h3>最近 7 天</h3>
        <div className="week">
          {week.map((d, i) => (
            <div key={i} className="week-day">
              <div className="week-bar">
                <div className="week-fill" style={{ height: `${(d.answered / maxDay) * 100}%` }} />
              </div>
              <span className="small">{d.answered}</span>
              <span className="muted small">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>三项能力</h3>
        <p className="muted small">每个单词分开记忆“认识、听懂、会拼”，一眼看出哪项薄弱。掌握 = 三周后仍有 90% 把握记得。</p>
        {skillStats.map(({ s, started, mastered }) => (
          <div key={s} className="skill-row">
            <span>{SKILL_NAME[s]}</span>
            <div className="bar">
              <div className="bar-fill bar-soft" style={{ width: `${(started / words.length) * 100}%` }} />
              <div className="bar-fill bar-over" style={{ width: `${(mastered / words.length) * 100}%` }} />
            </div>
            <span className="small">
              {mastered}/{started}
            </span>
          </div>
        ))}
      </section>

      {weak.length > 0 && (
        <section className="card">
          <h3>今晚考考{name}</h3>
          <p className="muted small">最容易忘的 5 个，吃饭时随口问一问，比多背十个还管用。</p>
          <ul className="weak">
            {weak.map(({ w, skill }) => (
              <li key={w.id + skill}>
                <b>{w.word}</b> <span className="muted">{w.zh}</span>
                <span className="tag">{SKILL_NAME[skill]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card settings">
        <h3>设置</h3>
        <label>
          孩子名字
          <input
            className="input"
            value={progress.profile?.name ?? ""}
            onChange={(e) => setProgress((p) => ({ ...p, profile: { age: p.profile?.age ?? 9, name: e.target.value } }))}
          />
        </label>
        <label>
          年龄：{progress.profile?.age ?? 9} 岁
          <input
            type="range" min={6} max={13} value={progress.profile?.age ?? 9}
            onChange={(e) => setProgress((p) => ({ ...p, profile: { name: p.profile?.name ?? "", age: Number(e.target.value) } }))}
          />
        </label>
        <label>
          每天新词：{progress.settings.newPerDay} 个
          <input type="range" min={4} max={16} value={progress.settings.newPerDay} onChange={(e) => set("newPerDay", Number(e.target.value))} />
        </label>
        <label>
          每天复习上限：{progress.settings.reviewCap} 个
          <input type="range" min={10} max={80} step={5} value={progress.settings.reviewCap} onChange={(e) => set("reviewCap", Number(e.target.value))} />
        </label>
        <label>
          发音
          <select className="input" value={progress.settings.accent} onChange={(e) => set("accent", e.target.value as "uk" | "us")}>
            <option value="uk">英音（KET 官方）</option>
            <option value="us">美音</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={progress.settings.sound} onChange={(e) => set("sound", e.target.checked)} />
          音效
        </label>
      </section>

      <OfflinePanel words={words} stories={stories} />

      <section className="card">
        <h3>备份</h3>
        <p className="muted small">进度只保存在这台设备上。换设备或清理浏览器前，请先导出。</p>
        <div className="row">
          <button className="btn" onClick={exportFile}>导出进度</button>
          <button className="btn btn-ghost" onClick={() => file.current?.click()}>导入备份</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
      </section>

      <p className="credits muted small">
        词表依据：{source}
        <br />
        {credits}
      </p>
    </div>
  );
}
