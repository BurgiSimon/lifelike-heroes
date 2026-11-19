// Movement hero — Thorne & Daughter, watchmakers. The photograph: the back of a hand-wound movement on the bench,
// a macro lens straight down on it at f/5.6, focused on the words engraved in the bridge, so the wheels beneath go
// soft; one photographed studio, mirrored in every surface. It runs: the balance swings, the escapement lets one
// tooth past six times a second, and the train keeps the visitor's own time. A pointer tilts the movement in the
// hand, so the light slides over the stripes, and the lens focuses on what the pointer is over. A click (or the
// button) winds it: the ratchet turns under its click and the balance swings wider, until it has run down again.
// This file is the DOM, the input and the loop; caliber.js is the movement's rules, render.js draws it.
// Reduced motion: no loop; one settled frame at ten past ten, drawn again whenever the visitor does something.
// mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, clamp } from '../shared/kit.js';
import { createCaliber, Z, BEAT } from './caliber.js';
import { createRenderer } from './render.js';
import { engrave } from './engrave.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { tilt: 6, stop: 5.6, text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'tilt', label: 'Tilt in the hand', min: 0, max: 10, step: 0.5, value: 6, unit: '°' },
  { id: 'stop', label: 'Aperture (f-number)', min: 2.8, max: 22, step: 0.2, value: 5.6 },
];
export const actions = [{ id: 'wind', label: 'Wind it' }];
const STILL_T = 10 * 3600 + 10 * 60 + 36.73;   // the clock time a still shows: ten past ten, the balance well into a swing
const HOLD = { x: 0.018, y: -0.026 };          // rad the movement lies tilted when nobody touches it: nothing is held dead level
const SHUTTER = 1 / 250;                       // s a still's shutter is open: the balance's arm is caught a little smeared, not frozen and not gone

const num = (v, d) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
// Options as the scene takes them: inside the ranges it was built for, whatever a page passes.
const tidy = (o) => ({
  tilt: clamp(num(o.tilt, DEFAULTS.tilt), 0, 10), stop: clamp(num(o.stop, DEFAULTS.stop), 2.8, 22),
  text: o.text !== false,    // false: the movement alone, with nothing engraved on its bridge
  sound: o.sound === true,   // off until a page asks
});
// The visitor's own time of day in seconds, kept from a clock that only runs forward.
const clock = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000 - performance.now() / 1000; };

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  const still = reducedMotion(); const fine = finePointer(); const low = quality() === 'low';
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('movement'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="movement__canvas" aria-hidden="true"></canvas>
    <h1 class="movement__title">Wound by Hand</h1>
    <button type="button" class="movement__cue">Wind it</button>
    <p class="movement__note"><span>Thorne &amp; Daughter · home hero</span><span>Clerkenwell · 2026</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1'); const cue = root.querySelector('button');
  const status = root.querySelector('[role="status"]');

  const cal = createCaliber(); const g = cal.g; const st = cal.st;
  // The view: what this file hands the renderer each frame. tilt is the hand's (rad, about the picture's x and y),
  // focus the height on the bench the lens is sharp at (mm from the bridge's face).
  const view = { W: 0, H: 0, still, tilt: { ...HOLD }, focus: 0, stop: cfg.stop, st, time: 0 };
  let R = null; let stop = null; let dead = false; let lost = false; let ratio = 1; let queued = 0;
  let ptr = null;   // where a fine pointer or a finger is (CSS px), or null
  let turns = 0;    // turns of the crown the visitor has given it
  const lean = { x: HOLD.x, y: HOLD.y, vx: 0, vy: 0 }; const epoch = clock();
  const snd = createSound(voices, { room: 0.9 }); snd.set(cfg.sound);

  const draw = () => { queued = 0; if (R && !lost && view.W) R.frame(view); };
  // Without a loop (reduced motion, or before it starts) a change asks for one frame; several in a row share it.
  const once = () => { if ((still || !stop) && !queued) queued = requestAnimationFrame(draw); };

  // The height on the bench of the movement's point (x, y, z) under the tilt as it is now.
  const benchZ = (x, y, z) => -Math.sin(view.tilt.y) * x + Math.sin(view.tilt.x) * Math.cos(view.tilt.y) * y + Math.cos(view.tilt.x) * Math.cos(view.tilt.y) * (z - Z.bridge);
  // Where the lens should be sharp: on what the pointer is over, or on the headline.
  const aim = () => {
    if (ptr) { const x = (ptr.x - view.W / 2) / g.ppm; const y = (view.H / 2 - ptr.y) / g.ppm; return benchZ(x, y, cal.heightAt(x, y)); }
    const b = g.title; return b ? benchZ((b.l + b.r) / 2, (b.t + b.b) / 2, Z.bridge) : 0;
  };

  // Where the headline's letters lie, in CSS px of the hero box: the works are laid out to keep clear of them, and
  // stay where they are when the text is switched off (the bridge is then left plain).
  const measure = () => {
    const words = engrave(root, title);
    cal.lay(view.W, view.H, words ? words.ink : null);
    if (R) { R.layout(g); R.words(cfg.text ? words : null, g); }
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    view.W = w; view.H = h;
    R?.resize(w, h, ratio);
    measure(); settle(); once();
  };
  // Everything where a still shows it: the clock at ten past ten, the wheels wherever winding left them, the lens
  // on the headline.
  const settle = () => { if (!still) return; cal.settle(); cal.step(0, STILL_T, SHUTTER); view.focus = aim(); };

  const pan = () => clamp(g.ratchet.at[0] / g.hw, -1, 1);   // the winding wheels are heard where they are seen
  // The visitor's one verb: a turn of the crown.
  const wind = () => {
    if (!R || lost || !view.W) return;   // nothing on screen to act on: still loading, or the static fallback
    const did = cal.wind(); snd.play(did === 'full' ? 'stop' : 'crown', pan()); turns++;
    const full = Math.round(st.wind * 100);
    status.textContent = did === 'full' ? `Turn ${turns}: the spring is fully wound, and the crown will not go further.` : did === 'topped' ? `Turn ${turns}: wound to the top. The balance swings its widest.` : `Turn ${turns} of the crown: the ratchet clicks round, the spring is ${full}% wound and the balance swings wider.`;
    if (still && did !== 'full') snd.play('click', 4, pan());   // nothing moves to be heard: the still shows the turn done, and says so
    settle(); once();
  };

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames are
  // the ones a governor cannot save. On a 2x screen it may fall to 1x: soft, but it holds its frame rate.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (R && view.W) R.resize(view.W, view.H, ratio); } });

  const tick = (dt) => {
    gov.tick(dt);
    view.time += dt;
    cal.step(dt, epoch + performance.now() / 1000);
    // The frame hears of a beat after it fell, so it is the next one that is asked for, to the thousandth of a second.
    for (const e of st.events) {
      if (e.kind === 'tick') snd.play('tick', 1 - e.odd, 1 / BEAT - e.late, (st.swing - 2.6) / 2.6);
      else snd.play('click', e.n, pan());
    }
    // The hand: it leans the movement toward the pointer on a spring, and is never quite still.
    const reach = cfg.tilt * Math.PI / 180; const t = view.time;
    const wx = HOLD.x + 0.011 * Math.sin(t * 0.43) + 0.006 * Math.sin(t * 0.71 + 1.9) + (ptr ? reach * (ptr.y / view.H * 2 - 1) : 0);
    const wy = HOLD.y + 0.013 * Math.sin(t * 0.37 + 0.6) + 0.007 * Math.sin(t * 0.83 + 4.1) + (ptr ? reach * (ptr.x / view.W * 2 - 1) : 0);
    const f = Math.min(1, dt * 60);   // spring values are per 60 Hz frame
    lean.vx = (lean.vx + (wx - lean.x) * 0.022 * f) * (1 - 0.2 * f); lean.vy = (lean.vy + (wy - lean.y) * 0.022 * f) * (1 - 0.2 * f);
    lean.x += lean.vx * f; lean.y += lean.vy * f;
    view.tilt.x = lean.x; view.tilt.y = lean.y;
    view.focus += (aim() - view.focus) * (1 - Math.exp(-dt / 0.3));   // the focus ring takes a moment to follow
    draw();
  };

  createRenderer(canvas, { low }).then((r) => {
    if (dead) { r.dispose(); return; }
    R = r;
    document.fonts?.ready.then(() => { if (!dead) { measure(); settle(); once(); } });   // the real face moves the headline's lines
    size(); if (still) settle(); else cal.step(0, epoch + performance.now() / 1000); view.focus = aim(); draw();
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-ready');
    if (!still) stop = loop(root, tick);
  }).catch((err) => {
    if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
    console.info('Movement: no WebGL2 scene, the headline stands on the still ground.', err?.message || err);
    root.classList.add('is-static');
  });
  // A lost context (GPU process restart, driver reset) leaves the still ground in charge until it comes back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.add('is-static'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; root.classList.remove('is-static'); if (R && view.W) { R.resize(view.W, view.H, ratio); measure(); } once(); }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  // Pointer: hover tilts the movement and pulls the focus (a mouse or a pen, and only while things move).
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!still && fine) {
    root.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') ptr = at(e); }, { signal });
    for (const type of ['pointerleave', 'pointercancel']) root.addEventListener(type, () => { ptr = null; }, { signal });
  }
  // A phone has no hover: a finger drawn sideways across the movement tilts it as a thumb on its edge would
  // (upright, it is the page's scroll).
  if (!still) stroke(root, { move: (x, y) => { ptr = { x, y }; }, end: () => { ptr = null; } }, signal);
  // click, not pointerdown: a touch scroll that starts on the scene must not wind it.
  root.addEventListener('click', (e) => { if (!e.target.closest('button')) wind(); }, { signal });
  cue.addEventListener('click', wind, { signal });

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound); view.stop = cfg.stop;
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); measure(); }
      once();
    },
    action(id) { if (id === 'wind') wind(); },
    destroy() {
      dead = true; ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      R?.dispose(); R = null;
      root.classList.remove('movement', 'is-ready', 'is-still', 'is-static', 'is-bare'); root.innerHTML = '';
    },
  };
}
