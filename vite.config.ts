import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Changes when any of Max's pictures does: in their address, so a redrawn one is not hidden by a cache. */
function maxVersion() {
  const hash = createHash("sha1");
  for (const f of readdirSync("public/media/ui").sort()) hash.update(readFileSync(`public/media/ui/${f}`));
  return hash.digest("hex").slice(0, 8);
}

export default defineConfig({
  base: process.env.KET_BASE ?? "/",
  plugins: [react()],
  define: { __MAX_V__: JSON.stringify(maxVersion()) },
  server: { port: 5199 },
});
