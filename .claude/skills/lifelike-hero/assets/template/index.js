// {{Name}} hero — {{client}}. STARTER: say here, in three or four lines, what the photograph is (where the camera
// stands, what the light is doing), what moves when nobody touches it, and what a pointer and a click do.
// This file is the DOM, the input and the loop; render.js draws the picture, shaders.js holds the light and the film.
// Reduced motion: no loop; one settled frame, drawn again whenever the visitor does something.
// mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, rnd, clamp } from '../shared/kit.js';
import { createRenderer } from './render.js';
import { MARKS } from './shaders.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { reach: 160, pace: 1, text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'reach', label: 'Pointer reach', min: 60, max: 320, step: 10, value: 160, unit: 'px' },
  { id: 'pace', label: 'Pace', min: 0, max: 2, step: 0.1, value: 1, unit: '×' },
];
export const actions = [{ id: '{{action}}', label: '{{cue:js}}' }];
const STILL_T = 12.5;        // the moment of the scene's own motion that a still shows
const AGED = 1.5;            // s old a mark is drawn when nothing moves: its rings are already a little way out

const num = (v, d) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
// Options as the scene takes them: inside the ranges it was built for, whatever a page passes.
const tidy = (o) => ({
  reach: clamp(num(o.reach, DEFAULTS.reach), 60, 320), pace: clamp(num(o.pace, DEFAULTS.pace), 0, 2),
  text: o.text !== false,    // false: the scene alone, without the headline, the button or the plate line
  sound: o.sound === true,   // off until a page asks
});

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  const still = reducedMotion(); const fine = finePointer(); const low = quality() === 'low';
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('{{id}}'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="{{id}}__canvas" aria-hidden="true"></canvas>
    <h1 class="{{id}}__title">{{title:tpl}}</h1>
    <button type="button" class="{{id}}__cue">{{cue:tpl}}</button>
    <p class="{{id}}__note"><span>{{client:tpl}} · {{line:tpl}}</span><span>{{place:tpl}}</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1'); const cue = root.querySelector('button');
  const status = root.querySelector('[role="status"]');

  // The view: everything this file and the shaders agree on, in CSS px with y down.
  // time is the scene's own clock (it runs at the pace option), now is the visitor's (marks age by it).
  const view = { W: 0, H: 0, time: STILL_T, now: 0, still, ptr: { x: -1e4, y: -1e4, k: 0 }, marks: [], rects: [] };
  let R = null; let stop = null; let dead = false; let lost = false; let ratio = 1; let queued = 0; let made = 0;
  let ptr = null;   // where a fine pointer or a finger is, or null
  const snd = createSound(voices, { room: 1.6 }); snd.set(cfg.sound);

  const draw = () => { queued = 0; if (R && !lost && view.W) R.frame(view, cfg); };
  // Without a loop (reduced motion, or before it starts) a change asks for one frame; several in a row share it.
  const once = () => { if ((still || !stop) && !queued) queued = requestAnimationFrame(draw); };

  // Where the type lies: the scene keeps quiet under the headline's lines and the cue (a soft dip, not a box).
  const measure = () => {
    const h = root.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(title);
    const box = (r) => ({ l: r.left - h.left, t: r.top - h.top, r: r.right - h.left, b: r.bottom - h.top });
    view.rects = cfg.text ? [...range.getClientRects(), cue.getBoundingClientRect()].map(box) : [];
    R?.mask(view.rects);
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    view.W = w; view.H = h;
    R?.resize(w, h, ratio);
    measure(); once();
  };

  // The visitor's one verb: a click on the scene leaves a mark there, the button leaves one at a spot of its own.
  // At most MARKS are kept; the oldest goes first.
  const mark = (x, y) => {
    if (!R || lost || !view.W) return;   // nothing on screen to act on: still loading, or the static fallback
    view.marks.push({ x, y, t: still ? view.now - AGED : view.now }); if (view.marks.length > MARKS) view.marks.shift();
    made++; status.textContent = `${made} ${made === 1 ? 'mark' : 'marks'} left in the sand.`;
    snd.play('mark', x / view.W * 2 - 1);
    once();
  };
  // The button's spots: a new one each time, the same ones on every load.
  const markSeeded = () => mark((0.18 + 0.64 * rnd(made * 2 + 11)) * view.W, (0.22 + 0.42 * rnd(made * 2 + 12)) * view.H);

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames are
  // the ones a governor cannot save. On a 2x screen it may fall to 1x: soft, but it holds its frame rate.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (R && view.W) R.resize(view.W, view.H, ratio); } });

  const tick = (dt) => {
    gov.tick(dt);
    view.now += dt; view.time += dt * cfg.pace;
    // The pointer's dent follows it on an ease, and fills in again once it has gone.
    const p = view.ptr; const k = 1 - Math.exp(-dt / 0.12);
    if (ptr) { if (p.k < 0.02) { p.x = ptr.x; p.y = ptr.y; } else { p.x += (ptr.x - p.x) * k; p.y += (ptr.y - p.y) * k; } }
    p.k += ((ptr ? 1 : 0) - p.k) * (1 - Math.exp(-dt / 0.35));
    draw();
  };

  createRenderer(canvas, { low }).then((r) => {
    if (dead) { r.dispose(); return; }
    R = r;
    document.fonts?.ready.then(() => { if (!dead) { measure(); once(); } });   // the real face moves the headline's lines
    size(); draw();
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-ready');
    if (!still) stop = loop(root, tick);
  }).catch((err) => {
    if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
    console.info('{{Name:js}}: no WebGL2 scene, the headline stands on the still ground.', err?.message || err);
    root.classList.add('is-static');
  });
  // A lost context (GPU process restart, driver reset) leaves the still ground in charge until it comes back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.add('is-static'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; root.classList.remove('is-static'); if (R && view.W) { R.resize(view.W, view.H, ratio); measure(); } once(); }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  // Pointer: hover dents the surface (a mouse or a pen, and only while things move); a click leaves a mark.
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!still && fine) {
    root.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') ptr = at(e); }, { signal });
    for (const type of ['pointerleave', 'pointercancel']) root.addEventListener(type, () => { ptr = null; }, { signal });
  }
  // A phone has no hover: a finger drawn sideways across the scene does what a mouse over it does (upright, it is
  // the page's scroll). STARTER: give the finger whatever of the hover a hand on this subject would really do.
  if (!still) stroke(root, { move: (x, y, t, first) => { if (first) view.ptr.k = 0; ptr = { x, y }; }, end: () => { ptr = null; } }, signal);   // first: the dent starts under the finger, not where a mouse was
  // click, not pointerdown: a touch scroll that starts on the scene must not leave a mark.
  root.addEventListener('click', (e) => { if (!e.target.closest('button')) { const p = at(e); mark(p.x, p.y); } }, { signal });
  cue.addEventListener('click', markSeeded, { signal });

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound);
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); measure(); }
      once();
    },
    action(id) { if (id === '{{action}}') markSeeded(); },
    destroy() {
      dead = true; ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      R?.dispose(); R = null;
      root.classList.remove('{{id}}', 'is-ready', 'is-still', 'is-static', 'is-bare'); root.innerHTML = '';
    },
  };
}
