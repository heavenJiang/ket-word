/**
 * A short burst of coloured flecks from where the child tapped a right answer: praise lands on the answer
 * itself, not only on a message below it. Skipped when the device asks for reduced motion.
 */
const COLORS = ["#ff8a3d", "#4cb8ff", "#2fbf71", "#ffc531", "#ff5a8a"];
type Fleck = { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number; rot: number; vr: number };
let canvas: HTMLCanvasElement | null = null;
let flecks: Fleck[] = [];
let raf = 0;

export function burstAt(el: Element | null | undefined, count = 30): void {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, count);
}

export function burst(x: number, y: number, count = 30): void {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "burst-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 5;
    flecks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 2.5, r: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], life: 1, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4 });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  const cv = canvas!;
  const g = cv.getContext("2d")!;
  const dpr = cv.width / innerWidth;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  flecks = flecks.filter((f) => f.life > 0);
  for (const f of flecks) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= 0.94;
    f.vy = f.vy * 0.94 + 0.32;
    f.rot += f.vr;
    f.life -= 0.022;
    g.save();
    g.globalAlpha = Math.max(0, f.life);
    g.translate(f.x, f.y);
    g.rotate(f.rot);
    g.fillStyle = f.c;
    if (f.r > 5) g.fillRect(-f.r / 2, -f.r / 2, f.r, f.r * 0.6);
    else {
      g.beginPath();
      g.arc(0, 0, f.r / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  raf = flecks.length ? requestAnimationFrame(tick) : 0;
}
