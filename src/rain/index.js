// Night rain hero — the first screen of Lowlight's night programme is a window: rain on the pane, the pane misted
// over, and the city behind it as a lens focused on the glass sees it, every lamp a disc of light. The pointer is a
// hand on the glass and wipes the mist away in a streaked band, which mists over again by itself; a click (or the
// cue) sets a heavy drop running down, which takes the drops in its way with it and leaves a clear trail and a row
// of beads. This file is the DOM, the input and the loop; drops.js holds the rules, renderer.js the image.
// Reduced motion: no loop; one settled pane, redrawn when it is wiped, and a sent drop is at once where it ends.
import './style.css';
import { loop, governor, reducedMotion, quality, clamp } from '../shared/kit.js';
import { createRain } from './drops.js';
import { createRenderer } from './renderer.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { rain: 1, fog: 0.95, refog: 14, reach: 64 };
const LIMITS = { rain: [0, 2], fog: [0, 1], refog: [4, 40], reach: [30, 140] };
// What a page may offer for tweaking, within the same limits, and the actions it may trigger.
export const controls = [['rain', 'Rainfall', 0.1, '×'], ['fog', 'Mist on the glass', 0.05], ['refog', 'Mists over in', 1, 's'], ['reach', 'Wipe width', 2, 'px']]
  .map(([id, label, step, unit]) => ({ id, label, min: LIMITS[id][0], max: LIMITS[id][1], step, value: DEFAULTS[id], unit }));
export const actions = [{ id: 'drop', label: 'Send a drop down' }, { id: 'breathe', label: 'Breathe on the glass' }];

const read = (o) => {
  const c = { ...DEFAULTS };
  for (const k of Object.keys(LIMITS)) { const v = Number(o?.[k]); if (Number.isFinite(v)) c[k] = clamp(v, ...LIMITS[k]); }
  c.text = o?.text !== false;    // false: the window alone, no headline, cue or plate line
  c.sound = o?.sound === true;   // rain on the pane, a drop, a hand on wet glass; off until a page asks
  return c;
};

export default function mount(root, options = {}) {
  let cfg = read(options);
  const live = !reducedMotion();
  root.classList.add('rain'); root.classList.toggle('is-still', !live); root.classList.toggle('is-bare', !cfg.text);
  root.setAttribute('aria-labelledby', 'rain-title');
  root.innerHTML = `
    <canvas class="rain__glass" aria-hidden="true"></canvas>
    <h1 class="rain__title" id="rain-title">Small Hours</h1>
    <button class="rain__cue" type="button">Send a drop down</button>
    <p class="rain__note"><span>Lowlight · night programme</span><span>00:00 – 04:00</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const status = root.querySelector('[role="status"]');
  const rain = createRain(); const st = rain.st;
  const snd = createSound(voices, { room: 1.4 }); snd.set(cfg.sound);
  const pan = (x) => (x / Math.max(1, st.W)) * 2 - 1;
  const ac = new AbortController(); const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });
  let R = null; let gov = null; let stop = null; let dead = false; let lost = false; let clock = 0; let sent = 0; let soaked = false; let queued = 0;
  let hand = null; let stroke = 0; let drawn = 0; let press = 0.4; let spilt = 0;   // where the pointer last was on the glass, which stroke this is, how long it is, how much of the hand is on the glass, how far since it last left a drop
  const head = { x: 0, y: 0, tx: 0, ty: 0 }; // the view behind the glass follows the pointer a little, as it does a head

  const still = () => { queued = 0; if (R && !lost && st.W) { rain.write(); R.frame(st, 0, 0); } };
  const once = () => { if (!live && !queued) queued = requestAnimationFrame(still); };   // without motion there is no loop: redraw on input
  const fit = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    rain.fit(w, h);
    if (!R || lost) return;
    R.setSize(w, h);
    if (!soaked) open();
    if (!live) still();
  };
  // The pane the page opens on: nearly half a minute of rain already on it, the trails of its last drops still
  // clear in the mist, and one sweep of a hand across it.
  const open = () => {
    soaked = true;
    R.stamp(rain.soak(26, cfg.rain, cfg.refog));
    const reach = Math.min(st.W, st.H) * 0.095; const N = 16; let was = null; let far = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N; const at = [st.W * (0.29 + 0.65 * t), st.H * (0.53 - 0.3 * t - 0.09 * Math.sin(Math.PI * t))];   // up and to the right, in an arc, as an arm swings
      if (was) { R.wipe(...was, ...at, 0.37, reach, far); far += Math.hypot(at[0] - was[0], at[1] - was[1]); }
      was = at;
    }
  };

  const send = (x, y) => {
    if (!st.W || !R || lost) return;   // no window on screen (still loading, or the static fallback)
    const d = rain.send(x, y);
    status.textContent = `Drop ${++sent} runs down the glass.`;
    snd.play('drop', pan(d.x));
    if (!live) { R.stamp(rain.settle(d)); still(); }
  };
  const breathe = () => { if (!R || lost) return; R.breathe(); snd.play('breathe'); status.textContent = 'The glass mists over.'; once(); };

  const tick = (dt) => {
    if (!st.W) return;
    gov.tick(dt);
    const d = Math.min(dt, 0.05); clock += d;   // clamped: no jump after a stalled frame
    rain.advance(d, cfg.rain);
    for (const x of st.landed) if (Math.random() < 0.3) snd.play('patter', x * 2 - 1);
    st.landed.length = 0;
    const k = 1 - Math.exp(-d * 3); head.x += (head.tx - head.x) * k; head.y += (head.ty - head.y) * k;
    R.look(head.x, head.y);
    rain.write(); R.frame(st, d, clock);
  };
  const run = () => {
    if (dead || lost || !R) return;
    root.classList.remove('is-static');
    fit();
    if (live && !stop) stop = loop(root, tick);
    requestAnimationFrame(() => { if (!dead && !lost) root.classList.add('is-ready'); });
  };
  const fallback = () => { stop?.(); stop = null; root.classList.remove('is-ready'); root.classList.add('is-static'); };

  // Builds the renderer; again after a lost context comes back, since everything the old one held on the GPU is gone.
  let boots = 0;
  const boot = () => {
    const mine = ++boots;
    createRenderer(canvas, { low: quality() === 'low' }).then((r) => {
      if (dead) { r.destroy(); return; }
      if (lost || mine !== boots) { r.destroy({ context: false, resources: !lost }); return; }   // overtaken by a loss or by a later boot
      R = r; R.setOptions(cfg); R.warm();
      // a HiDPI screen opens at about 2.6 megapixels: the drops are the sharp thing in this picture, and the first
      // frames are the ones a governor cannot save
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const top = Math.min(dpr, Math.max(1, Math.sqrt(2.6e6 / Math.max(1, root.clientWidth * root.clientHeight))));
      if (gov) R.setRatio(gov.ratio); else gov = governor({ min: Math.min(top, Math.max(0.7, 0.5 * dpr)), max: top, onChange: (ratio) => R?.setRatio(ratio) });
      run();
    }).catch((err) => {
      if (dead) return;   // destroyed while it was still starting: the root has been handed back clean
      console.info('Night rain: static fallback.', err?.message || err);   // no WebGL2 (or no float targets): the still and the headline stand
      fallback();
    });
  };
  boot();
  const ro = new ResizeObserver(fit); ro.observe(root);
  on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); lost = true; fallback(); });
  on(canvas, 'webglcontextrestored', () => { lost = false; R?.destroy({ context: false, resources: false }); R = null; boot(); });

  // The pointer is a hand on the glass: wherever it moves it wipes. A mouse or a pen wipes as it hovers; a finger
  // wipes as it is drawn sideways (pan-y leaves an up-and-down drag to the page).
  const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
  const begin = (p) => { hand = p; stroke = Math.random(); drawn = 0; press = 0.4; };
  on(root, 'pointerdown', (e) => { if (e.pointerType === 'touch') begin(at(e)); });
  on(root, 'pointermove', (e) => {
    const p = at(e);
    if (!hand) begin(p);
    if (R && !lost) {
      const went = Math.hypot(p.x - hand.x, p.y - hand.y); const speed = went / Math.max(4, p.t - hand.t);   // px a millisecond
      // a slow stroke is a fingertip, a fast one the flat of the hand
      press += (clamp(0.36 + speed * 0.7, 0.36, 1) - press) * 0.25;
      const reach = cfg.reach * press * clamp(st.W / 900, 0.6, 1);                                             // a phone's hand is a phone's size
      R.wipe(hand.x, hand.y, p.x, p.y, stroke, reach, drawn);
      drawn += went; spilt += went;
      // the water it pushes aside stands in small drops along the stroke's edges
      if (spilt > 16 && went > 0.5) { spilt = 0; const side = Math.random() < 0.5 ? -1 : 1; const far = reach * (0.8 + 0.25 * Math.random()) * side; rain.spill(p.x - ((p.y - hand.y) / went) * far, p.y + ((p.x - hand.x) / went) * far); }
      if (speed > 0.25) snd.play('wipe', pan(p.x), Math.min(1, speed / 2));
    }
    hand = p; head.tx = pan(p.x); head.ty = (p.y / Math.max(1, st.H)) * 2 - 1;
    once();
  });
  for (const type of ['pointerleave', 'pointercancel', 'pointerup']) on(root, type, (e) => { if (type !== 'pointerup' || e.pointerType === 'touch') hand = null; if (type === 'pointerleave') head.tx = head.ty = 0; });
  // click, not pointerdown: a touch scroll that starts on the glass must not send a drop.
  on(root, 'click', (e) => { if (e.target.closest('button')) return; const p = at(e); send(p.x, p.y); });
  on(root.querySelector('.rain__cue'), 'click', () => send(...rain.spot()));

  return {
    update(next = {}) {
      const was = cfg; cfg = read({ ...cfg, ...next });
      R?.setOptions(cfg); snd.set(cfg.sound);
      if (was.text !== cfg.text) root.classList.toggle('is-bare', !cfg.text);
      once();
    },
    action(id) { if (id === 'drop') send(...rain.spot()); if (id === 'breathe') breathe(); },
    destroy() {
      dead = true; stop?.(); ro.disconnect(); ac.abort(); cancelAnimationFrame(queued); R?.destroy(); R = null; snd.destroy();
      root.classList.remove('rain', 'is-ready', 'is-static', 'is-still', 'is-bare'); root.removeAttribute('aria-labelledby'); root.innerHTML = '';
    },
  };
}
