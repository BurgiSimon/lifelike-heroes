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

// The render pixel ratio a scene opens at. A screen held in the hand (no fine pointer: a phone, a tablet) opens at
// about a megapixel however dense its glass, never under one render pixel per CSS pixel: a phone's GPU is drawing
// on a few square inches, and the grain and the lens's softness hide the rest. The governor climbs from there when
// the frames have room. A desktop opens at the scene's own ceiling, and so does a still (reduced motion): it is
// drawn once, with no loop to climb, so it is drawn sharp.
const HANDHELD = 1.0e6;   // render pixels a handheld screen opens at
export const opening = (w, h, max) => (finePointer() || reducedMotion() ? max : Math.min(max, Math.max(1, Math.sqrt(HANDHELD / Math.max(1, w * h)))));

// A finger drawn across a scene. The scene's root has touch-action: pan-y, so the page scrolls on a stroke that
// starts upright and leaves one that starts sideways to the scene, to the end, whichever way it turns after. The
// direction is decided here too, after TRAVEL px, and an upright start is let go: a browser whose own pan threshold
// is longer than TRAVEL (Firefox on Android, Chrome on a Windows touch screen) would otherwise hand the scene the
// first steps of every scroll. A tap stays a tap, so its click stays the scene's verb; a click the stroke itself
// ends with is swallowed, and any new press ends that, so the next tap is never lost. move(x, y, t, first) is in CSS
// px of el's box and ms (event time); the first call is at the point and the moment the finger came down, so a speed
// worked out from two calls is honest from the start, and first says to forget wherever a mouse last was. end()
// when it lifts. Touch only: a mouse has hover.
const TRAVEL = 8;   // px a finger moves before it is a stroke and not a tap
export function stroke(el, { move, end }, signal) {
  let f = null; let skip = -1;
  const at = (x, y) => { const r = el.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  el.addEventListener('pointerdown', (e) => {
    skip = -1;
    if (e.pointerType === 'touch' && e.isPrimary && !e.target.closest('button')) f = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, on: false };
  }, { signal });
  el.addEventListener('pointermove', (e) => {
    if (!f || e.pointerId !== f.id) return;
    if (!f.on) {
      const dx = Math.abs(e.clientX - f.x); const dy = Math.abs(e.clientY - f.y);
      if (Math.hypot(dx, dy) < TRAVEL) return;
      if (dy >= dx) { f = null; return; }   // upright: the page's scroll, however late the browser claims it
      f.on = true; move(...at(f.x, f.y), f.t, true);
    }
    move(...at(e.clientX, e.clientY), e.timeStamp, false);
  }, { signal });
  const lift = (e) => {
    if (!f || e.pointerId !== f.id) return;
    if (f.on) { end(); if (e.type === 'pointerup') skip = e.timeStamp + 500; }
    f = null;
  };
  el.addEventListener('pointerup', lift, { signal });
  el.addEventListener('pointercancel', lift, { signal });
  // The page scrolled under the finger, so it was the page's after all: Firefox on Android pans a pan-y stroke as
  // shallow as 30° and sends no pointercancel for it. Capture, because the scroller may be any box the scene sits
  // in; only those count, not a carousel or a panel elsewhere on the page.
  document.addEventListener('scroll', (e) => { if (f?.on && e.target.contains?.(el)) { end(); f = null; } }, { signal, capture: true, passive: true });
  el.addEventListener('click', (e) => { if (e.timeStamp < skip) { skip = -1; e.stopImmediatePropagation(); } }, { signal, capture: true });
}

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
// start: where 'auto' opens (see opening()); it climbs to max from there while the frames have room.
export function governor({ min = 0.6, max = Math.min(devicePixelRatio || 1, 2), start = max, onChange }) {
  const q = quality();
  let ratio = q === 'low' ? min : q === 'high' ? max : clamp(start, min, max); let frames = 0; let load = 0; let calm = 0;
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
