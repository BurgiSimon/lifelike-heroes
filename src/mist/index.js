// Misted window hero — the first screen of Lantern House, a small hotel, in the wet months. It is one photograph: a
// 50 mm lens wide open, half a metre from the window of a room, focused on the glass. So the rain on the pane is
// sharp and the city across the river (Shanghai, from a photographed panorama) is far out of focus, every lamp a
// soft disc. The room is warm and the glass is cold: the near side is misted, thickest low down, and somebody has
// breathed on it and written the headline with a fingertip.
// Left alone, rain keeps landing, drops grow heavy and run in fits and starts, and the mist creeps back.
// A pointer is a hand on the glass: it wipes the mist where it goes, and so does a finger drawn across a phone's
// screen. A click (or the button) lets one drop gather there and run down, clearing a track through the mist that
// closes again in about a minute.
// This file is the DOM, the input and the loop; pane.js holds the rules, render.js and shaders.js the picture.
// Reduced motion: no loop; one settled frame, drawn again whenever the visitor does something.
// mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, clamp } from '../shared/kit.js';
import { createPane } from './pane.js';
import { createRenderer } from './render.js';
import { drawLetters } from './letters.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { reach: 90, rain: 1, mist: 1, text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'reach', label: 'Wipe width', min: 30, max: 220, step: 10, value: 90, unit: 'px' },
  { id: 'rain', label: 'Rain', min: 0, max: 3, step: 0.1, value: 1, unit: '×' },
  { id: 'mist', label: 'Mist', min: 0, max: 1.4, step: 0.05, value: 1, unit: '×' },
];
export const actions = [{ id: 'drip', label: 'Let a drop run' }];
const WEEP = 520;            // px of mist a hand wipes (on a frame 900 px tall) before the water it pushed aside lets a drop go

const num = (v, d) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
// Options as the scene takes them: inside the ranges it was built for, whatever a page passes.
const tidy = (o) => ({
  reach: clamp(num(o.reach, DEFAULTS.reach), 30, 220), rain: clamp(num(o.rain, DEFAULTS.rain), 0, 3), mist: clamp(num(o.mist, DEFAULTS.mist), 0, 1.4),
  text: o.text !== false,    // false: the pane alone, nothing written on it, no button or plate line
  sound: o.sound === true,   // off until a page asks
});

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  const still = reducedMotion(); const fine = finePointer(); const low = quality() === 'low';
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('mist'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="mist__canvas" aria-hidden="true"></canvas>
    <h1 class="mist__title">Stay in tonight</h1>
    <button type="button" class="mist__cue">Let a drop run</button>
    <p class="mist__note"><span>Lantern House · home hero</span><span>Shanghai · 2026</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1'); const cue = root.querySelector('button');
  const status = root.querySelector('[role="status"]');

  // The view: what this file and the shaders agree on, in CSS px with y down.
  const view = { W: 0, H: 0, still };
  const pane = createPane(cfg); const st = pane.st;
  let R = null; let stop = null; let dead = false; let lost = false; let ratio = 1; let queued = 0; let made = 0;
  let ptr = null; let was = null; let wiped = 0;   // where a fine pointer or a finger is, where it was when the mist was last wiped, and how far it has wiped since a drop last ran from it
  const strokes = [];               // wiped since the last frame: { ax, ay, bx, by, r, v, k } as the mist pass takes them
  const snd = createSound(voices, { room: 0.9 }); snd.set(cfg.sound);
  const pan = (x) => x / Math.max(1, view.W) * 2 - 1;

  // dt: s of the mist's own time (0 for a redraw that only shows a change)
  const draw = (dt = 0) => {
    queued = 0;
    if (!R || lost || !view.W) return;
    for (const c of st.clears) strokes.push(c);
    st.clears.length = 0;
    R.frame(view, cfg, st, strokes, dt);
    strokes.length = 0;
  };
  // Without a loop (reduced motion, or before it starts) a change asks for one frame; several in a row share it.
  const once = () => { if ((still || !stop) && !queued) queued = requestAnimationFrame(() => draw(0)); };

  // The headline is written in the mist: the renderer is given its letters (drawn from the DOM's own layout), the
  // patch of breath round its lines, and the feet of its strokes, where the pushed-aside water lets drops go.
  const write = () => {
    if (!R || !view.W) return;
    const h = root.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(title);
    const box = (r) => ({ l: r.left - h.left, t: r.top - h.top, r: r.right - h.left, b: r.bottom - h.top });
    R.mask(cfg.text ? [...range.getClientRects()].map(box) : []);
    pane.setFeet(R.text((cv) => drawLetters(cv, root, title, !cfg.text), cfg.text));
  };
  // The tracks that are in the mist when the scene opens: drops let go earlier in the evening, each closed over by
  // a different amount. They run through the rules like any other, so they lie where a drop would.
  const age = () => {
    const old = [];
    const starts = [[0.71, 0.08, 0.3], [0.24, 0.16, 0.5], [0.88, 0.3, 0.05], [0.47, 0.05, 0.62]].map(([u, v, back]) => [u * view.W, v * view.H, back]);
    // and two from the feet of the letters, where a finger left the most water
    [[0.23, 0.4], [0.71, 0.15]].forEach(([k, back]) => { const f = st.feet[Math.floor(k * st.feet.length)]; if (f) starts.push([f.x, f.y, back, 0.7]); });
    // and somebody has wiped the glass with the side of a hand to look out, a while ago: one stroke, bowed as an
    // arm draws it, across the lights. Two drops have run from the water it left along its lower edge.
    const { W, H } = view; const S = H / 900; const wide = Math.min(W, 1.9 * H);
    const sweep = (t) => ({ x: W * 0.5 + wide * (0.0 + 0.37 * t), y: H * (0.41 - 0.2 * Math.sin(Math.PI * (0.1 + 0.62 * t))) });
    for (let i = 0; i < 14; i++) { const a = sweep(i / 14); const b = sweep((i + 1) / 14); old.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: 74 * S, v: 0.04, k: 1 }); }
    [0.3, 0.74].forEach((t, i) => { const a = sweep(t); starts.push([a.x, a.y + 66 * S, 0.08 + 0.2 * i, 0.72]); });
    starts.forEach(([x, y, back, size]) => {
      pane.settle(pane.drip(x, y, size));
      for (const c of st.clears) old.push({ ...c, v: back });
      st.clears.length = 0;
    });
    R?.history(old);
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    view.W = w; view.H = h;
    const fresh = pane.fit(w, h);   // a new box is a new pane
    R?.resize(w, h, ratio);
    if (fresh) aged = false;
    write();
    if (R && !aged) { age(); aged = true; }
    once();
  };
  let aged = false;

  // The visitor's one verb: a drop gathers where they clicked, on the misted side, and runs down the glass.
  const drip = (x, y) => {
    if (!R || lost || !view.W) return;   // nothing on screen to act on: still loading, or the static fallback
    const d = pane.drip(x, y);
    made++; status.textContent = `Drop ${made} runs down the glass and clears a track through the mist.`;
    snd.play('drip', pan(x));
    if (still) pane.settle(d);   // no loop: the whole run at once, its track left in the mist
    once();
  };
  const dripSeeded = () => drip(...pane.seeded());

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames are
  // the ones a governor cannot save. On a 2x screen it may fall to 1x: soft, but it holds its frame rate.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (R && view.W) R.resize(view.W, view.H, ratio); } });

  const tick = (dt) => {
    gov.tick(dt);
    pane.step(dt);
    // The hand on the glass: the mist is wiped from where the pointer was to where it is.
    if (ptr && was && (ptr.x !== was.x || ptr.y !== was.y)) {
      const far = Math.hypot(ptr.x - was.x, ptr.y - was.y);
      strokes.push({ ax: was.x, ay: was.y, bx: ptr.x, by: ptr.y, r: cfg.reach / 2, v: 0, k: 1 });
      snd.play('wipe', pan(ptr.x), far / Math.max(dt, 1e-3));
      // The mist it wipes off is water, and it has to go somewhere: it stands along the lower edge of the stroke,
      // and every so often enough of it has collected there to run.
      wiped += far * cfg.mist;
      if (wiped > WEEP * view.H / 900) { wiped = 0; pane.weep((was.x + ptr.x) / 2, Math.max(was.y, ptr.y) + cfg.reach * 0.42); }
    }
    was = ptr && { x: ptr.x, y: ptr.y };
    for (const e of st.events) {
      if (e.kind === 'tick') { if (e.r > 4.6) snd.play('tick', pan(e.x), e.r); } else snd.play(e.kind, pan(e.x));
    }
    st.events.length = 0;
    draw(dt);
  };

  createRenderer(canvas, { low }).then((r) => {
    if (dead) { r.dispose(); return; }
    R = r;
    document.fonts?.ready.then(() => { if (!dead) { write(); once(); } });   // the real face moves the headline's lines
    size(); draw(0);
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-ready');
    if (!still) stop = loop(root, tick);
  }).catch((err) => {
    if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
    console.info('Misted window: no WebGL2 scene, the headline stands on the still ground.', err?.message || err);
    root.classList.add('is-static');
  });
  // A lost context (GPU process restart, driver reset) leaves the still ground in charge until it comes back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.add('is-static'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; root.classList.remove('is-static');
    if (R && view.W) { R.restore(); R.resize(view.W, view.H, ratio); write(); }   // the city is decoded again, the mist laid again
    once();
  }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  // Pointer: hover wipes the mist (a mouse or a pen, and only while things move), and so does a finger drawn
  // sideways across the glass (upright, it is the page's scroll); a click or a tap lets a drop run.
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!still && fine) {
    root.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') ptr = at(e); }, { signal });
    for (const type of ['pointerleave', 'pointercancel']) root.addEventListener(type, () => { ptr = null; }, { signal });
  }
  if (!still) stroke(root, { move: (x, y) => { if (!ptr) was = { x, y }; ptr = { x, y }; }, end: () => { ptr = null; } }, signal);   // the wipe starts where the finger came down
  // click, not pointerdown: a touch scroll that starts on the glass must not start a drop.
  root.addEventListener('click', (e) => { if (!e.target.closest('button')) { const p = at(e); drip(p.x, p.y); } }, { signal });
  cue.addEventListener('click', dripSeeded, { signal });

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound); pane.setOptions(cfg);
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); write(); }
      once();
    },
    action(id) { if (id === 'drip') dripSeeded(); },
    destroy() {
      dead = true; ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      R?.dispose(); R = null;
      root.classList.remove('mist', 'is-ready', 'is-still', 'is-static', 'is-bare'); root.innerHTML = '';
    },
  };
}
