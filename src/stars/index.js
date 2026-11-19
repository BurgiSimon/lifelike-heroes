// Star chart hero — Meridian Observatory. The real sky about the north celestial pole as a long exposure that is
// alive, with the observatory's chart drawn over it in light. The sky turns about the pole on its own and by hand;
// a fine pointer pencils a constellation through the brightest stars in reach, a click inks and names it.
// Reduced motion: no drift, no loop; a still chart redrawn on input, pins appear complete, a drag turns it 1:1.
import './style.css';
import { loop, governor, opening, reducedMotion, finePointer, quality, clamp } from '../shared/kit.js';
import { loadCatalog } from './catalog.js';
import { createRenderer } from './render.js';
import { createChart, INK } from './chart.js';
import { createLabels } from './labels.js';
import { buildGround } from './ground.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const TAU = Math.PI * 2;
const FLING = { decay: 2.2, max: 2.5 };     // after a drag: speed × e^(−2.2 t), at most 2.5 rad/s
const SPIN = -1;                            // the northern sky turns anticlockwise for someone looking up at the pole
const DEFAULTS = { drift: 0.4, cell: 38, reach: 150, join: 7, tone: 'accent', text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'drift', label: 'Sky drift', min: 0, max: 2, step: 0.1, value: 0.4, unit: '°/s' },
  { id: 'cell', label: 'Star spacing', min: 28, max: 56, step: 2, value: 38, unit: 'px' },
  { id: 'reach', label: 'Pointer reach', min: 80, max: 240, step: 10, value: 150, unit: 'px' },
  { id: 'join', label: 'Stars joined', min: 3, max: 9, step: 1, value: 7 },
  { id: 'tone', label: 'Pin colour', options: ['accent', 'ink', 'sky', 'clay', 'plum'], value: 'accent' },
];
export const actions = [{ id: 'pin', label: 'Pin a constellation' }, { id: 'clear', label: 'Clear the chart' }];
const TONES = { accent: '#ff6a3d', ink: '#f2f2ee', sky: '#8fb6e0', clay: '#d4855d', plum: '#9a7096' };

// A CSS colour → what the scene has to emit for the film (post's curve) to print exactly that colour.
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function emit(css, out) {
  probe.canvas.width = probe.canvas.height = 1; probe.fillStyle = '#000'; probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  const lin = [0, 1, 2].map((c) => (d[c] / 255) ** 2.2); const l = Math.max(...lin, 1e-4);
  const x = 8 * (l - 1 + Math.sqrt((1 - l) ** 2 + l / 4)); // inverse of t = x (1 + x/16) / (1 + x)
  for (let c = 0; c < 3; c++) out[c] = (lin[c] / l) * x;
  return out;
}

// Options as the chart takes them: inside the ranges its buffers and its layout were built for, and a pin colour
// that is one (anything else would ink in black, which on this sky is no ink at all).
const tidy = (o) => ({ ...o, drift: clamp(+o.drift || 0, 0, 2), cell: clamp(+o.cell || DEFAULTS.cell, 28, 56), reach: clamp(+o.reach || DEFAULTS.reach, 80, 240), join: Math.round(clamp(+o.join || DEFAULTS.join, 3, 9)), tone: Object.hasOwn(TONES, o.tone) || CSS.supports('color', `${o.tone}`) ? o.tone : DEFAULTS.tone, text: o.text !== false, sound: o.sound === true });

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  const still = reducedMotion();
  const fine = finePointer();
  const low = quality() === 'low';
  const ac = new AbortController(); const { signal } = ac;

  root.classList.add('sch'); root.classList.toggle('is-still', still); root.classList.toggle('is-bare', !cfg.text);
  root.setAttribute('aria-labelledby', 'sch-title');
  root.innerHTML = `
    <canvas class="sch__sky" aria-hidden="true"></canvas>
    <canvas class="sch__labels" aria-hidden="true"></canvas>
    <h1 class="sch__title" id="sch-title">Polar Night</h1>
    <button type="button" class="sch__cue">Pin a constellation</button>
    <p class="sr-only" role="status"></p>
    <p class="sch__note"><span>Meridian · home hero</span><span>69° north</span></p>`;
  const cv = root.querySelector('.sch__sky');
  const title = root.querySelector('.sch__title');
  const cue = root.querySelector('.sch__cue');
  const status = root.querySelector('[role="status"]');

  // The view: everything index.js, the chart and the shaders agree on, in CSS px with y down.
  const view = { W: 0, H: 0, poleX: 0, poleY: 0, ring: 100, scale: 1, rot: -1.83, time: 0, surge: 0, reach: 150, still, box: { l: 0, t: 0, r: 0, b: 0 }, rects: [], cue: { l: 0, t: 0, r: 0, b: 0 }, tone: [0, 0, 0] };
  const pencilCol = emit('#bdbdb5', [0, 0, 0]);
  let gl = null; let chart = null; let land = null; let ratio = 1; let fling = 0; let drag = null; let ptr = null; let skipClick = false; let stop = null; let queued = 0;
  let stir = 0; // a pin sets it to 1: the aurora answers, up in a second and gone in ten
  const snd = createSound(voices, { room: 3.2 }); snd.set(cfg.sound);
  let lead = -1; // the star the pencil last started from
  // A fresh pin: the aurora stirs, and each of its stars rings as the ink reaches it.
  const pinned = () => { stir = 1; const p = chart.pins[chart.pins.length - 1]; snd.play('pin', p.pick.length, p.n, p.x / view.W * 2 - 1, still ? 0.06 : INK.stagger / 1000); };
  const labels = createLabels(root.querySelector('.sch__labels'));
  const skyline = (x) => (land ? land.skyline(x) : view.H);
  const setTone = () => emit(TONES[cfg.tone] || cfg.tone, view.tone);
  setTone();

  const draw = (now = performance.now()) => {
    queued = 0;
    if (!gl || gl.lost || !view.W) return;
    chart.update(now, ptr && !drag?.moved ? ptr : null, cfg, view.tone, pencilCol);
    if (lead !== chart.lead) { lead = chart.lead; if (lead >= 0) snd.play('tick', lead, ptr.x / view.W * 2 - 1); }
    gl.frame(view);
    labels.draw(view, chart.pins, skyline);
  };
  const once = () => { if (still && !queued) queued = requestAnimationFrame(() => draw()); }; // without motion there is no loop: redraw on input

  // Where the type is: the headline's lines (the sky is quiet under them, nothing is selectable behind them) and the cue.
  const measure = () => {
    const h = root.getBoundingClientRect(); const c = cue.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(title);
    // With the text switched off nothing lies on the sky: no lines to quiet it under, and the cue is nowhere.
    view.rects = cfg.text ? [...range.getClientRects()].map((r) => ({ l: r.left - h.left, t: r.top - h.top, r: r.right - h.left, b: r.bottom - h.top })) : [];
    const b = view.box; b.l = b.t = 1e9; b.r = b.b = -1e9;
    for (const r of view.rects) { b.l = Math.min(b.l, r.l - 6); b.t = Math.min(b.t, r.t - 2); b.r = Math.max(b.r, r.r + 6); b.b = Math.max(b.b, r.b + 2); }
    Object.assign(view.cue, cfg.text ? { l: c.left - h.left, t: c.top - h.top, r: c.right - h.left, b: c.bottom - h.top } : { l: -1e5, t: -1e5, r: -1e5, b: -1e5 });
    gl?.mask(view.rects, view.cue);
    labels.touch();
  };
  const size = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    // The chart is laid out again when the width changes; a phone's address bar coming and going leaves it alone.
    if (w !== view.W || Math.abs(h - view.H) > 120) {
      const wide = w > h * 0.9;
      view.poleX = Math.round(w * 0.68); view.poleY = Math.round(h * (wide ? 0.44 : 0.36));
      const far = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => Math.hypot(x - view.poleX, y - view.poleY)));
      // One 15° ring, as the original; on large screens it grows so the far corner stays on the map (148° out) and
      // the left edge stays inside the sky that rises here (104° out).
      view.ring = Math.max(clamp(Math.min(w, h) * 0.16, 84, 150), far / (148 / 15), wide ? view.poleX / (104 / 15) : 0);
      view.scale = view.ring / 15;
    }
    view.W = w; view.H = h;
    view.reach = cfg.reach * clamp(w / 900, 0.6, 1); // a phone's constellations stay phone-sized
    labels.resize(w, h);
    if (gl) {
      land = buildGround(w, h, gl.tops);
      gl.resize(w, h, ratio); gl.ground(land);
      // ponytail: land, extinction and aurora live in a flat altitude frame along the bottom edge, not in the chart's
      // own projection (whose horizon would run down the left edge). A true all-sky horizon needs a second projection.
      gl.frameOfGround(land.horizon, land.horizon / (w > h * 0.9 ? 74 : 48), view.poleX); // a tall screen looks through a longer lens: the curtains stand clear of the headline
      chart.limit(cfg.cell); gl.depth(cfg.cell);
    }
    measure();
    if (still) draw();
  };

  // A HiDPI screen opens at about 2.2 megapixels (never under one render pixel per CSS pixel): the first frames
  // are the ones a governor cannot save.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const top = Math.min(dpr, Math.max(1, Math.sqrt(2.2e6 / Math.max(1, root.clientWidth * root.clientHeight))));
  const gov = governor({ min: Math.min(top, Math.max(0.6, 0.5 * dpr)), max: top, start: opening(root.clientWidth, root.clientHeight, top), onChange: (r) => { ratio = r; if (gl && view.W) gl.resize(view.W, view.H, ratio); } });

  const turn = (dt, t) => {
    gov.tick(dt);
    view.time += dt;
    view.surge += (stir - view.surge) * (1 - Math.exp(-dt / 0.8)); stir *= Math.exp(-dt / 5);
    if (Math.random() < dt * 0.13) snd.play('twinkle');
    if (!drag?.moved) {
      view.rot = (view.rot + (SPIN * (cfg.drift * Math.PI) / 180 + fling) * dt) % TAU;
      fling = Math.abs(fling) < 0.002 ? 0 : fling * Math.exp(-FLING.decay * dt);
    }
    draw(t * 1000);
  };

  // Pointer: moving pencils (fine pointers only), a press that travels 6 px becomes a turn of the chart about its
  // pole, and a click that was not a turn inks. pan-y on the canvas leaves vertical touch scrolling to the page.
  const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const angle = (p) => Math.atan2(p.y - view.poleY, p.x - view.poleX);
  cv.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    skipClick = false; fling = 0;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, a: 0, t: 0, w: 0 };
  }, { signal });
  cv.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.moved = true; drag.a = angle(p); drag.t = e.timeStamp;
        try { cv.setPointerCapture(e.pointerId); } catch { /* the pointer has already lifted */ }
        root.classList.add('is-turning');
        return;
      }
      let da = angle(p) - drag.a; da = clamp(Math.atan2(Math.sin(da), Math.cos(da)), -0.35, 0.35); // near the pole a small move is a big angle
      view.rot = (view.rot + da) % TAU;
      drag.w = drag.w * 0.6 + (da / Math.max(1, e.timeStamp - drag.t)) * 400; // rad/s, smoothed
      drag.a = angle(p); drag.t = e.timeStamp;
      once();
      return;
    }
    if (fine && e.pointerType !== 'touch') { ptr = p; once(); }
  }, { signal });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      skipClick = e.type === 'pointerup';
      if (!still && e.type === 'pointerup' && e.timeStamp - drag.t < 90) fling = clamp(drag.w, -FLING.max, FLING.max);
      root.classList.remove('is-turning');
    }
    drag = null;
  };
  cv.addEventListener('pointerup', release, { signal });
  cv.addEventListener('pointercancel', release, { signal });
  cv.addEventListener('pointerleave', () => { if (!drag?.moved) { ptr = null; once(); } }, { signal });
  cv.addEventListener('click', (e) => {
    if (skipClick) { skipClick = false; return; }
    if (!chart) return;
    if (chart.pin(at(e), cfg)) pinned();
    ptr = null; // the pencil lifts off the fresh ink until the pointer moves again
    once();
  }, { signal });
  const pinSpot = () => {
    if (!chart || !gl || gl.lost) return;
    const p = chart.spot(cfg);
    if (p && chart.pin(p, cfg)) pinned(); else if (!p) status.textContent = 'No room left on the chart.';
    once();
  };
  cue.addEventListener('click', pinSpot, { signal });
  // A lost context leaves the still in charge until it comes back.
  cv.addEventListener('webglcontextlost', () => root.classList.add('is-static'), { signal });
  cv.addEventListener('webglcontextrestored', () => { root.classList.remove('is-static'); labels.touch(); once(); }, { signal });

  const ro = new ResizeObserver(size); ro.observe(root);
  size();

  (async () => {
    try {
      const catalog = await loadCatalog('/assets/stars/stars.bin', signal);
      chart = createChart({ catalog, view, still, status, skyline });
      gl = await createRenderer(cv, { catalog, chart, low, signal });
    } catch (err) {
      if (signal.aborted) return;
      console.warn('Star chart: WebGL2 scene unavailable, showing the still.', err); // the headline stands either way
      gl = null; root.classList.add('is-static');
      return;
    }
    if (signal.aborted) { gl.dispose(); return; }
    document.fonts?.ready.then(() => { if (!signal.aborted) { measure(); once(); } });
    size(); gl.warm();
    chart.update(performance.now(), null, cfg, view.tone, pencilCol); // place the stars before the first pins look for them
    chart.open(cfg);
    draw();
    root.classList.add('is-ready');
    if (!still) stop = loop(root, turn);
  })();

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      snd.set(cfg.sound);
      if (cfg.tone !== before.tone) setTone();
      if (cfg.text !== before.text) { root.classList.toggle('is-bare', !cfg.text); measure(); }
      view.reach = cfg.reach * clamp(view.W / 900, 0.6, 1);
      if (cfg.cell !== before.cell) { chart?.limit(cfg.cell); gl?.depth(cfg.cell); }
      once();
    },
    action(id) {
      if (id === 'pin') pinSpot();
      if (id === 'clear' && chart) { chart.clear(); snd.play('clear'); once(); }
    },
    destroy() {
      ac.abort(); stop?.(); ro.disconnect(); cancelAnimationFrame(queued); snd.destroy();
      gl?.dispose(); gl = null;
      root.classList.remove('sch', 'is-ready', 'is-still', 'is-static', 'is-turning', 'is-bare'); root.removeAttribute('aria-labelledby'); root.innerHTML = '';
    },
  };
}
