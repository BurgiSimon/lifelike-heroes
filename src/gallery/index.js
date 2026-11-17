// The gallery: three rows, one per scene. A row that is hovered or focused becomes a window onto its scene's still
// and gets a trace under the pointer in the scene's own manner (grass that parts, ripples, a pencilled line
// between stars); the arrow keys walk the rows; left alone, the page turns from one scene to the next by itself;
// and a chosen row opens into its scene. On a phone the rows are cards to swipe. Without this script the page is
// still three links.
import '../shared/base.css';
import './style.css';
import { soundPref } from '../shared/sound.js';
import { reducedMotion, finePointer, rnd } from '../shared/kit.js';

const list = document.querySelector('.list'); const rows = [...list.querySelectorAll('a')];
const views = document.querySelector('.views'); const stills = [...views.children];
const cards = matchMedia('(max-width: 640px)');   // the phone layout: cards side by side
const calm = reducedMotion();
// the trace's canvas and state (the drawing itself is at the foot of this file)
const cv = document.querySelector('.trace'); const g = cv.getContext('2d');
const tracing = () => finePointer() && !calm && !cards.matches;
const INK = '244 242 236';
let ptr = null; let raf = 0; let last = 0; let clock = 0;
const out = [0, 0, 0];                                   // how far each row's trace has come out, 0 to 1
let blades = []; const ripples = []; let rippled = null; let dripped = 0;
const sky = Array.from({ length: 34 }, (_, i) => ({ u: rnd(i * 3 + 1), v: rnd(i * 3 + 2), m: rnd(i * 3 + 3) }));
const lines = new Map();                                 // star a * 64 + star b → how far the line is drawn
const inside = (r, p, pad = 0) => p && p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;

// ---- which row is lit (on, -1: none): its still shows in its bar. was: the last one that was, for the idle page.
let on = -1; let was = -1;
const set = (i) => {
  on = i; if (i >= 0) was = i;
  stills.forEach((s, k) => s.classList.toggle('is-shown', k === on));
  rows.forEach((a, k) => a.classList.toggle('is-on', k === on));
  list.classList.toggle('has-on', on >= 0);
  kick();
};
// Each still is the size of the screen and cut down to its row's bar, from one edge of the screen to the other: the
// bar is a window onto the scene, and opening the scene is that window growing. LIFT moves a picture up behind its
// window (a share of the screen's height), so the bar shows a telling strip of it: the meadow's horizon, the koi.
const LIFT = { meadow: 0.17, koi: -0.09, stars: 0 };
const place = () => {
  const H = innerHeight;
  rows.forEach((a, k) => {
    const s = stills[k]; if (s.classList.contains('is-opening')) return;
    const r = a.getBoundingClientRect(); const dy = -Math.max(-r.top, Math.min(H - r.bottom, LIFT[a.dataset.id] * H));   // never so far that the window would look past the picture's edge
    s.style.transform = `translateY(${dy}px)`; s.style.clipPath = `inset(${r.top - dy}px 0px ${H - r.bottom + dy}px 0px)`;
  });
};
place(); addEventListener('resize', place); addEventListener('scroll', place, { passive: true }); document.fonts?.ready.then(place);
const held = () => rows.findIndex((a) => a === document.activeElement || (!cards.matches && a.matches(':hover')));

rows.forEach((a, i) => {
  a.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') set(i); });
  a.addEventListener('pointerleave', () => set(held()));
  a.addEventListener('focus', () => set(i));
  a.addEventListener('blur', () => set(held()));
  a.addEventListener('click', (e) => open(e, i));
});
// On a phone the card in the middle is the one that is lit.
const mid = new IntersectionObserver((seen) => { if (cards.matches) for (const e of seen) if (e.isIntersecting) set(rows.indexOf(e.target)); }, { root: list, threshold: 0.6 });
rows.forEach((a) => mid.observe(a));

// ---- the arrow keys walk the rows (Enter is the link's own)
addEventListener('keydown', (e) => {
  const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  const k = rows.indexOf(document.activeElement);
  rows[k < 0 ? (d > 0 ? 0 : rows.length - 1) : (k + d + rows.length) % rows.length].focus();
});

// ---- left alone for a few seconds, the page turns from scene to scene; any input hands it back. A row that is
// held (the pointer rests on it, or it has the focus) stays: the lit row is always the one a click or Enter opens.
let idle = 0; let turning = 0;
const turn = () => {
  const i = (was + 1) % rows.length;
  if (cards.matches) rows[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); else set(i);
};
const wake = () => {
  clearTimeout(idle);
  if (turning) { clearInterval(turning); turning = 0; views.classList.remove('is-drifting'); if (!cards.matches) set(held()); }
  if (!calm) idle = setTimeout(() => { if (held() >= 0) return; views.classList.add('is-drifting'); turn(); turning = setInterval(turn, 5200); }, 4000);
};
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(type, wake, { passive: true });
wake();

// ---- a chosen row opens into its scene: its window grows until it is the screen (on a phone the card grows
// whole), and the scene's page begins on that same picture. A click meant for a new tab stays a plain link.
function open(e, i) {
  if (calm || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const a = rows[i];
  clearTimeout(idle); clearInterval(turning);
  if (cards.matches) {
    const r = a.getBoundingClientRect(); const o = document.createElement('div'); o.className = 'opener'; o.dataset.id = a.dataset.id;
    Object.assign(o.style, { inset: `${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px`, borderRadius: '14px' });
    document.body.append(o); o.getBoundingClientRect();   // laid out where it starts
    Object.assign(o.style, { inset: '0px', borderRadius: '0px' });
  } else {
    set(i); place(); const s = stills[i]; s.getBoundingClientRect();
    s.classList.add('is-opening'); s.style.clipPath = 'inset(0px)'; s.style.transform = 'none';
  }
  document.body.classList.add('is-opening');
  setTimeout(() => { location.href = a.href; }, 640);
}

// ---- the sound switch: one for all three scenes, each opens with its sound as this was left
const sound = document.querySelector('.sound');
sound.addEventListener('click', () => { soundPref.set(!soundPref.get()); sound.textContent = `Sound: ${soundPref.get() ? 'on' : 'off'}`; });
// Shown, or shown again on the way back from a scene: the switch as it stands, and the page closed up again.
addEventListener('pageshow', () => {
  sound.textContent = `Sound: ${soundPref.get() ? 'on' : 'off'}`;
  document.querySelector('.opener')?.remove(); document.body.classList.remove('is-opening');
  for (const s of stills) s.classList.remove('is-opening');
  place(); wake();
});

// ---- traces: what the pointer leaves on a row, drawn on one canvas under the type. For a mouse or a pen on the
// row layout; a lit row without a pointer on it (keyboard, the idle page) gets a quiet version of its own.

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; clock += dt;
  const dpr = Math.min(devicePixelRatio || 1, 2); const W = innerWidth; const H = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = 'round';
  const box = rows.map((a) => a.getBoundingClientRect());
  out.forEach((v, k) => { out[k] = v + ((on === k ? 1 : 0) - v) * (1 - Math.exp(-dt * 5)); });

  // Meadow: grass along the row's foot. It comes up when the row is lit, leans in the wind and parts for the pointer.
  if (out[0] > 0.01) {
    const r = box[0]; const n = Math.floor(r.width / 6);
    if (blades.length !== n) blades = Array.from({ length: n }, (_, i) => ({ x: i * 6 + rnd(i) * 5, h: 9 + 19 * rnd(i + 500) ** 1.6, a: 0, v: 0, ph: rnd(i + 900) * 6.28 }));
    g.beginPath();
    for (const b of blades) {
      const x = r.left + b.x; const y = r.bottom + 2; let want = 0.13 * Math.sin(clock * 1.4 + b.ph + b.x * 0.011);
      if (ptr) { const dx = x - ptr.x; const d = Math.hypot(dx, (y - ptr.y) * 0.55); if (d < 120) want += Math.sign(dx || 1) * (1 - d / 120) ** 2 * 1.15; }
      b.v = (b.v + (want - b.a) * 90 * dt) * 0.86 ** (dt * 60); b.a += b.v * dt * 6;
      const h = b.h * out[0];
      g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(b.a) * h * 0.2, y - h * 0.55, x + Math.sin(b.a) * h, y - Math.cos(b.a) * h);
    }
    g.strokeStyle = `rgb(${INK} / ${0.5 * out[0]})`; g.lineWidth = 1; g.stroke();
  }

  // Koi pond: rings where the pointer has been; a lit row with no pointer on it drips by itself now and then.
  const pond = box[1];
  if (inside(pond, ptr)) {
    if (!rippled || Math.hypot(ptr.x - rippled.x, ptr.y - rippled.y) > 30) { rippled = { ...ptr }; ripples.push({ ...ptr, t: clock }); }
  } else if (on === 1 && clock - dripped > 0.9) { dripped = clock; ripples.push({ x: pond.left + pond.width * Math.random(), y: pond.top + pond.height * (0.25 + 0.5 * Math.random()), t: clock }); }
  if (ripples.length) {
    g.save(); g.beginPath(); g.rect(pond.left, pond.top + 1, pond.width, pond.height); g.clip(); g.lineWidth = 1;
    for (let i = ripples.length; i--;) {
      const p = ripples[i]; const age = (clock - p.t) / 1.6;
      if (age >= 1) { ripples.splice(i, 1); continue; }
      for (const lag of [0, 0.22]) {
        if (age < lag) continue;
        g.beginPath(); g.arc(p.x, p.y, 4 + (age - lag) * 86, 0, 6.2832); g.strokeStyle = `rgb(${INK} / ${0.42 * (1 - age) ** 1.5})`; g.stroke();
      }
    }
    g.restore();
  }

  // Star chart: the row's own small sky, and a pencilled line through the stars nearest the pointer (a lit row
  // without one is pencilled by a point that wanders along it).
  if (out[2] > 0.01 || lines.size) {
    const r = box[2]; const at = (s) => [r.left + s.u * r.width, r.top + 8 + s.v * (r.height - 16)];
    const pen = inside(r, ptr, 30) ? ptr : on === 2 ? { x: r.left + r.width * (0.5 + 0.38 * Math.sin(clock * 0.45)), y: r.top + r.height * (0.5 + 0.3 * Math.sin(clock * 0.7)) } : null;
    const want = new Set();
    if (pen) {
      const near = sky.map((s, i) => { const [x, y] = at(s); return { i, x, y, d: Math.hypot(x - pen.x, y - pen.y) }; }).filter((s) => s.d < 190).sort((a, b) => a.d - b.d).slice(0, 6);
      for (let c = near.shift(); c && near.length;) {   // from the nearest star on, always to the nearest one not yet joined
        near.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
        const next = near.shift(); want.add(Math.min(c.i, next.i) * 64 + Math.max(c.i, next.i)); c = next;
      }
    }
    for (const key of want) if (!lines.has(key)) lines.set(key, 0);
    g.lineWidth = 1;
    for (const [key, v0] of lines) {
      const v = v0 + ((want.has(key) ? 1 : 0) - v0) * Math.min(1, dt / 0.18);
      if (v < 0.01) { lines.delete(key); continue; }
      lines.set(key, v);
      const [ax, ay] = at(sky[Math.floor(key / 64)]); const [bx, by] = at(sky[key % 64]); const len = Math.hypot(bx - ax, by - ay) || 1; const gap = Math.min(5, len / 3) / len;
      g.beginPath(); g.moveTo(ax + (bx - ax) * gap, ay + (by - ay) * gap); g.lineTo(bx - (bx - ax) * gap, by - (by - ay) * gap);
      g.strokeStyle = `rgb(${INK} / ${0.6 * v})`; g.stroke();
    }
    for (const s of sky) { const [x, y] = at(s); g.beginPath(); g.arc(x, y, 0.7 + 1.1 * s.m, 0, 6.2832); g.fillStyle = `rgb(${INK} / ${(0.3 + 0.6 * s.m) * out[2]})`; g.fill(); }
  }

  raf = on >= 0 || ripples.length || lines.size || out.some((v) => v > 0.01) ? requestAnimationFrame(frame) : 0;
}
function kick() { if (!raf && tracing()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
addEventListener('pointermove', (e) => { ptr = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY }; kick(); }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { ptr = null; });
