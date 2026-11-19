// Roost hero — the first screen of Evensong, a rooftop bar in Rome. It is one photograph: a normal lens on the
// roof across the street, twenty minutes after sunset in November, looking level at the bar's old sign and the sky
// behind it. The sky is a photographed one, gold along the horizon under a deck of lilac cloud. Everything in front
// of it is silhouette: the sign's letters (the headline), the aerials and wires, a dome further off, and the
// starlings, which come to this part of the city every evening to roost.
// Left alone, the flock wheels over the roofs (each bird minding its seven nearest neighbours), birds leave the
// sign for a turn with it and come back, and now and then a falcon comes through and the flock rolls away from it.
// A pointer is a falcon: it flies in the flock's sky and follows the pointer, and the flock folds away from it; a
// pointer that sweeps along the sign puts up the birds it passes. A finger drawn across a phone's screen is the
// same falcon. A click (or the button) is a clap: every bird on the sign goes up, and over the next minute they
// trickle back.
// This file is the DOM, the input and the loop; flock.js holds the rules, skyline.js paints the roofline and the
// sign, render.js and shaders.js draw the picture.
// Reduced motion: no loop; one settled frame, drawn again whenever the visitor does something.
// mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, rnd, clamp } from '../shared/kit.js';
import { createFlock, MAXF } from './flock.js';
import { createRenderer } from './render.js';
import { paintSkyline } from './skyline.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { birds: 3000, reach: 180, text: true, sound: false };
const FEWER = 1400;          // the flock on a phone, and in the low tier: its sky is narrower, and so is its processor
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'birds', label: 'Starlings in the flock', min: 400, max: MAXF, step: 100, value: 3000 },
  { id: 'reach', label: 'Pointer reach', min: 60, max: 360, step: 10, value: 180, unit: 'px' },
];
export const actions = [{ id: 'clap', label: 'Clap your hands' }, { id: 'falcon', label: 'Send a falcon through' }];

const num = (v, d) => (v === null || v === '' || !Number.isFinite(+v) ? d : +v);
// Options as the scene takes them: inside the ranges it was built for, whatever a page passes.
const tidy = (o) => ({
  birds: Math.round(clamp(num(o.birds, DEFAULTS.birds), 400, MAXF)), reach: clamp(num(o.reach, DEFAULTS.reach), 60, 360),
  text: o.text !== false,    // false: the sky and the roofs alone: the frame stands empty of its letters, and there is no button or plate line
  sound: o.sound === true,   // off until a page asks
});

export default function mount(root, options = {}) {
  const still = reducedMotion(); const fine = finePointer(); const low = quality() === 'low';
  let cfg = tidy({ ...DEFAULTS, ...((low || !fine) && { birds: FEWER }), ...options });
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('roost'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="roost__canvas" aria-hidden="true"></canvas>
    <h1 class="roost__title">Evensong</h1>
    <button type="button" class="roost__cue">Clap your hands</button>
    <p class="roost__note"><span>Evensong · home hero</span><span>Rome · 2026</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1'); const cue = root.querySelector('button');
  const status = root.querySelector('[role="status"]');

  // The view: what this file and the shaders agree on, in CSS px with y down.
  const view = { W: 0, H: 0, still };
  const flock = createFlock(cfg); const st = flock.st;
  let R = null; let stop = null; let dead = false; let lost = false; let ratio = 1; let queued = 0; let claps = 0;
  let ptr = null; let was = null;   // where a fine pointer or a finger is, and where it was a frame ago
  let falcons = 0;
  const air = { x: 0, y: 0, vx: 0, vy: 0 };   // the pointer as the flock takes it: where, and how fast (px/s, eased)
  const snd = createSound(voices, { room: 2.2 }); snd.set(cfg.sound);
  const pan = (x) => x / Math.max(1, view.W) * 2 - 1;
  const heard = () => { for (const e of st.events) snd.play(e.kind, pan(e.x), e.n); st.events.length = 0; };

  const draw = () => { queued = 0; if (R && !lost && view.W) R.frame(view); };
  // Without a loop (reduced motion, or before it starts) a change asks for one frame; several in a row share it.
  const once = () => { if ((still || !stop) && !queued) queued = requestAnimationFrame(draw); };

  // The picture is laid out round the headline: its type size is the lens's focal length (the sign's letters are a
  // fixed size in the world), the horizon lies under its feet, and the sign is painted where the page put the <h1>.
  const box = () => { const h = root.getBoundingClientRect(); const r = title.getBoundingClientRect(); return { l: r.left - h.left, t: r.top - h.top, r: r.right - h.left, b: r.bottom - h.top, em: parseFloat(getComputedStyle(title).fontSize) || 64 }; };
  const lay = () => {
    if (!view.W) return;
    flock.fit(view.W, view.H, box());
    if (!R) return;
    R.layout(flock.g);
    flock.setPerches(R.paint((cv) => paintSkyline(cv, root, title, flock.g, !cfg.text)));
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    view.W = w; view.H = h;
    R?.resize(w, h, ratio);
    lay(); once();
  };

  // The visitor's one verb: a clap. Every bird on the sign goes up, the nearest to the clap first.
  const clap = (x, y) => {
    if (!R || lost || !view.W) return;   // nothing on screen to act on: still loading, or the static fallback
    const n = flock.clap(x, y, still);   // no loop: the sign is shown as it is a moment later, bare, its birds gone to the flock
    claps++;
    status.textContent = n ? `Clap ${claps}: ${n} ${n === 1 ? 'starling goes' : 'starlings go'} up off the sign and ${n === 1 ? 'joins' : 'join'} the flock. They will be back.` : `Clap ${claps}: the sign is bare already; its birds are still up with the flock.`;
    if (still) st.events.length = 0; else heard();
    once();
  };
  // The button's claps: from a spot along the sign, a new one each time, the same ones on every load.
  const clapSeeded = () => { const b = box(); clap(b.l + (0.15 + 0.7 * rnd(claps * 2 + 5)) * (b.r - b.l), b.t + 0.5 * (b.b - b.t)); };
  // A falcon is announced with its number: text the same as before is not read out again. Without motion none can
  // come through, and the button says so rather than claim one.
  const falcon = () => {
    if (!R || lost || !view.W) return;
    if (still) { status.textContent = 'The flock stays as it is while motion is reduced.'; return; }
    flock.pass(); status.textContent = `Falcon ${++falcons} comes in over the roofs, and the flock rolls away from it.`; once();
  };

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames are
  // the ones a governor cannot save. On a 2x screen it may fall to 1x: soft, but it holds its frame rate.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (R && view.W) R.resize(view.W, view.H, ratio); } });

  const tick = (dt) => {
    gov.tick(dt);
    // The pointer as the flock takes it: where it is, and how fast it is going (eased, so one jump of the mouse is not a stoop).
    let hunter = null;
    if (ptr) {
      const k = 1 - Math.exp(-dt / 0.08);
      const vx = was && dt > 0 ? (ptr.x - was.x) / dt : 0; const vy = was && dt > 0 ? (ptr.y - was.y) / dt : 0;
      air.vx += (vx - air.vx) * k; air.vy += (vy - air.vy) * k; air.x = ptr.x; air.y = ptr.y; hunter = air;
    } else { air.vx = air.vy = 0; }
    was = ptr && { x: ptr.x, y: ptr.y };
    flock.step(dt, hunter);
    heard();
    // the birds on the sign talk: more of them, more talk
    if (st.perched && Math.random() < dt * (0.3 + st.perched / 45)) snd.play('chatter', pan(st.perch[Math.floor(Math.random() * st.perched) * 4]));
    draw();
  };

  createRenderer(canvas, flock).then((r) => {
    if (dead) { r.dispose(); return; }
    R = r;
    document.fonts?.ready.then(() => { if (!dead) { lay(); once(); } });   // the real face moves the headline's letters
    size(); draw();
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-ready');
    if (!still) stop = loop(root, tick);
  }).catch((err) => {
    if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
    console.info('Roost: no WebGL2 scene, the headline stands on the still ground.', err?.message || err);
    root.classList.add('is-static');
  });
  // A lost context (GPU process restart, driver reset) leaves the still ground in charge until it comes back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.add('is-static'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; root.classList.remove('is-static');
    if (R && view.W) { R.resize(view.W, view.H, ratio); lay(); }   // the roofline is painted again; the birds are where they were
    once();
  }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  // Pointer: hover is the falcon (a mouse or a pen, and only while things move), and so is a finger drawn sideways
  // across the sky (upright, it is the page's scroll); a click or a tap is a clap.
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!still && fine) {
    root.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') ptr = at(e); }, { signal });
    for (const type of ['pointerleave', 'pointercancel']) root.addEventListener(type, () => { ptr = null; }, { signal });
  }
  if (!still) stroke(root, { move: (x, y, t, first) => { if (first) was = null; ptr = { x, y }; }, end: () => { ptr = null; } }, signal);   // first: the falcon's speed starts from rest, not from where a mouse was
  // click, not pointerdown: a touch scroll that starts on the sky must not put the birds up.
  root.addEventListener('click', (e) => { if (!e.target.closest('button')) { const p = at(e); clap(p.x, p.y); } }, { signal });
  cue.addEventListener('click', clapSeeded, { signal });

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound); flock.setOptions(cfg);
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); lay(); }
      once();
    },
    action(id) { if (id === 'clap') clapSeeded(); else if (id === 'falcon') falcon(); },
    destroy() {
      dead = true; ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      R?.dispose(); R = null;
      root.classList.remove('roost', 'is-ready', 'is-still', 'is-static', 'is-bare'); root.innerHTML = '';
    },
  };
}
