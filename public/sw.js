// Offline support. Paths are relative to the scope, so the app works under any KET_BASE.
//   app shell (page, hashed JS/CSS): cached on first visit, so a reload works with no network
//   data/*.json: network first, so new islands and words arrive; the cache answers when offline
//   media/*: cache first; filled as the child meets words, or all at once from the parent centre.
//     Media paths carry a content hash (?v=…, from build_app_data.py): a redrawn picture has a new
//     address, so it is fetched again and replaces the old copy.
const SHELL = "ket-shell-v2";
const DATA = "ket-data-v1";
const MEDIA = "ket-media-v1";
const scope = new URL(self.registration.scope);

/** The page, its hashed scripts and styles, and the fonts those styles load: everything to start offline. */
async function shellFiles() {
  const html = await (await fetch(scope.href, { cache: "no-cache" })).text();
  const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|webmanifest))"/g)].map((m) => new URL(m[1], scope).href);
  for (const css of files.filter((f) => f.endsWith(".css"))) {
    const text = await (await fetch(css)).text();
    files.push(...[...text.matchAll(/url\(([^)]+\.woff2?)\)/g)].map((m) => new URL(m[1].replace(/["']/g, ""), css).href));
  }
  return [scope.href, ...new Set(files)];
}

self.addEventListener("install", (e) => {
  // on the very first visit these load before the worker is in charge, so fetch them here; files of
  // earlier releases (old hashed scripts and styles) are dropped
  e.waitUntil(
    shellFiles().then(async (files) => {
      const c = await caches.open(SHELL);
      await c.addAll(files);
      const keep = new Set(files);
      for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  const keep = [SHELL, DATA, MEDIA];
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ket-") && !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (name, req, res) => {
  // copy now: the page starts reading the body as soon as it gets the response
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    caches.open(name).then(async (c) => {
      // a new version of a media file replaces the old ones (same path, another ?v=)
      if (name === MEDIA) await c.delete(req, { ignoreSearch: true });
      await c.put(req, copy);
    });
  }
  return res;
};

const cacheFirst = (name, req) => caches.match(req).then((hit) => hit || fetch(req).then((res) => put(name, req, res)));

/**
 * Answer a Range request (audio and video ask for byte ranges) from a full 200 response with 206 and
 * just those bytes: Safari will not play a recording otherwise.
 */
async function ranged(range, res) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? "");
  if (!m || !res || res.status !== 200 || (!m[1] && !m[2])) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

const networkFirst = (name, req) =>
  fetch(req)
    .then((res) => put(name, req, res))
    .catch(() => caches.match(req).then((hit) => hit || Response.error()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);

  if (req.mode === "navigate") {
    // the page itself: fresh when online, the cached copy offline
    e.respondWith(
      fetch(req)
        .then((res) => put(SHELL, scope.href, res))
        .catch(() => caches.match(scope.href)),
    );
  } else if (path.startsWith("media/")) {
    // audio is fetched in ranges: the full file is fetched and cached, and the range cut from it
    const range = req.headers.get("range");
    e.respondWith(cacheFirst(MEDIA, new Request(url.href)).then((res) => (range ? ranged(range, res) : res)));
  } else if (path.startsWith("data/")) {
    e.respondWith(networkFirst(DATA, req));
  } else if (path.startsWith("assets/") || path === "manifest.webmanifest" || path.startsWith("icon-") || path.endsWith(".woff2")) {
    e.respondWith(cacheFirst(SHELL, req)); // file names carry a content hash, so a cached copy is never stale
  }
});
