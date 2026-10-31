import { useEffect, useState } from "react";
import type { Story, Word } from "../types";

const base = import.meta.env.BASE_URL;
/** Must match the media cache in public/sw.js. */
const MEDIA_CACHE = "ket-media-v1";

/** Every picture and recording of the open islands and their stories, as the app requests them. */
function mediaUrls(words: Word[], stories: Story[]): string[] {
  const paths = new Set<string>();
  for (const w of words) {
    for (const m of [w.media.img, w.media.uk, w.media.us]) if (m) paths.add(m);
    for (const s of w.sentences ?? []) if (s.audio) paths.add(s.audio);
  }
  for (const st of stories) for (const p of st.pages) if (p.img) paths.add(p.img);
  for (const pose of ["happy", "cheer", "think", "sleep", "wave", "stage2", "stage3", "stage4"]) paths.add(`media/ui/max-${pose}.webp`);
  return [...paths].map((p) => new URL(base + p, location.href).href);
}

/**
 * Parent centre: save everything for offline use, e.g. before a trip. Pictures and sounds are
 * otherwise cached one by one as the child meets them.
 */
export function OfflinePanel({ words, stories }: { words: Word[]; stories: Story[] }) {
  const urls = mediaUrls(words, stories);
  const [have, setHave] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  const supported = "caches" in window && "serviceWorker" in navigator;

  useEffect(() => {
    if (!supported) return;
    caches.open(MEDIA_CACHE).then(async (c) => setHave((await Promise.all(urls.map((u) => c.match(u)))).filter(Boolean).length));
  }, [urls.length, supported]); // recount only when the set of files changes

  if (!supported) return null;

  const download = async () => {
    setBusy(true);
    setFailed(0);
    const c = await caches.open(MEDIA_CACHE);
    const todo: string[] = [];
    for (const u of urls) if (!(await c.match(u))) todo.push(u);
    let done = urls.length - todo.length;
    let bad = 0;
    const worker = async () => {
      for (let u = todo.shift(); u; u = todo.shift()) {
        try {
          const res = await fetch(u);
          if (!res.ok) throw new Error(String(res.status));
          await c.put(u, res);
          done++;
        } catch {
          bad++;
        }
        setHave(done);
        setFailed(bad);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker)); // six at a time, like a browser
    setBusy(false);
  };

  const all = have !== null && have >= urls.length;
  return (
    <section className="card">
      <h3>离线使用</h3>
      <p className="muted small">
        学过的图片和声音会自动保存。出门前可以一次下载全部（约 {Math.round(urls.length * 0.016)} MB，建议连着 Wi-Fi），没有网络也能学。
        平板浏览器里选“添加到主屏幕”，就能像 App 一样打开。
      </p>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${have === null ? 0 : (have / urls.length) * 100}%` }} />
      </div>
      <p className="small">
        已保存 {have ?? "…"} / {urls.length} 个文件{failed > 0 && `，${failed} 个下载失败，可以再试一次`}
      </p>
      <button className="btn btn-primary" onClick={download} disabled={busy || all}>
        {all ? "✓ 已全部保存" : busy ? "正在下载…" : "下载全部内容"}
      </button>
    </section>
  );
}
