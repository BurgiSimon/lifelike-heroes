// Koi pond hero — the first screen of Halden's Stillwater Pavilion page is the pavilion's water, photographed
// from straight above: a clear, shallow pond in morning sun that falls through the slatted roof in bands. Koi
// swim beneath the headline and under the lily pads; a slow pointer draws them over, a fast one scatters them
// and skims the surface, and a click (or the Feed button) drops a pellet whose rings are real ripples in the
// water. This file is the DOM, the input and the loop; pond.js holds the rules, renderer.js the image.
import './style.css';
import { loop, governor, reducedMotion, finePointer, quality, clamp } from '../shared/kit.js';
import { createPond } from './pond.js';
import { createRenderer } from './renderer.js';
import { drawTextMask } from './textmask.js';

const DEFAULTS = { count: 6, pads: 6, speed: 1, reach: 220, ripple: 260 };
const LIMITS = { count: [3, 8], pads: [0, 7], speed: [0.5, 2], reach: [0, 420], ripple: [120, 480] };
const STILL_T = 14.2; // the moment of wind a still shows

const read = (o) => {
  const c = { ...DEFAULTS };
  for (const k of Object.keys(LIMITS)) { const v = Number(o?.[k]); if (Number.isFinite(v)) c[k] = clamp(v, ...LIMITS[k]); }
  c.count = Math.round(c.count); c.pads = Math.round(c.pads);
  return c;
};

export default function mount(root, options = {}) {
  let cfg = read(options);
  const live = !reducedMotion();
  root.classList.add('koi');
  root.innerHTML = `
    <canvas class="koi__canvas" aria-hidden="true"></canvas>
    <h1 class="koi__title">Stillwater Pavilion</h1>
    <button class="koi__cue" type="button">Feed the koi</button>
    <p class="koi__note"><span>Halden · project hero</span><span>Oslo, NO · 2025</span></p>
    <p class="sr-only" role="status"></p>`;
  const canvas = root.querySelector('canvas'); const title = root.querySelector('h1');
  const status = root.querySelector('[role="status"]');
  const pond = createPond(cfg); const st = pond.st;
  const ac = new AbortController(); const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });
  let R = null; let gov = null; let stop = null; let dead = false; let lost = false; let clock = 0; let fedCount = 0;

  const still = (splashes, seconds) => { if (R && !lost && st.W) R.still(st, STILL_T, splashes, seconds); };
  const fit = () => {
    const w = root.clientWidth; const h = root.clientHeight;
    if (!w || !h) return;
    const moved = w !== st.W || h !== st.H;
    if (moved) {
      const restock = pond.fit(w, h);
      if (restock) R?.stock(st.fish);
      if (!live) pond.pose(); else if (restock) pond.place();
    }
    if (!R || lost) return;
    R.setSize(w, h, st.S); R.text(root, drawTextMask); // the headline may have re-wrapped even when the box did not move
    if (!live) still();
  };

  const feed = (x, y) => {
    if (!st.W || !R || lost) return; // no pond on screen (still loading, or the static fallback): nothing to feed
    const p = pond.drop(x, y);
    status.textContent = `Pellet ${++fedCount} dropped; the koi swim to it.`;
    if (live) return;
    // no loop: one change of state. The koi take the pellet; its rings are left a second old.
    pond.settle(p); still([{ x: p.x, y: p.y, kind: 'pellet' }], 1);
  };

  fit();
  const ro = new ResizeObserver(fit); ro.observe(root); ro.observe(title);

  const tick = (dt) => {
    if (!st.W) return;
    gov.tick(dt);
    const d = Math.min(dt, 0.05); // clamped: no jump after a stalled frame
    pond.step(d); clock += d;
    for (const s of st.splash) R.splash(s.x, s.y, s.kind);
    st.splash.length = 0;
    R.frame(st, d, clock);
  };
  // Start drawing with the renderer that has just been built.
  const run = () => {
    if (dead || lost || !R) return;
    root.classList.remove('koi--static');
    fit();
    if (live && !stop) stop = loop(root, tick);
    requestAnimationFrame(() => { if (!dead && !lost) root.classList.add('koi--ready'); });
  };
  const fallback = () => { stop?.(); stop = null; root.classList.remove('koi--ready'); root.classList.add('koi--static'); };

  // Builds the renderer; again after a lost context comes back, since everything the old one held on the GPU is gone.
  let boots = 0;
  const boot = () => {
    const mine = ++boots;
    createRenderer(canvas, { low: quality() === 'low' }).then((r) => {
      if (dead) { r.destroy(); return; }
      if (lost || mine !== boots) { r.destroy({ context: false, resources: !lost }); return; } // overtaken by a loss or by a later boot
      R = r;
      R.stock(st.fish); R.setRipple(cfg.ripple);
      const top = Math.min(window.devicePixelRatio || 1, 2);
      // on a 2x screen the governor may fall to 1x: soft, but it holds its frame rate
      if (gov) R.setRatio(gov.ratio); else gov = governor({ min: clamp(top * 0.5, 0.7, 1), max: top, onChange: (ratio) => R?.setRatio(ratio) });
      document.fonts?.ready.then(() => { if (!dead && !lost && R === r) fit(); }); // the letters' shadow needs the real face
      run();
    }).catch((err) => {
      if (dead) return; // destroyed while it was still starting: the root has been handed back clean
      // no WebGL2 (or no float targets): the quiet ground and the headline stand on their own
      console.info('Koi pond: static fallback.', err?.message || err);
      fallback();
    });
  };
  boot();
  // A lost context (GPU process restart, driver reset) shows the static ground until the browser hands it back.
  on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); lost = true; fallback(); });
  on(canvas, 'webglcontextrestored', () => { lost = false; R?.destroy({ context: false, resources: false }); R = null; boot(); });

  if (live && finePointer()) {
    on(root, 'pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      pond.pointer(e.clientX - r.left, e.clientY - r.top, e.timeStamp);
    });
    for (const type of ['pointerleave', 'pointercancel']) on(root, type, () => pond.leave());
  }
  // click, not pointerdown: a touch scroll that starts on the water must not feed.
  on(root, 'click', (e) => {
    if (e.target.closest('button')) return;
    const r = canvas.getBoundingClientRect();
    feed(e.clientX - r.left, e.clientY - r.top);
  });
  const feedSeeded = () => feed(...pond.seeded());
  on(root.querySelector('.koi__cue'), 'click', feedSeeded);

  return {
    update(next = {}) {
      const was = cfg; cfg = read({ ...cfg, ...next });
      pond.setOptions(cfg); R?.setRipple(cfg.ripple);
      if (was.count !== cfg.count || was.pads !== cfg.pads) { pond.stock(); R?.stock(st.fish); if (live) pond.place(); else pond.pose(); }
      if (!live) still();
    },
    action(id) { if (id === 'feed') feedSeeded(); },
    destroy() {
      dead = true; stop?.(); ro.disconnect(); ac.abort(); R?.destroy(); R = null;
      root.classList.remove('koi', 'koi--ready', 'koi--static'); root.innerHTML = '';
    },
  };
}
