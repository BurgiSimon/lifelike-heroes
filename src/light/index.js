// Window light hero — the first screen of Linden Tea Rooms. It is one photograph: a 35 mm shift lens square to a
// limewashed wall, three metres back, at four o'clock on an October afternoon. The sun is low behind the
// photographer's right shoulder and comes in through the shop window, so the wall carries the window's picture: its
// glazing bars, the sheer curtain at its left, the lime tree outside, and the name that is sign-written on the
// glass, which is the headline. Every edge in that picture is as soft as the sun is wide, seen from the wall, at
// that thing's distance: the letters soft, the leaves softer.
// Left alone, the leaves flutter and the boughs sway on a breeze that comes and goes, the curtain breathes, and
// the crystals that hang in the window turn on their threads, so the spectra they throw glide across the shade.
// A pointer is a breeze: what it passes over stirs (touch the shadow and the thing moves), and so is a finger
// drawn across a phone's screen. A click (or the button) hangs another cut-glass crystal there; its spectra come
// from following sunlight through its facets.
// This file is the DOM, the input and the loop; room.js holds the rules, render.js and shaders.js the picture.
// Reduced motion: no loop; one settled frame, drawn again whenever the visitor does something.
// mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, clamp } from '../shared/kit.js';
import { createRoom, CRYSTALS } from './room.js';
import { createRenderer } from './render.js';
import { drawLetters } from './letters.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { breeze: 1, reach: 180, crystals: 6, leaves: 1, text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'breeze', label: 'Breeze', min: 0, max: 2.5, step: 0.1, value: 1, unit: '×' },
  { id: 'reach', label: 'Pointer reach', min: 60, max: 360, step: 10, value: 180, unit: 'px' },
  { id: 'crystals', label: 'Crystals kept', min: 1, max: CRYSTALS, step: 1, value: 6 },
  { id: 'leaves', label: 'Leaves on the tree', min: 0, max: 1, step: 0.05, value: 1 },
];
export const actions = [{ id: 'hang', label: 'Hang a crystal' }, { id: 'gust', label: 'Send a gust' }];
const STILL_T = 21;          // the moment of the room's own motion that a still shows, and that the live scene starts from

const num = (v, d) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
// Options as the scene takes them: inside the ranges it was built for, whatever a page passes.
const tidy = (o) => ({
  breeze: clamp(num(o.breeze, DEFAULTS.breeze), 0, 2.5), reach: clamp(num(o.reach, DEFAULTS.reach), 60, 360),
  crystals: Math.round(clamp(num(o.crystals, DEFAULTS.crystals), 1, CRYSTALS)), leaves: clamp(num(o.leaves, DEFAULTS.leaves), 0, 1),
  text: o.text !== false,    // false: the wall alone, no lettering on the glass, no button or plate line
  sound: o.sound === true,   // off until a page asks
});

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  const still = reducedMotion(); const fine = finePointer(); const low = quality() === 'low';
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('light'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="light__canvas" aria-hidden="true"></canvas>
    <h1 class="light__title">Four o’clock</h1>
    <button type="button" class="light__cue">Hang a crystal</button>
    <p class="light__note"><span>Linden Tea Rooms · home hero</span><span>Ghent · 2026</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1'); const cue = root.querySelector('button');
  const status = root.querySelector('[role="status"]');

  // The view: what this file and the shaders agree on, in CSS px with y down.
  const view = { W: 0, H: 0, still, stirred: false };
  const room = createRoom(cfg); const st = room.st;
  let R = null; let stop = null; let dead = false; let lost = false; let ratio = 1; let queued = 0;
  let ptr = null; let was = null;   // where a fine pointer or a finger is, and where it was a frame ago
  let gusts = 0;
  const wind = { x: 0, y: 0, vx: 0, vy: 0 };   // the pointer as the room takes it: where, and how fast (px/s, eased)
  const snd = createSound(voices, { room: 1.4 }); snd.set(cfg.sound);
  const pan = (x) => x / Math.max(1, view.W) * 2 - 1;
  const heard = () => { for (const e of st.events) snd.play(e.kind, pan(e.x), e.kind === 'hang' ? room.made() : e.hard); st.events.length = 0; };

  const draw = () => { queued = 0; if (R && !lost && view.W) R.frame(view, cfg, room); };
  // Without a loop (reduced motion, or before it starts) a change asks for one frame; several in a row share it.
  const once = () => { if ((still || !stop) && !queued) queued = requestAnimationFrame(draw); };

  // The picture is laid out round the headline: the glass is placed so that the shadow of its lettering falls
  // exactly where the page put the <h1>, and the renderer is given those letters, drawn from the DOM's own layout.
  const lay = () => {
    if (!view.W) return;
    const h = root.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(title);
    const rects = [...range.getClientRects()]; if (!rects.length) rects.push(title.getBoundingClientRect());
    const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity, em: parseFloat(getComputedStyle(title).fontSize) || 64 };
    for (const r of rects) { box.l = Math.min(box.l, r.left - h.left); box.t = Math.min(box.t, r.top - h.top); box.r = Math.max(box.r, r.right - h.left); box.b = Math.max(box.b, r.bottom - h.top); }
    if (room.fit(view.W, view.H, box)) room.pose(STILL_T);
    if (!R) return;
    R.layout(room.g, st.cloth);
    R.text((cv) => drawLetters(cv, root, title, !cfg.text, room.g.pen * 0.15), cfg.text);
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    view.W = w; view.H = h;
    R?.resize(w, h, ratio);
    lay(); once();
  };

  // The visitor's one verb: a crystal is hung in the window, so that its shadow falls where they clicked.
  const hang = (x, y) => {
    if (!R || lost || !view.W) return;   // nothing on screen to act on: still loading, or the static fallback
    const full = room.count() >= cfg.crystals;
    room.hang(x, y, still);   // no loop: it hangs as if it had hung there all afternoon, turned to where it comes to rest
    status.textContent = `Crystal ${room.made()} hangs in the window${full ? ', and the oldest is taken down' : ''}; its colours cross the wall.`;
    if (still) heard();
    once();
  };
  const hangSeeded = () => { if (R && !lost && view.W) hang(...room.seeded()); };
  // A gust is announced with its number: text the same as before is not read out again. Without motion there is
  // no gust to see, and the button says so rather than claim one.
  const gust = () => {
    if (!R || lost || !view.W) return;
    if (still) { status.textContent = 'The room stays still while motion is reduced.'; return; }
    room.gust(); status.textContent = `Gust ${++gusts} goes through the lime tree and lifts the curtain.`; once();
  };

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames are
  // the ones a governor cannot save. On a 2x screen it may fall to 1x: soft, but it holds its frame rate.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (R && view.W) R.resize(view.W, view.H, ratio); } });

  const tick = (dt) => {
    gov.tick(dt);
    // The pointer as a breeze: where it is, and how fast it is going (eased, so one jump of the mouse is not a gale).
    let air = null;
    if (ptr) {
      const k = 1 - Math.exp(-dt / 0.08);
      const vx = was && dt > 0 ? (ptr.x - was.x) / dt : 0; const vy = was && dt > 0 ? (ptr.y - was.y) / dt : 0;
      wind.vx += (vx - wind.vx) * k; wind.vy += (vy - wind.vy) * k; wind.x = ptr.x; wind.y = ptr.y; air = wind;
      const speed = Math.hypot(wind.vx, wind.vy);
      if (speed > 260 && ptr.x > room.g.open.l && ptr.x < room.g.open.r) snd.play('rustle', pan(ptr.x), speed);
    } else { wind.vx = wind.vy = 0; }
    was = ptr && { x: ptr.x, y: ptr.y };
    view.stirred = room.step(dt, air);
    heard();
    draw();
  };

  createRenderer(canvas, { low }).then((r) => {
    if (dead) { r.dispose(); return; }
    R = r;
    document.fonts?.ready.then(() => { if (!dead) { lay(); once(); } });   // the real face moves the headline's lines
    size(); draw();
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-ready');
    if (!still) stop = loop(root, tick);
  }).catch((err) => {
    if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
    console.info('Window light: no WebGL2 scene, the headline stands on the still ground.', err?.message || err);
    root.classList.add('is-static');
  });
  // A lost context (GPU process restart, driver reset) leaves the still ground in charge until it comes back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.add('is-static'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; root.classList.remove('is-static');
    if (R && view.W) { R.resize(view.W, view.H, ratio); lay(); }   // every target is drawn afresh each frame; the letters are painted again
    once();
  }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  // Pointer: hover is a breeze (a mouse or a pen, and only while things move), and so is a finger drawn sideways
  // across the wall (upright, it is the page's scroll); a click or a tap hangs a crystal.
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!still && fine) {
    root.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') ptr = at(e); }, { signal });
    for (const type of ['pointerleave', 'pointercancel']) root.addEventListener(type, () => { ptr = null; }, { signal });
  }
  if (!still) stroke(root, { move: (x, y, t, first) => { if (first) was = null; ptr = { x, y }; }, end: () => { ptr = null; } }, signal);   // first: the breeze starts from rest, not from where a mouse was
  // click, not pointerdown: a touch scroll that starts on the wall must not hang a crystal.
  root.addEventListener('click', (e) => { if (!e.target.closest('button')) { const p = at(e); hang(p.x, p.y); } }, { signal });
  cue.addEventListener('click', hangSeeded, { signal });

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound); room.setOptions(cfg, still);
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); lay(); }
      if (still) room.pose(STILL_T);   // no loop: the still is drawn again with the new breeze and the crystals that are left
      once();
    },
    action(id) { if (id === 'hang') hangSeeded(); else if (id === 'gust') gust(); },
    destroy() {
      dead = true; ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      R?.dispose(); R = null;
      root.classList.remove('light', 'is-ready', 'is-still', 'is-static', 'is-bare'); root.innerHTML = '';
    },
  };
}
