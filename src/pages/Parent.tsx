import { useEffect, useMemo, useRef, useState } from "react";
import type { Library } from "../lib/data";
import { effect, MIN_ANSWERS, pct, type Rate } from "../lib/effect";
import { forecast, type Forecast } from "../session/forecast";
import { daysLeft, FINAL_DAYS, paceFor } from "../session/goal";
import { isGraduated, isMastered, retrievability, type CardState } from "../srs/srs";
import { dayKey, parseProgress, type Progress } from "../store/progress";
import { SKILLS, type Skill, type Story, type Topic, type Word } from "../types";
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
  library: Library;
  topics: Topic[];
  progress: Progress;
  setProgress: (f: (p: Progress) => Progress) => void;
  credits: string;
  stories: Story[];
  source: string;
}) {
  const { words, library, topics, progress, setProgress, credits, source, stories } = props;
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
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
    const of = s === "spell" ? words.filter((w) => w.spell) : words;
    const cards = of.map((w) => progress.words[w.id]?.skills[s]).filter(Boolean) as CardState[];
    return { s, total: of.length, started: cards.length, mastered: cards.filter(isMastered).length, graduated: cards.filter(isGraduated).length };
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
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "tab-on" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
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
            <p className="muted small">
              每个单词分开记忆“认识、听懂、会拼”，一眼看出哪项薄弱。拼写只练 {skillStats[2].total} 个日常常用词（A1 级），其余的词会认、会听就够 KET 用。掌握 = 三周后仍有 90% 把握记得；毕业 = 半年后仍有 90% 把握，不再天天复习（考前冲刺和月度小测答错时会回来）。
            </p>
            {skillStats.map(({ s, total, started, mastered, graduated }) => (
              <div key={s} className="skill-row">
                <span>{SKILL_NAME[s]}</span>
                <div className="bar">
                  <div className="bar-fill bar-soft" style={{ width: `${(started / total) * 100}%` }} />
                  <div className="bar-fill bar-over" style={{ width: `${(mastered / total) * 100}%` }} />
                </div>
                <span className="small">
                  {mastered}/{started}
                  {graduated > 0 && <span className="muted"> · 🎓{graduated}</span>}
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
                    {w.hook && <div className="muted small">💡 {w.hook.text}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <EffectPanel progress={progress} now={now} />
        </>
      )}

      {tab === "plan" && <PlanPanel progress={progress} library={library} topics={topics} set={set} />}

      {tab === "settings" && (
        <>
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
        </>
      )}

      <p className="credits muted small">
        词表依据：{source}
        <br />
        {credits}
      </p>
    </div>
  );
}

/** The parent centre in three tabs, so nothing is three screens down: how it goes, the plan, the settings. */
type Tab = "overview" | "plan" | "settings";
const TABS: [Tab, string][] = [
  ["overview", "📊 概况"],
  ["plan", "🎯 学习计划"],
  ["settings", "⚙️ 设置"],
];

type Set = <K extends keyof Progress["settings"]>(k: K, v: Progress["settings"][K]) => void;

/** "2027-05-20" for a date `months` from now. */
function monthsAhead(now: number, months: number): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return dayKey(d.getTime());
}

const dateZh = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

/**
 * The study plan is one number: new words a day. Reviews follow from what has been learnt, so the
 * finish date and the daily time are worked out from it, by playing the plan forward with the app's
 * own planner and memory model, and shown only as estimates. A goal date is optional: it suggests the
 * pace that would meet it, and its last three weeks aim the reviews at that day.
 */
function PlanPanel({ progress, library, topics, set }: { progress: Progress; library: Library; topics: Topic[]; set: Set }) {
  const { goal, newPerDay } = progress.settings;
  const [f, setF] = useState<Forecast | null>(null);
  const now = Date.now();
  const left = daysLeft(progress, now);
  const met = library.all.filter((w) => progress.words[w.id]).length;
  const remaining = library.all.length - met;
  const pace = paceFor(progress, now, remaining);

  // work the plan out again a moment after the parent stops moving the slider
  useEffect(() => {
    setF(null);
    let live = true;
    const t = setTimeout(async () => {
      const out = await forecast(progress, library, topics, Date.now());
      if (live) setF(out);
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [newPerDay, goal]); // eslint-disable-line react-hooks/exhaustive-deps -- only the plan's inputs

  return (
    <section className="card settings">
      <h3>学习计划</h3>
      <p className="muted small">
        每天的任务就是学几个新词，加上到期的复习。复习不按时间截断，学完当天的词就算完成；下面的日期和分钟数是按孩子平时的答题速度推算的，只作参考。
      </p>
      <label>
        每天新词：<b>{newPerDay} 个</b>
        <input type="range" min={4} max={30} value={newPerDay} onChange={(e) => set("newPerDay", Number(e.target.value))} />
      </label>
      <p className="muted small">
        已认识 {met} / {library.all.length} 个词，还剩 {remaining} 个。
      </p>
      {f ? <ForecastView f={f} now={now} goalDays={goal ? left : 0} /> : <div className="forecast muted small">正在推算学完日期和每天用时…</div>}

      <label>
        学完日期（可选）
        <input className="input" type="date" value={goal ?? ""} min={dayKey(now)} onChange={(e) => set("goal", e.target.value || undefined)} />
      </label>
      <div className="row">
        {[4, 6, 9].map((m) => (
          <button key={m} className="btn btn-small btn-ghost" onClick={() => set("goal", monthsAhead(now, m))}>
            {m} 个月后
          </button>
        ))}
        {goal && (
          <button className="btn btn-small btn-ghost" onClick={() => set("goal", undefined)}>
            不设日期
          </button>
        )}
      </div>
      {goal && pace !== undefined && (
        <div className="forecast">
          要在这天前学完、并留出最后 {FINAL_DAYS} 天冲刺复习，每天需要约 <b>{pace}</b> 个新词。
          {pace !== newPerDay && (
            <button className="btn btn-small" onClick={() => set("newPerDay", Math.max(4, pace))}>
              改成每天 {Math.max(4, pace)} 个
            </button>
          )}
        </div>
      )}
      {goal && pace === undefined && left > 0 && <p className="muted small">离学完日期不到 {FINAL_DAYS} 天：现在是考前冲刺，复习会对准这一天。</p>}
    </section>
  );
}

function ForecastView({ f, goalDays, now }: { f: Forecast; goalDays: number; now: number }) {
  const late = goalDays > 0 && (f.finishDays === null || f.finishDays > goalDays - FINAL_DAYS);
  return (
    <div className={`forecast ${late ? "forecast-warn" : ""}`}>
      <p>
        {f.finishDays === null
          ? "按这个速度两年内学不完全部单词。"
          : f.finishDays === 0
            ? "所有单词都已经认识了，接下来只需要复习。"
            : `预计 ${dateZh(now + f.finishDays * 86_400_000)} 学完全部单词（约 ${f.finishDays} 天）。`}
      </p>
      {f.avgMin > 0 && (
        <p>
          平时每天约 <b>{f.avgMin}</b> 分钟，最忙的日子约 <b>{f.busyMin}</b> 分钟（新词刚学完的那段时间复习最多）。
          {f.catchUpDays > 0 && ` 有 ${f.catchUpDays} 天复习太多，新词会暂停一下。`}
        </p>
      )}
      {late && <p>⚠️ 按这个速度赶不上学完日期（还要留 {FINAL_DAYS} 天冲刺）：可以每天多学几个，或者把日期往后推。</p>}
    </div>
  );
}

/**
 * Whether the plan is working for this child, measured on their own answers. Each number has a target
 * and, when it is off, the change that usually fixes it.
 */
function EffectPanel({ progress, now }: { progress: Progress; now: number }) {
  const e = useMemo(() => effect(progress, now), [progress, now]);
  const target = Math.round(progress.settings.retention * 100);
  const rows: { name: string; how: string; r: Rate; good: (v: number) => boolean; goal: string; fix: string }[] = [
    {
      name: "复习时记得",
      how: "最近 30 天到期复习答对的比例",
      r: e.recall,
      good: (v) => v >= target - 8,
      goal: `约 ${target}%`,
      fix: "明显偏低：复习间隔对孩子太长，可以调高保持率，或攒够记录后拟合孩子的个人参数",
    },
    {
      name: "新词隔天还记得",
      how: "新词第一次隔天复习答对的比例",
      r: e.firstReview,
      good: (v) => v >= 80,
      goal: "≥ 80%",
      fix: "偏低：新词当天没记牢，可以减少每天的新词（把学完日期往后推）",
    },
    {
      name: "难词",
      how: "忘了 3 次以上的词占已学词的比例",
      r: e.hard,
      good: (v) => v < 5,
      goal: "< 5%",
      fix: "偏高：新词节奏太快，复习跟不上，可以把学完日期往后推",
    },
  ];
  return (
    <section className="card">
      <h3>学习效果</h3>
      <p className="muted small">用孩子自己的答题来检验这套方法是否有效：研究结论不一定适合每个孩子。答题少于 {MIN_ANSWERS} 次的项先不下结论。</p>
      <ul className="effect">
        {rows.map((x) => {
          const v = pct(x.r);
          const enough = x.r.n >= MIN_ANSWERS;
          const ok = !enough || x.good(v);
          return (
            <li key={x.name} className={ok ? "" : "effect-off"}>
              <div className="effect-head">
                <b>{x.name}</b>
                <span>{enough ? `${v}%` : "数据还不够"}</span>
              </div>
              <span className="muted small">
                {x.how} · 目标 {x.goal}
                {enough && ` · 共 ${x.r.n} 个`}
              </span>
              {!ok && <span className="small">⚠️ {x.fix}</span>}
            </li>
          );
        })}
        <li>
          <div className="effect-head">
            <b>每天实际用时</b>
            <span>{e.minutes === null ? "数据还不够" : `约 ${e.minutes} 分钟`}</span>
          </div>
          <span className="muted small">最近 7 天里学过的日子，按答题用时估算，只作参考</span>
        </li>
        <li>
          <div className="effect-head">
            <b>月度小测</b>
            <span>{progress.checkups?.length ? `最近 ${pct({ ok: progress.checkups.at(-1)!.right, n: progress.checkups.at(-1)!.total })}%` : "还没做过"}</span>
          </div>
          <span className="muted small">
            每 30 天抽 20 个学过一周以上的词，看中文选英文，检验“想得起英文”的能力
            {!!progress.checkups?.length &&
              " · " + progress.checkups.slice(-6).map((c) => `${new Date(c.t).getMonth() + 1}月 ${c.right}/${c.total}`).join("，")}
          </span>
        </li>
      </ul>
    </section>
  );
}
