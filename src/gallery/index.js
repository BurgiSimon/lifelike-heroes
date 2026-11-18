// The gallery: a line of cards, one per scene, each with its scene's still. Where there is room the line is endless:
// it drifts by itself when the page is left alone, and the wheel, a drag or the arrow keys move it. The card under
// the pointer (or the one with the keyboard's focus) is lit and gets a trace in its scene's own manner: grass that
// parts, ripples, a pencilled line between stars, drops that run down the glass. A chosen card opens into its scene.
// On a phone the cards are a strip that a swipe moves from one to the next. Without this script the page is still
// five links.
import '../shared/base.css';
import './style.css';
import { soundPref } from '../shared/sound.js';
import { reducedMotion, finePointer, rnd } from '../shared/kit.js';

const list = document.querySelector('.list');
const rows = [...list.querySelectorAll('a')];            // one card per scene, as the page has them
const ids = rows.map((a) => a.dataset.id);               // meadow, koi, stars, rain, mist: the traces at the foot go by this order
const cards = [...rows];                                 // every card in the line; the endless line adds copies
const phone = matchMedia('(max-width: 640px)');          // the phone layout: a strip that scrolls and snaps by itself
const calm = reducedMotion();
const mod = (a, m) => ((a % m) + m) % m;
const inside = (r, p) => p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

// the line: x is where it stands and want where it is going (in cards: 1 is the second card in the middle), v what
// a drag has left it (px a second). spin: see lay().
const DRIFT = 28;                                        // px a second, when the page is left alone
let step = 0; let mid = 0; let base = []; let x = 1; let want = 1; let v = 0; let spin = 0;
let drifting = false; let down = null; let dragged = false;
let lit = null; let was = -1; let ptr = null; let keys = false;
// the traces (drawn at the foot of this file)
const cv = document.querySelector('.trace'); const g = cv.getContext('2d');
const INK = '244 242 236';
let raf = 0; let last = 0; let clock = 0; let inked = false;
const spot = ids.map(() => null);                        // the card each scene's trace is on
const out = ids.map(() => 0);                            // how far each trace has come out, 0 to 1
let blades = []; const ripples = []; let rippled = null; let dripped = 0;
const sky = Array.from({ length: 34 }, (_, i) => ({ u: rnd(i * 3 + 1), v: rnd(i * 3 + 2), m: rnd(i * 3 + 3) }));
const lines = new Map();                                 // star a * 64 + star b → how far the line is drawn
const drops = []; let wetted = null; let fell = 0;       // the drops running down the rain's card: { u, v, w (speed), r, top }
const runs = []; let ranAt = null; let ran = 0;          // drops on the misted window's card: where each started (u, v0), how far down it is (v), when it let go

// ---- the lit card: the one under the pointer or the one with the keyboard's focus, whichever spoke last. On a
// phone it is the card in the middle.
function set(el) {
  if (el === lit) return;
  lit = el; if (el) was = ids.indexOf(el.dataset.id);
  for (const a of cards) a.classList.toggle('is-on', a === el);
  list.classList.toggle('has-on', !!el);
  kick();
}
const under = () => (ptr && document.elementFromPoint(ptr.x, ptr.y)?.closest('.list a')) || null;
const keyed = () => (rows.includes(document.activeElement) && document.activeElement.matches(':focus-visible') ? document.activeElement : null);
const light = () => { if (!phone.matches) set(keys ? keyed() || under() : under() || keyed()); };
const middle = new IntersectionObserver((seen) => { if (phone.matches) for (const e of seen) if (e.isIntersecting) set(e.target); }, { root: list, threshold: 0.6 });
rows.forEach((a) => middle.observe(a));

// ---- the endless line. The cards keep their place in the page and are moved from it; copies of them are added
// until a card can go round from one end of the line to the other behind the screen's edges.
function fit() {
  const loop = !phone.matches;
  list.classList.toggle('is-loop', loop);
  if (!loop) { for (const a of cards) a.style.transform = ''; return; }
  const w = rows[0].offsetWidth; step = w + parseFloat(getComputedStyle(list).columnGap); mid = (list.clientWidth - w) / 2;
  while (cards.length < 2 * rows.length || cards.length * step < list.clientWidth + w + step) {
    for (const a of rows) {
      const c = a.cloneNode(true); c.classList.remove('is-on'); c.classList.add('is-copy'); c.tabIndex = -1; c.setAttribute('aria-hidden', 'true');
      c.addEventListener('click', (e) => open(e, c)); list.append(c); cards.push(c);
    }
  }
  base = cards.map((a) => a.offsetLeft);
  lay();
}
// Card i stands in the slots i + spin, modulo the number of cards: in the one of them nearest the middle. spin
// moves every card on by whole sets, which nobody can see; it is how the card that takes the keyboard's focus can
// always be one of the page's own and never a copy.
function lay() {
  const n = cards.length;
  cards.forEach((a, i) => { a.style.transform = `translateX(${(mid + (mod(i + spin - x + n / 2, n) - n / 2) * step - base[i]).toFixed(1)}px)`; });
}

function frame(now) {
  if (phone.matches) { raf = 0; return; }
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; clock += dt;
  if (!down) {
    if (drifting && !lit) want += DRIFT * dt / step;                                   // a lit card holds the line still
    if (Math.abs(v) > 4) { want += v * dt / step; v *= Math.exp(-dt * 3.2); } else v = 0;
    x = calm || Math.abs(want - x) < 0.0005 ? want : x + (want - x) * (1 - Math.exp(-dt * 9));
  }
  lay(); light();
  raf = draw(dt) || down || drifting || v || x !== want ? requestAnimationFrame(frame) : 0;
}
function kick() { if (!raf && !phone.matches) { last = performance.now(); raf = requestAnimationFrame(frame); } }

// The wheel moves the line: sideways always, up and down too unless the page itself has somewhere to scroll.
list.addEventListener('wheel', (e) => {
  if (phone.matches || e.ctrlKey) return;
  const flat = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  if (!flat && document.documentElement.scrollHeight > innerHeight + 1) return;
  e.preventDefault(); want += (flat ? e.deltaX : e.deltaY) * (e.deltaMode ? 32 : 1) / step; v = 0; kick();
}, { passive: false });

// A drag moves it and lets it run on. (No pointer capture: the click that follows has to reach the card, where a
// click that ends a drag is dropped.)
list.addEventListener('pointerdown', (e) => { if (phone.matches || e.button) return; down = { id: e.pointerId, x: e.clientX, t: e.timeStamp }; dragged = false; v = 0; want = x; });
list.addEventListener('dragstart', (e) => e.preventDefault());
const drop = (e) => { if (down?.id !== e.pointerId) return; if (e.timeStamp - down.t > 90) v = 0; down = null; list.classList.remove('is-dragging'); kick(); };
addEventListener('pointermove', (e) => {
  ptr = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY }; keys = false;
  if (down?.id === e.pointerId) {
    const dx = e.clientX - down.x;
    if (e.pointerType === 'mouse' && !e.buttons) drop(e);                              // let go outside the window
    else if (dragged || Math.abs(dx) > 6) {
      dragged = true; list.classList.add('is-dragging');
      x = want = x - dx / step; v = 0.6 * v - 0.4 * dx / Math.max(0.004, (e.timeStamp - down.t) / 1000); down.x = e.clientX; down.t = e.timeStamp;
    }
  }
  light(); kick();
}, { passive: true });
addEventListener('pointerup', drop); addEventListener('pointercancel', drop);
document.documentElement.addEventListener('pointerleave', () => { ptr = null; light(); });

// The arrow keys go from card to card (Enter is the link's own), and a card that takes the keyboard's focus comes
// to the middle.
addEventListener('keydown', (e) => {
  const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  let k = rows.indexOf(document.activeElement);
  if (phone.matches) k = k < 0 ? (d > 0 ? 0 : rows.length - 1) : mod(k + d, rows.length);
  else { const slot = Math.round(want) + d; k = mod(slot, rows.length); spin = slot - k; want = slot; v = 0; }
  rows[k].focus({ preventScroll: !phone.matches });
});
rows.forEach((a, i) => {
  a.addEventListener('focus', () => {
    if (!phone.matches && a.matches(':focus-visible')) { const n = cards.length; want = i + spin + n * Math.round((want - i - spin) / n); v = 0; keys = true; }
    light(); kick();
  });
  a.addEventListener('blur', light);
  a.addEventListener('click', (e) => open(e, a));
});

// ---- left alone for a few seconds, the line drifts (on a phone: the strip goes on by a card); any input hands it back
let idle = 0; let turning = 0;
const turn = () => rows[(was + 1) % rows.length].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
const wake = () => {
  clearTimeout(idle); clearInterval(turning); drifting = false;
  if (!calm) idle = setTimeout(() => {
    if (!phone.matches) { drifting = true; kick(); } else if (!list.contains(document.activeElement)) { turn(); turning = setInterval(turn, 5200); }
  }, 4000);
};
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(type, wake, { passive: true });

// ---- a chosen card opens into its scene: a copy of it grows from where the card is until it is the screen, and
// the scene's page begins on that same picture. A click meant for a new tab stays a plain link.
function open(e, a) {
  if (dragged && e.detail) { e.preventDefault(); return; }   // the click that ends a drag (a key's click has no detail)
  if (calm || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  clearTimeout(idle); clearInterval(turning); drifting = false; v = 0; want = x;
  const r = a.getBoundingClientRect(); const page = document.documentElement;
  const o = document.createElement('div'); o.className = 'opener'; o.dataset.id = a.dataset.id;
  Object.assign(o.style, { inset: `${r.top}px ${page.clientWidth - r.right}px ${page.clientHeight - r.bottom}px ${r.left}px`, borderRadius: getComputedStyle(a).borderRadius });
  document.body.append(o); o.getBoundingClientRect();   // laid out where it starts
  Object.assign(o.style, { inset: '0px', borderRadius: '0px' });
  document.body.classList.add('is-opening');
  setTimeout(() => { location.href = a.href; }, 640);
}

// ---- the sound switch: one for all the scenes, each opens with its sound as this was left
const sound = document.querySelector('.sound');
sound.addEventListener('click', () => { soundPref.set(!soundPref.get()); sound.textContent = `Sound: ${soundPref.get() ? 'on' : 'off'}`; });
// Shown, or shown again on the way back from a scene: the switch as it stands, the page closed up again, and a card
// that was only clicked let go of.
addEventListener('pageshow', () => {
  sound.textContent = `Sound: ${soundPref.get() ? 'on' : 'off'}`;
  document.querySelector('.opener')?.remove(); document.body.classList.remove('is-opening');
  const f = document.activeElement; if (cards.includes(f) && !f.matches(':focus-visible')) f.blur();
  wake(); kick();
});
addEventListener('resize', fit);
fit();

// ---- traces: what the pointer leaves on the lit card, drawn on one canvas over the line (in the colour of the
// type, so they read as lying under it). For a mouse or a pen; a card lit from the keyboard gets a quiet version
// of its own. Says whether there is anything left to draw.
function draw(dt) {
  const dpr = Math.min(devicePixelRatio || 1, 2); const W = cv.clientWidth; const H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineCap = 'round'; g.lineWidth = 1;
  if (inked) g.clearRect(0, 0, W, H);   // only a canvas that was drawn on: a line that just drifts repaints nothing here
  inked = false;
  if (calm || !finePointer()) return false;
  const k = lit ? ids.indexOf(lit.dataset.id) : -1;
  if (k >= 0 && spot[k] !== lit) { spot[k] = lit; out[k] = 0; if (k === 1) ripples.length = 0; if (k === 2) lines.clear(); if (k === 3) drops.length = 0; if (k === 4) runs.length = 0; }   // on another card of its scene it starts over
  out.forEach((o, i) => { out[i] = o + ((k === i ? 1 : 0) - o) * (1 - Math.exp(-dt * 5)); });
  const box = spot.map((a) => a?.getBoundingClientRect());
  const within = (r) => { g.save(); g.beginPath(); g.roundRect(r.left, r.top, r.width, r.height, 14); g.clip(); };

  // Meadow: grass along the card's foot. It comes up when the card is lit, leans in the wind and parts for the pointer.
  if (out[0] > 0.01) {
    const r = box[0]; const n = Math.floor(r.width / 6);
    if (blades.length !== n) blades = Array.from({ length: n }, (_, i) => ({ x: i * 6 + rnd(i) * 5, h: 12 + 30 * rnd(i + 500) ** 1.6, a: 0, v: 0, ph: rnd(i + 900) * 6.28 }));
    within(r); g.beginPath();
    for (const b of blades) {
      const bx = r.left + b.x; const y = r.bottom; let lean = 0.13 * Math.sin(clock * 1.4 + b.ph + b.x * 0.011);
      if (ptr) { const dx = bx - ptr.x; const d = Math.hypot(dx, (y - ptr.y) * 0.55); if (d < 120) lean += Math.sign(dx || 1) * (1 - d / 120) ** 2 * 1.15; }
      b.v = (b.v + (lean - b.a) * 90 * dt) * 0.86 ** (dt * 60); b.a += b.v * dt * 6;
      const h = b.h * out[0];
      g.moveTo(bx, y); g.quadraticCurveTo(bx + Math.sin(b.a) * h * 0.2, y - h * 0.55, bx + Math.sin(b.a) * h, y - Math.cos(b.a) * h);
    }
    g.strokeStyle = `rgb(${INK} / ${0.5 * out[0]})`; g.stroke(); g.restore();
  }

  // Koi pond: rings where the pointer has been on the card; lit with no pointer on it, it drips by itself now and then.
  const pond = box[1];
  if (pond && k === 1) {
    if (inside(pond, ptr)) {
      const at = { u: ptr.x - pond.left, v: ptr.y - pond.top };
      if (!rippled || Math.hypot(at.u - rippled.u, at.v - rippled.v) > 30) { rippled = at; ripples.push({ ...at, t: clock }); }
    } else if (clock - dripped > 0.9) { dripped = clock; ripples.push({ u: pond.width * Math.random(), v: pond.height * (0.2 + 0.6 * Math.random()), t: clock }); }
  }
  if (ripples.length) {
    within(pond);
    for (let i = ripples.length; i--;) {
      const p = ripples[i]; const age = (clock - p.t) / 1.6;
      if (age >= 1) { ripples.splice(i, 1); continue; }
      for (const lag of [0, 0.22]) {
        if (age < lag) continue;
        g.beginPath(); g.arc(pond.left + p.u, pond.top + p.v, 4 + (age - lag) * 86, 0, 6.2832); g.strokeStyle = `rgb(${INK} / ${0.42 * (1 - age) ** 1.5})`; g.stroke();
      }
    }
    g.restore();
  }

  // Star chart: the card's own small sky, and a pencilled line through the stars nearest the pointer (lit with no
  // pointer on it, it is pencilled by a point that wanders over it).
  if (out[2] > 0.01 || lines.size) {
    const r = box[2]; const at = (s) => [r.left + 12 + s.u * (r.width - 24), r.top + 12 + s.v * (r.height - 24)];
    const pen = k !== 2 ? null : inside(r, ptr) ? ptr : { x: r.left + r.width * (0.5 + 0.3 * Math.sin(clock * 0.45)), y: r.top + r.height * (0.5 + 0.3 * Math.sin(clock * 0.7)) };
    const need = new Set();
    if (pen) {
      const near = sky.map((s, i) => { const [sx, sy] = at(s); return { i, x: sx, y: sy, d: Math.hypot(sx - pen.x, sy - pen.y) }; }).filter((s) => s.d < 190).sort((a, b) => a.d - b.d).slice(0, 6);
      for (let c = near.shift(); c && near.length;) {   // from the nearest star on, always to the nearest one not yet joined
        near.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
        const next = near.shift(); need.add(Math.min(c.i, next.i) * 64 + Math.max(c.i, next.i)); c = next;
      }
    }
    for (const key of need) if (!lines.has(key)) lines.set(key, 0);
    within(r);
    for (const [key, v0] of lines) {
      const drawn = v0 + ((need.has(key) ? 1 : 0) - v0) * Math.min(1, dt / 0.18);
      if (drawn < 0.01) { lines.delete(key); continue; }
      lines.set(key, drawn);
      const [ax, ay] = at(sky[Math.floor(key / 64)]); const [bx, by] = at(sky[key % 64]); const len = Math.hypot(bx - ax, by - ay) || 1; const gap = Math.min(5, len / 3) / len;
      g.beginPath(); g.moveTo(ax + (bx - ax) * gap, ay + (by - ay) * gap); g.lineTo(bx - (bx - ax) * gap, by - (by - ay) * gap);
      g.strokeStyle = `rgb(${INK} / ${0.6 * drawn})`; g.stroke();
    }
    for (const s of sky) { const [sx, sy] = at(s); g.beginPath(); g.arc(sx, sy, 0.7 + 1.1 * s.m, 0, 6.2832); g.fillStyle = `rgb(${INK} / ${(0.3 + 0.6 * s.m) * out[2]})`; g.fill(); }
    g.restore();
  }

  // Night rain: a drop starts where the pointer has been on the card and runs down it in fits and starts, its trail
  // fading behind it; lit with no pointer on it, one starts by itself now and then.
  const pane = box[3];
  if (pane && k === 3) {
    if (inside(pane, ptr)) {
      const at = { u: ptr.x - pane.left, v: ptr.y - pane.top };
      if (!wetted || Math.hypot(at.u - wetted.u, at.v - wetted.v) > 46) { wetted = at; drops.push({ ...at, top: at.v, w: 0, r: 2 + 1.6 * Math.random(), n: drops.length * 7 + Math.floor(clock * 10) }); }
    } else if (clock - fell > 0.7) { fell = clock; const v = pane.height * 0.5 * Math.random(); drops.push({ u: pane.width * (0.08 + 0.84 * Math.random()), v, top: v, w: 0, r: 2 + 1.6 * Math.random(), n: Math.floor(clock * 10) }); }
  }
  if (drops.length) {
    within(pane);
    for (let i = drops.length; i--;) {
      const p = drops[i]; const stall = rnd(p.n + Math.floor(clock * 2.5)) < 0.3;   // it catches on the glass, then lets go
      p.w += ((stall ? 0 : 60 + 46 * p.r) - p.w) * Math.min(1, dt * 5); p.v += p.w * dt; p.u += (rnd(p.n + Math.floor(clock * 4) * 3) - 0.5) * p.w * dt * 0.5;
      const gone = Math.min(1, Math.max(0, (p.v - pane.height) / 60)); if (gone >= 1 || p.v - p.top > 520) { drops.splice(i, 1); continue; }
      const far = Math.min(1, (p.v - p.top) / 30); const fade = 1 - Math.min(1, Math.max(0, (p.v - p.top - 380) / 140));
      const from = pane.top + Math.max(p.top, p.v - 150); const to = pane.top + p.v - p.r;
      const trail = g.createLinearGradient(0, from, 0, to); trail.addColorStop(0, `rgb(${INK} / 0)`); trail.addColorStop(1, `rgb(${INK} / ${0.4 * far * fade})`);
      g.beginPath(); g.moveTo(pane.left + p.u, from); g.lineTo(pane.left + p.u, to); g.strokeStyle = trail; g.stroke();
      g.beginPath(); g.arc(pane.left + p.u, pane.top + p.v, p.r, 0, 6.2832); g.strokeStyle = `rgb(${INK} / ${0.75 * fade})`; g.stroke();
    }
    g.restore();
  }

  // Misted window: a drop lets go wherever the pointer has been on the card and runs down it in fits and starts, a
  // thin wet line behind it; lit with no pointer on it, one lets go by itself now and then.
  const glass = box[4];
  if (glass && k === 4) {
    if (inside(glass, ptr)) {
      const at = { u: ptr.x - glass.left, v: ptr.y - glass.top };
      if (!ranAt || Math.hypot(at.u - ranAt.u, at.v - ranAt.v) > 44) { ranAt = at; runs.push({ u: at.u, v0: at.v, v: at.v, t: clock, s: Math.random() }); }
    } else if (clock - ran > 0.8) { ran = clock; const v = glass.height * 0.55 * Math.random(); runs.push({ u: glass.width * Math.random(), v0: v, v, t: clock, s: Math.random() }); }
  }
  if (runs.length) {
    within(glass);
    for (let i = runs.length; i--;) {
      const d = runs[i]; const age = clock - d.t; const fade = 1 - age / 2.8;
      if (fade <= 0) { runs.splice(i, 1); continue; }
      d.v += 170 * (0.25 + 0.75 * Math.max(0, Math.sin(age * 5.1 + d.s * 6.28)) ** 2) * Math.min(1, age * 3) * dt;   // it sticks, and slips
      const x = (v) => glass.left + d.u + 2.5 * Math.sin(v * 0.04 + d.s * 9);
      g.beginPath(); g.moveTo(x(d.v0), glass.top + d.v0);
      for (let v = d.v0 + 6; v < d.v; v += 6) g.lineTo(x(v), glass.top + v);
      g.lineTo(x(d.v), glass.top + d.v); g.strokeStyle = `rgb(${INK} / ${0.3 * fade})`; g.stroke();
      g.beginPath(); g.ellipse(x(d.v), glass.top + d.v, 2.4, 3, 0, 0, 6.2832); g.fillStyle = `rgb(${INK} / ${0.75 * fade})`; g.fill();
    }
    g.restore();
  }

  inked = k >= 0 || ripples.length > 0 || lines.size > 0 || drops.length > 0 || runs.length > 0 || out.some((o) => o > 0.01);
  return inked;
}
