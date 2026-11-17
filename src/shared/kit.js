// Shared helpers for the three heroes. Hero code imports from here and does not edit it.
const params = new URLSearchParams(location.search);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Hash of an index, 0..1: the same scene on every load.
export const rnd = (i) => {
  let t = Math.imul(i + 1, 0x9e3779b9);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ?reduced forces the reduced-motion still, so it can be checked without changing OS settings.
export const reducedMotion = () => params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

// ?q=low|high pins the quality tier (the screenshot tool passes q=high); otherwise 'auto' and the governor decides.
export const quality = () => params.get('q') || 'auto';

// Calls cb(dt, t) once per frame (seconds) only while el is on screen and the tab is visible. Returns stop().
export function loop(el, cb) {
  let raf = 0; let last = 0; let seen = false; let dead = false;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now; // clamped: a stalled tab does not fling the scene
    cb(dt, now / 1000);
  };
  const sync = () => {
    const run = seen && !document.hidden && !dead;
    if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); });
  io.observe(el);
  document.addEventListener('visibilitychange', sync);
  return () => { dead = true; sync(); io.disconnect(); document.removeEventListener('visibilitychange', sync); };
}

// Holds the frame rate by scaling the render pixel ratio. Call tick(dt) every frame; onChange(ratio) fires when the
// ratio moves. Pinned by ?q=low (min) or ?q=high (max), so screenshots on a software rasteriser stay full quality.
export function governor({ min = 0.6, max = Math.min(devicePixelRatio || 1, 2), onChange }) {
  const q = quality();
  let ratio = q === 'low' ? min : max; let frames = 0; let load = 0; let calm = 0;
  let beat = Infinity; // the display's own frame interval, learnt from the shortest frame: not every screen is 60 Hz
  onChange(ratio);
  return {
    get ratio() { return ratio; },
    tick(dt) {
      if (q !== 'auto') return;
      if (dt > 0.004) beat = Math.min(beat, dt);
      load += dt;
      if (++frames < 30) return;
      const avg = load / frames; frames = 0; load = 0;
      calm = avg < Math.max(1 / 57, beat * 1.05) ? calm + 1 : 0; // at most one late frame in thirty
      const next = avg > 1 / 45 ? Math.max(min, ratio * 0.85) : calm >= 6 ? Math.min(max, ratio * 1.1) : ratio;
      if (next !== ratio) { ratio = next; calm = 0; onChange(ratio); }
    },
  };
}
