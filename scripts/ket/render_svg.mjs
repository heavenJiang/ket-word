// Render hand-drawn SVG illustrations to 512px WebP in the Word Atlas look.
//
// Usage: node scripts/ket/render_svg.mjs [id ...]
// Reads content/media/svg/<id>.svg, writes content/media/img/<id>.webp.
// Adds the shared paper grain and print texture so every SVG stays clean and editable.
// Needs Google Chrome (set CHROME_PATH if it is not in the default macOS location).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "content/media/svg");
const OUT = join(ROOT, "content/media/img");
const SIZE = 512;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Fine risograph grain plus a soft blotchy paper tone, multiplied over the drawing.
const TEXTURE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${SIZE}" height="${SIZE}">
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 -1.4 0.82"/></filter>
  <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3"/>
    <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.25  0 0 0 0.9 -0.35"/></filter>
  <rect width="512" height="512" filter="url(#paper)" opacity=".12"/>
  <rect width="512" height="512" filter="url(#grain)" opacity=".32"/>
</svg>`;

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
for (const id of ids) {
  const art = readFileSync(join(SRC, `${id}.svg`), "utf8");
  const dataUrl = await page.evaluate(
    async ({ art, texture, size }) => {
      const load = (svg) =>
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        });
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.drawImage(await load(art.replace("<svg ", `<svg width="${size}" height="${size}" `)), 0, 0, size, size);
      g.globalCompositeOperation = "multiply";
      g.drawImage(await load(texture), 0, 0, size, size);
      return c.toDataURL("image/webp", 0.85);
    },
    { art, texture: TEXTURE, size: SIZE },
  );
  writeFileSync(join(OUT, `${id}.webp`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`  ok ${id}`);
}
await browser.close();
