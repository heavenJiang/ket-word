import { minutesOn } from "../lib/effect";
import { unitLabel, unitOf } from "../lib/route";
import { daysLeft, NEW_WORD_SECS, secsPerReview } from "../session/goal";
import { dayTasks, extraCap, todayPlan } from "../session/today";
import { dayKey, planOptions, streak, type Progress } from "../store/progress";
import type { Library } from "../lib/data";
import type { Topic, Word } from "../types";
import { maxPic, type Pose } from "../ui/Max";
import { Icon } from "../ui/Icons";
import { islandCover, islandEmoji } from "../lib/islands";
import { Picture } from "../ui/Picture";

const base = import.meta.env.BASE_URL;

/** Max collects explorer gear as the child earns stars: always the same puppy, so he stays "theirs". */
export function petStage(stars: number): { pose: Pose; name: string; next: number | null } {
  if (stars >= 600) return { pose: "stage4", name: "国王 Max 👑", next: null };
  if (stars >= 250) return { pose: "stage3", name: "探险家 Max", next: 600 };
  if (stars >= 80) return { pose: "stage2", name: "小队长 Max", next: 250 };
  return { pose: "happy", name: "小狗 Max", next: 80 };
}

/** What Max says on the home screen. */
function maxLine(name: string, reviews: number, fresh: number, catchUp: boolean): string {
  if (catchUp) return `${name}，好久不见！我们先把老朋友找回来吧。`;
  if (reviews + fresh === 0) return "今天的任务完成啦！单词要睡一觉才记得牢，明天见～";
  if (fresh > 0 && reviews > 0) return `先和 ${reviews} 个老朋友打招呼，再认识 ${fresh} 个新朋友！`;
  if (fresh > 0) return `今天有 ${fresh} 个新朋友等你认识！`;
  return `${reviews} 个老朋友想你了，快去看看它们！`;
}

export function Home(props: {
  progress: Progress;
  topic?: Topic;
  topics: Topic[];
  library: Library;
  /** The island the child just finished, when the app has moved on to the next one. */
  finished?: Topic;
  /** Stories the child can open but has not read yet. */
  newStories: number;
  /** Stories read before and due for another reading. */
  rereadStories: number;
  /** The monthly check-up is due. */
  checkupDue: boolean;
  onCheckup: () => void;
  /** Start the day's session; `more` asks for that many extra new words once the plan is done. */
  onStart: (more?: number) => void;
  onMap: () => void;
  onStories: () => void;
  /** Stickers earned, out of all. */
  stickers: [number, number];
  onStickers: () => void;
  onCalendar: () => void;
  /** The parent centre: rarely needed, so a small button here rather than a tab. */
  onParent: () => void;
}) {
  const { progress, topic, topics, library, finished, newStories, rereadStories, checkupDue, onCheckup, onStart, onMap, onStories, stickers, onStickers, onCalendar, onParent } = props;
  const now = Date.now();
  const plan = todayPlan(library, topics, progress, now);
  const pet = petStage(progress.stars);
  const days = streak(progress.days, now);
  const hasWork = plan.reviews.length + plan.newWords.length > 0;
  const catchUp = plan.backlog > 0 && plan.newWords.length === 0;
  const minutes = Math.max(1, Math.round((plan.reviews.length * secsPerReview(progress) + plan.newWords.length * NEW_WORD_SECS) / 60));
  const met = library.all.filter((w) => progress.words[w.id]).length;
  const left = daysLeft(progress, now);
  const unit = topic && unitOf(topic.id);
  // after the plan: one more group, until the day's new words reach twice the plan
  const opts = planOptions(progress, now, library.all.filter((w) => !progress.words[w.id]).length);
  const newToday = opts.newToday;
  const moreOk = library.all.some((w) => !progress.words[w.id]) && newToday < extraCap(opts.newPerDay);
  // the day is bounded by word counts, not by minutes: count today's tasks, done and still waiting (#2)
  const tasks = dayTasks(plan, opts);
  const cover = topic && islandCover(library, topic);
  /** What Max grows into next, shown beside him so the child sees what the stars are for. */
  const after = pet.next ? petStage(pet.next) : null;

  return (
    <div className="page home">
      <section className="scene">
        <div className="scene-top">
          <div>
            <div className="hello">你好，{progress.profile?.name ?? "小探险家"}！</div>
            <div className="scene-sub">今天也来认识新朋友吧</div>
          </div>
          <button className="parent-entry" onClick={onParent} aria-label="家长中心">
            <Icon name="parent" size={20} />
            <span>家长</span>
          </button>
        </div>
        <div className="scene-badges">
          <span className="badge badge-fire">{days > 0 ? <>🔥 连续 <b>{days}</b> 天</> : <>🌱 今天开始</>}</span>
          <span className="badge badge-star">
            ⭐ <b>{progress.stars}</b>
          </span>
        </div>
        <div className="scene-stage">
          <button className="scene-island" onClick={onMap} aria-label={`现在在${topic?.zh ?? ""}岛，点一下去地图`}>
            <span className="scene-disc">
              {cover?.media.img ? <img src={base + cover.media.img} alt="" draggable={false} /> : <span className="isle-emoji">{topic ? islandEmoji(topic) : "🏝️"}</span>}
            </span>
            <img className="scene-max" src={maxPic(hasWork ? pet.pose : "sleep")} alt="" draggable={false} />
            <span className="scene-name">{topic ? `${topic.zh}岛` : "…"}</span>
            {unit && <span className="scene-unit">{unitLabel(unit)}</span>}
            <span className="scene-change">换一座 ›</span>
          </button>
          <div className="scene-bubble">{maxLine(progress.profile?.name ?? "小探险家", plan.reviews.length, plan.newWords.length, catchUp)}</div>
        </div>
      </section>

      <section className="card hero">
        {finished && <p className="notice">🎉 {finished.zh}岛的单词都认识啦！接下来去{topic?.zh ?? "下一座"}岛。</p>}
        {hasWork ? (
          <>
            <Faces library={library} ids={[...plan.newWords, ...plan.reviews.map((t) => t.wordId)]} fresh={plan.newWords.length > 0} />
            <p className="hero-meta">
              {[plan.reviews.length > 0 && `复习 ${plan.reviews.length}`, plan.newWords.length > 0 && `新词 ${plan.newWords.length}`, `约 ${minutes} 分钟`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {catchUp && (
              <p className="notice">欢迎回来！先把以前的单词找回来，新单词稍后再学（还有 {plan.backlog} 个排队中）。</p>
            )}
            <button className="btn btn-primary btn-huge btn-go" onClick={() => onStart()}>
              开始今天的冒险 🚀
            </button>
          </>
        ) : (
          <div className="center hero-done">
            <b>🎉 今天的任务完成啦！</b>
            {moreOk ? (
              <>
                <p className="muted">还想多学一点？再认识一组新朋友吧：</p>
                <div className="row row-center">
                  {[4, 8].map((n) => (
                    <button key={n} className="btn btn-primary" onClick={() => onStart(n)}>
                      再学 {n} 个新词
                    </button>
                  ))}
                </div>
                <p className="muted small">多学的词明天起也要复习，之后几天复习会多一点。</p>
              </>
            ) : (
              <p className="muted">{newToday > 0 ? "今天认识了很多新朋友，休息一下，明天记得更牢。" : "明天再来，记得更牢。"}</p>
            )}
          </div>
        )}
        {left > 0 && (
          <p className="muted small goal-line">
            🎯 离目标还有 {left} 天 · 已认识 {met} / {library.all.length} 个词
          </p>
        )}
      </section>

      <TodayRing progress={progress} now={now} done={tasks.done} left={tasks.left} onCalendar={onCalendar} />

      {checkupDue && (
        <button className="card story-banner" onClick={onCheckup}>
          <span className="story-banner-icon">📝</span>
          <span>
            <b>月度小测可以做啦</b>
            <span className="muted small">20 道题，看看这个月记住了多少（不影响单词卡）</span>
          </span>
          <span className="muted">›</span>
        </button>
      )}

      {(newStories > 0 || rereadStories > 0) && (
        <button className="card story-banner" onClick={onStories}>
          <span className="story-banner-icon">📖</span>
          <span>
            <b>{newStories > 0 ? `有 ${newStories} 个新故事可以读了！` : `有 ${rereadStories} 个故事可以再读一遍`}</b>
            <span className="muted small">{newStories > 0 ? "你学过的单词都在故事里" : "隔一段时间再读，单词记得更牢"}</span>
          </span>
          <span className="muted">›</span>
        </button>
      )}

      <section className="card grow-card">
        <div className="grow-row">
          <img className="grow-max" src={maxPic(pet.pose)} alt="" draggable={false} />
          <div className="grow-mid">
            <b>{pet.name}</b>
            {after ? (
              <>
                <div className="bar bar-thin">
                  <div className="bar-fill grow-fill" style={{ width: `${Math.min(100, (progress.stars / pet.next!) * 100)}%` }} />
                </div>
                <span className="muted small">
                  再得 {pet.next! - progress.stars} 颗 ⭐ 就变成{after.name}
                </span>
              </>
            ) : (
              <span className="muted small">Max 已经是最厉害的狗狗啦！</span>
            )}
          </div>
          {after && (
            <span className="grow-next">
              <img src={maxPic(after.pose)} alt="" draggable={false} />
              <small>下一个样子</small>
            </span>
          )}
        </div>
        <button className="sticker-entry" onClick={onStickers}>
          <span>🏅 我的贴纸</span>
          <b>
            {stickers[0]} / {stickers[1]}
          </b>
          <span className="muted">›</span>
        </button>
      </section>
    </div>
  );
}

/**
 * Today at a glance: a ring that fills up as the day's tasks are done, and the week's study days as a
 * row of stamps, since keeping the chain going is what makes a child come back tomorrow. A day is
 * bounded by word counts — the day's new words plus as many reviews as fit — so the ring counts tasks,
 * not minutes: once they are done the day is done, however much of the time budget is unused (#2).
 */
function TodayRing({ progress, now, done, left, onCalendar }: { progress: Progress; now: number; done: number; left: number; onCalendar: () => void }) {
  const total = done + left;
  const share = total === 0 ? 1 : done / total;
  const minutes = minutesOn(progress, dayKey(now));
  const today = progress.days[dayKey(now)];
  const r = 34;
  const c = 2 * Math.PI * r;
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * 86_400_000;
    return { label: i === 6 ? "今天" : "日一二三四五六"[new Date(t).getDay()], on: !!progress.days[dayKey(t)]?.answered };
  });
  return (
    <section className="card today-ring">
      <svg viewBox="0 0 84 84" className="ring" aria-label={total === 0 ? "今天没有排任务" : `今天的任务已完成 ${done} 个，共 ${total} 个`}>
        <circle cx="42" cy="42" r={r} className="ring-bg" />
        {share > 0 && <circle cx="42" cy="42" r={r} className="ring-fill" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 42 42)" />}
        <text x="42" y="40" textAnchor="middle" className="ring-num">
          {total === 0 ? "✓" : done}
        </text>
        <text x="42" y="56" textAnchor="middle" className="ring-unit">
          {total === 0 ? "没有任务" : `/ ${total} 个`}
        </text>
      </svg>
      <div className="ring-side">
        <b>
          {total === 0
            ? "今天没有要学的任务，休息一下吧"
            : left === 0
              ? "今天的任务全部完成啦 🎉"
              : done === 0
                ? `今天有 ${total} 个任务，冲呀！`
                : `还剩 ${left} 个任务就完成今天的计划`}
        </b>
        {today?.answered ? (
          <span className="muted small">
            今天练了 {today.answered} 次，答对 {today.correct} 次{today.newWords > 0 && `，认识 ${today.newWords} 个新词`}
            {minutes > 0 && ` · 约 ${minutes} 分钟`}
          </span>
        ) : null}
        <button className="week-stamps" onClick={onCalendar} aria-label="打开打卡日历">
          {week.map((d, i) => (
            <span key={i} className={`stamp ${d.on ? "stamp-on" : ""}`}>
              <i>{d.on ? "🐾" : ""}</i>
              {d.label}
            </span>
          ))}
        </button>
        <button className="cal-link" onClick={onCalendar}>
          📅 打卡日历 ›
        </button>
      </div>
    </section>
  );
}

/**
 * Today's words as a little fan of their pictures, the way a picture book shows who is in it: the child
 * sees whom they will meet before starting, rather than a number of tasks.
 */
function Faces({ library, ids, fresh }: { library: Library; ids: string[]; fresh: boolean }) {
  const words = [...new Set(ids)].map((id) => library.byId.get(id)).filter((w): w is Word => !!w);
  const shown = words.slice(0, 5);
  if (!shown.length) return null;
  return (
    <div className="faces">
      <div className="faces-row">
        {shown.map((w, i) => (
          <span key={w.id} className="face" style={{ zIndex: shown.length - i, rotate: `${[-5, 3, -2, 4, -3][i]}deg` }}>
            <Picture word={w} size="sm" />
          </span>
        ))}
        {words.length > shown.length && <span className="face face-more">+{words.length - shown.length}</span>}
      </div>
      <span className="faces-label">{fresh ? "今天会认识它们" : "今天和它们再见面"}</span>
    </div>
  );
}
