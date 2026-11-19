// Meadow hero — the cover of Fieldnote's Weather issue, photographed: a steel word standing in a real meadow at the
// end of a stormy day. Wind is the subject: a ripple and slow gusts cross the field on a slant and lift seeds into
// the light; a fine pointer parts the grass on a spring and its speed counts as a gust; a click plants a flower where
// it lands and a drag sows a row. mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import * as THREE from 'three';
import { loop, governor, opening, stroke, reducedMotion, finePointer, quality, rnd, clamp, lerp } from '../shared/kit.js';
import { D, CAP, EYE, SHARE, FAR_EDGE, NEAR_PLANT, WIND, CLOUDS, SUN_SEEN, START, CURVE, PETALS, SOW, FADE, GROW } from './config.js';
import { ground } from './terrain.js';
import { createShared, sward, cloudSun } from './glsl.js';
import { createLetters, wordBox, EM, SINK } from './letters.js';
import { createSky } from './sky.js';
import { createGround } from './ground.js';
import { createGrass } from './grass.js';
import { createFlowers } from './flowers.js';
import { createSeeds } from './seeds.js';
import { createField } from './field.js';
import { createPost } from './post.js';
import { createSound } from '../shared/sound.js';
import { voices } from './sound.js';

const DEFAULTS = { wind: 1, reach: 150, density: 1, cap: 60, petals: 'mixed', text: true, sound: false };
// What a page may offer for tweaking (the ranges tidy() holds the options to), and the actions it may trigger.
export const controls = [
  { id: 'wind', label: 'Wind', min: 0, max: 3, step: 0.1, value: 1, unit: '×' },
  { id: 'reach', label: 'Pointer reach', min: 60, max: 280, step: 10, value: 150, unit: 'px' },
  { id: 'density', label: 'Grass density', min: 0.5, max: 1.5, step: 0.1, value: 1, unit: '×' },
  { id: 'cap', label: 'Most flowers', min: 12, max: 120, step: 4, value: 60 },
  { id: 'petals', label: 'Petals', options: ['mixed', 'accent'], value: 'mixed' },
];
export const actions = [{ id: 'sow', label: 'Sow a flower' }, { id: 'gust', label: 'Send a gust' }];
const ASSETS = `${import.meta.env.BASE_URL}assets/meadow/`;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const tidy = (c) => ({
  wind: clamp(num(c.wind, 1), 0, 3), reach: clamp(num(c.reach, 150), 60, 280), density: clamp(num(c.density, 1), 0.5, 1.5),
  cap: clamp(Math.round(num(c.cap, 60)), 12, 120), petals: c.petals === 'accent' ? 'accent' : 'mixed',
  text: c.text !== false,   // false: the meadow alone, without the word, the button or the plate line
  sound: c.sound === true,  // wind, and a flower can be heard coming up; off until a page asks
});

export default function mount(root, options = {}) {
  let cfg = tidy({ ...DEFAULTS, ...options });
  let still = reducedMotion();             // one settled frame, redrawn on input
  let fine = finePointer();
  const low = quality() === 'low' || (quality() === 'auto' && !fine);
  root.classList.add('mdw'); root.classList.toggle('is-bare', !cfg.text);
  root.innerHTML = `
    <canvas class="mdw__canvas" aria-hidden="true"></canvas>
    <h1 class="mdw__title">Weather</h1>
    <button type="button" class="mdw__cue" data-sow>Sow a flower</button>
    <p class="mdw__note"><span>Fieldnote · issue cover</span><span>Issue 14</span></p>
    <p class="sr-only" role="status" data-status></p>`;
  const canvas = root.querySelector('canvas');
  const status = root.querySelector('[data-status]');
  const off = [];
  const on = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); off.push(() => el.removeEventListener(type, fn, opt)); };
  const destroyDom = () => { root.classList.remove('mdw', 'is-live', 'is-static', 'is-bare'); for (const k of ['--title-size', '--title-top', '--ground']) root.style.removeProperty(k); root.innerHTML = ''; };

  const box = wordBox(); const eyeY = ground(0, 0) + EYE;
  const view = { W: 0, H: 0, tanH: 0.4, tanV: 0.25, tanTop: 0.2, tanBot: 0.2, hz: 0.53, foot: 1.03, ratio: 1, planted: '', density: 0, eyeY };

  // The frame for this box: what the lens takes in, and where the DOM headline sits so it stands exactly where the
  // steel one does. It needs the outlines only, so it also runs before the textures arrive and when there is no WebGL.
  const place = () => {
    const r = root.getBoundingClientRect(); const W = Math.round(r.width); const H = Math.round(r.height);
    if (!W || !H) return false;
    const aspect = W / H;
    let tanH = box.width / (aspect < 0.8 ? 0.86 : SHARE) / 2 / D; let tanV = tanH / aspect;
    if (CAP / D / (2 * tanV) > 0.38) { tanV = CAP / D / 0.76; tanH = tanV * aspect; }   // a very wide, short frame: the word stops growing
    // eye level as a share of the height, from the top: higher in a tall frame, lower in a wide one
    const hz = lerp(0.47, 0.53, smooth(0.6, 1.3, aspect)) + 0.03 * smooth(1.9, 2.4, aspect);
    Object.assign(view, { W, H, tanH, tanV, tanTop: 2 * tanV * hz, tanBot: 2 * tanV * (1 - hz), hz, foot: (H + 24) / H });
    const fs = EM * W / (2 * tanH * D); const base = (hz - (box.baseY + SINK - eyeY) / D / (2 * tanV)) * H;
    root.style.setProperty('--title-size', `${fs.toFixed(1)}px`); root.style.setProperty('--title-top', `${(base + 0.0375 * fs - 0.8 * fs).toFixed(1)}px`);
    root.style.setProperty('--ground', `${(base / H * 100).toFixed(2)}%`);
    return true;
  };

  // Asked for here, not left to three, which logs an error when there is no WebGL2 to be had.
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) {
    place(); const ro = new ResizeObserver(place); ro.observe(root);
    root.classList.add('is-static');
    return { update(next = {}) { if ('text' in next) root.classList.toggle('is-bare', next.text === false); }, action() {}, destroy() { ro.disconnect(); destroyDom(); } };
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // every shader here writes its own output
  renderer.debug.checkShaderErrors = import.meta.env.DEV;

  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, eyeY, 0); camera.updateMatrixWorld();
  const world = new THREE.Scene(); const fore = new THREE.Scene();
  const shared = createShared();
  const post = createPost(renderer, { low });
  const snd = createSound((kit) => voices(kit, cfg.wind), { room: 1.6 }); snd.set(cfg.sound);
  let parts = null; let dead = false; let lost = false; let stop = null; let regrow = 0;
  let frameNo = 0; let wt = 0; let now = 0;           // frames drawn, the wind's clock, the hero's clock (s)
  let drift = CLOUDS.start;                           // how far the clouds have gone downwind, m
  let burst = null; let settled = false;
  const ptr = { x: null, y: 0, t: 0, v: 0 };          // v: horizontal speed in px per ms, eased
  const flowers = []; let planted = 0;
  // The text option: with it off the steel word leaves the field, and its shadow with it.
  const word = () => { root.classList.toggle('is-bare', !cfg.text); shared.uWord.value = cfg.text ? 1 : 0; if (parts) parts.letters.mesh.visible = cfg.text; };

  // Where a point of the frame meets the field: the ray is cast to the height the flower will stand at (lift), so
  // its head opens under the pointer and its root is the ground below. Above the horizon it is the field's far edge.
  // Nothing roots nearer than the lens can hold: there the flower is cut shorter instead, so its head still opens
  // under the finger (a tall phone frame looks down at ground much nearer the lens).
  const groundAt = (px, py, lift) => {
    const dx = (px / view.W * 2 - 1) * view.tanH; const dy = view.tanTop - (py / view.H) * (view.tanTop + view.tanBot);
    const over = (s) => eyeY + dy * s - ground(dx * s, -s) - (lift ? lift(dx * s, -s) : 0);
    let t = FAR_EDGE; let prev = 0.4;
    for (let s = 0.6; s <= FAR_EDGE; s += 0.35) {
      if (over(s) < 0) { // crossed: refine
        let a = prev; let b = s;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (over(m) < 0) b = m; else a = m; }
        t = b; break;
      }
      prev = s;
    }
    const min = clamp(0.62 / view.tanBot, 0.9, NEAR_PLANT);
    const x = dx * Math.max(t, min); const z = -Math.max(t, min);
    return { x, z, h: !lift ? 0 : t < min ? clamp(eyeY + dy * min - ground(x, z), 0.12, 0.95) : lift(x, z) };
  };
  const depthY = (p) => (view.hz + (view.foot - view.hz) * p ** CURVE) * view.H;   // the original's depth → screen y
  const depthOf = (y) => clamp((y / view.H - view.hz) / (view.foot - view.hz), 0, 1) ** (1 / CURVE);

  const say = () => { status.textContent = `${flowers.filter((f) => !f.gone).length} flowers in the field.`; };
  const sync = () => { parts?.flowers.sync(flowers); settled = false; };
  const species = (n) => { const set = PETALS[cfg.petals] || PETALS.mixed; return set[n % set.length]; };
  // Past the cap the oldest goes: it wilts over FADE in the loop, or is simply gone when nothing moves.
  const trim = () => {
    for (let rest = flowers.filter((f) => !f.gone).sort((a, b) => a.born - b.born || a.n - b.n); rest.length > cfg.cap; rest.shift()) {
      if (still) flowers.splice(flowers.indexOf(rest[0]), 1); else rest[0].gone = now || 1e-3;   // never 0: that reads as still standing
    }
  };
  // A flower keeps its place as the original kept it (share of the width, depth down the field), so it follows the
  // frame through a resize. Its height: a little taller than the leaves around it, so the head clears them.
  const stand = (f) => {
    const g = groundAt(f.u * view.W, depthY(f.p), (x, z) => Math.min(0.95, sward(x, z) * 1.2 * (0.95 + rnd(f.n * 7) * 0.45) + 0.14));
    f.x = g.x; f.z = g.z; f.y = ground(g.x, g.z); f.h = g.h;
  };
  const plant = (u, p, born, quiet) => {
    const n = planted++;
    const f = { n, u, p, ph: rnd(n * 7 + 1), species: species(n), size: 0.95 + 0.3 * rnd(n * 7 + 2), seed: rnd(n * 7 + 3), born, gone: 0 };
    stand(f); flowers.push(f);
    trim(); if (!quiet) { say(); snd.play('sow', u); } sync();
    if (still) redraw();
  };
  const plantAt = (px, py) => { if (parts) plant(px / view.W, depthOf(py), still ? -1e3 : now); };
  const plantSeeded = () => { if (parts) plant(0.05 + 0.9 * rnd(planted * 13 + 5), 0.14 + 0.78 * rnd(planted * 13 + 6), still ? -1e3 : now); };
  const gust = () => {
    if (still || burst || !parts) return;
    // The front starts just off the field's upwind corner (the near left one; the far left one in a very wide frame),
    // so the grass answers at once, and leaves by the downwind corner.
    const upwind = Math.min(0, 34 * (-WIND.dir[1] - view.tanH * WIND.dir[0]));
    burst = { x: upwind - WIND.burst.width * 1.3, end: view.tanH * 34 * WIND.dir[0] - 34 * WIND.dir[1] + WIND.burst.width * 1.5 };
    settled = false;
  };

  const layout = () => {
    if (!place() || lost) return;
    const { W, H, tanH, hz } = view;
    const n = 0.2;
    // A level camera with the frame shifted, as a view camera would: the letters' verticals stay vertical.
    camera.projectionMatrix.makePerspective(-tanH * n, tanH * n, view.tanTop * n, -view.tanBot * n, n, 400);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const pw = Math.max(2, Math.round(W * view.ratio)); const ph = Math.max(2, Math.round(H * view.ratio));
    renderer.setPixelRatio(1); renderer.setSize(pw, ph, false);
    // A tall frame is a crop of the same lens: its blur is larger against the frame's width.
    const crop = clamp(H / W, 1, 2.2);
    post.setSize(pw, ph, crop, view.ratio / (devicePixelRatio || 1));
    shared.uPx.value = 2 * tanH / pw; shared.uFrame.value = 2 * tanH * crop; shared.uHz.value.set(hz, view.foot);
    post.setFocusTop(1 - hz + 0.07);   // nothing nearer than about 12 m is in focus; its tops stay below this line of the frame
    if (!parts) return;
    // Replant only when the frame takes in different ground, and not at every step of a window being dragged:
    // the field is planted a little wider than the frame, and again once the frame has come to rest.
    const wide = Math.ceil(tanH / 0.04) * 0.04; const near = Math.round(clamp(EYE / view.tanBot * 0.6, 0.9, 2.4) * 5) / 5;
    const key = `${wide.toFixed(2)}|${near}|${cfg.density}`;
    if (key !== view.planted) {
      const grow = () => {
        regrow = 0;
        parts.grass.build({ tanH: wide, tanBot: view.tanBot, near, count: Math.round((low ? 30000 : 80000) * cfg.density), fore: Math.round((low ? 110 : 200) * cfg.density) });
        settled = false; if (still || !stop) redraw();
      };
      const wait = view.planted && view.density === cfg.density;
      view.planted = key; view.density = cfg.density; clearTimeout(regrow);
      if (wait) regrow = setTimeout(grow, 150); else grow();
    }
    for (const f of flowers) stand(f);
    sync();
    if (still) parts.seeds.step(0, wt, 0, null, view);   // no seeds in the still picture, but the air has its motes
    // The pointer's springs are laid out by the original's depth rows: where each row's ground is on screen, how tall its grass stands there.
    parts.field.layout(W, depthY, (p) => { const g = groundAt(W / 2, depthY(p)); return 0.5 * W / (2 * tanH * Math.max(1, -g.z)); });
    if (still || !stop) redraw();
  };

  const render = () => {
    if (!parts || dead || lost) return;
    shared.uTime.value = wt; shared.uWind.value = still ? 0 : cfg.wind; parts.flowers.uNow.value = now;
    shared.uCloud.value.set(WIND.dir[0] * drift, WIND.dir[1] * drift, (drift - CLOUDS.start) * CLOUDS.turn);
    const sunny = (cloudSun(0, 0, shared.uCloud.value.x, shared.uCloud.value.y) - 0.3) / 0.7;
    shared.uSunny.value = sunny;
    post.setSun((SUN_SEEN[0] / -SUN_SEEN[2] / view.tanH + 1) / 2, 1 - (view.tanTop - SUN_SEEN[1] / -SUN_SEEN[2]) / (view.tanTop + view.tanBot), sunny);
    shared.uBurst.value.set(burst ? burst.x : -1e4, burst ? 1 : 0);
    post.render(world, fore, camera, still ? 0 : frameNo++);
  };

  // Without a loop (reduced motion, or before it starts) changes ask for one frame; several in a row share it.
  let queued = 0;
  const redraw = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; render(); }); };

  const tick = (dt) => {
    gov.tick(dt);
    const f = Math.min(2, dt * 60);   // in 60 Hz frames, clamped so a stalled tab does not fling the grass
    now += dt; wt += dt * (0.55 + 0.45 * cfg.wind); drift += dt * cfg.wind * CLOUDS.speed;
    if (burst) { burst.x += dt * WIND.burst.speed; if (burst.x > burst.end) burst = null; }
    const flying = parts.seeds.step(dt, wt, cfg.wind, burst, view);
    ptr.v *= 0.9 ** f;
    const sprung = parts.field.step(f, ptr, cfg.reach * clamp(view.W / 900, 0.6, 1));   // a phone's push stays phone-sized
    snd.play('air', cfg.wind, burst ? 1 : 0, ptr.x === null ? 0 : Math.abs(ptr.v));
    let growing = false;
    for (let i = flowers.length; i--;) {
      const fl = flowers[i];
      if (fl.gone && now - fl.gone > FADE) { flowers.splice(i, 1); parts.flowers.sync(flowers); } else growing ||= !!fl.gone || now - fl.born < GROW;
    }
    // Calm, nothing sprung, nothing growing: the field is a still picture, so skip the frame until that changes.
    const rest = cfg.wind === 0 && !burst && !flying && !sprung && !growing;
    if (rest && settled) return;
    settled = rest;
    render();
  };
  const start = () => { if (!stop && !still && !lost && !dead && parts) stop = loop(root, tick); };
  const halt = () => { stop?.(); stop = null; };

  // The scene is multisampled and an integrated GPU cannot fill 2× of a large frame at 60 Hz, so 1.5 is the ceiling
  // there; a small frame (a phone) may have 2. The floor keeps a narrow frame from being drawn too coarse to read.
  const dpr = devicePixelRatio || 1; const r0 = root.getBoundingClientRect();
  const most = Math.min(dpr, r0.width * r0.height * Math.min(dpr, 2) ** 2 < 1.4e6 ? 2 : 1.5);
  const gov = governor({ min: Math.min(most, clamp(900 / Math.max(1, r0.width), 0.75, 1.5)), max: most, start: opening(r0.width, r0.height, most), onChange: (ratio) => { view.ratio = ratio; layout(); } });

  const tex = (file, { srgb = false, repeat = false, aniso = 1 } = {}) => new THREE.TextureLoader().loadAsync(ASSETS + file).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    return t;
  });
  const fallBack = () => { halt(); root.classList.remove('is-live'); root.classList.add('is-static'); };
  Promise.all([tex('sky.jpg', { aniso: 2 }), tex('env.jpg'), tex('plate.jpg', { srgb: true, repeat: true, aniso: 8 }), tex('plate-rough.jpg', { repeat: true, aniso: 4 }), tex('thatch.jpg', { srgb: true, repeat: true, aniso: 8 })]).then(async ([sky, env, plate, rough, thatch]) => {
    if (dead) { [sky, env, plate, rough, thatch].forEach((t) => t.dispose()); return; }
    env.wrapS = THREE.RepeatWrapping;
    const letters = createLetters(renderer, shared, { env, plate, rough });
    const room = { count: Math.round((low ? 30000 : 80000) * 1.5), fore: Math.round((low ? 110 : 200) * 1.5) };
    parts = { letters, sky: createSky(shared, sky), ground: createGround(shared, thatch), grass: createGrass(shared, room), flowers: createFlowers(shared), seeds: createSeeds(shared), field: createField(shared), textures: [sky, env, plate, rough, thatch] };
    world.add(letters.mesh, parts.sky.mesh, parts.ground.mesh, ...parts.grass.meshes, ...parts.flowers.meshes, parts.seeds.mesh); fore.add(parts.grass.fore);
    word();
    layout();
    // Seven flowers stand in the field on load, at the original's spots; nothing is announced until the visitor sows.
    for (const [u, p] of START) plant(u, p, -1e3, true);
    if (!still && cfg.wind > 0) parts.seeds.prime(view);
    await post.compile(world, fore, camera);
    if (dead) return;
    render();
    cancelAnimationFrame(queued); queued = 0;
    // A context that died on the first frame, or a program the driver refused, leaves nothing to show: fall back.
    if (lost || gl.isContextLost() || renderer.info.programs.some((p) => p.diagnostics && p.diagnostics.runnable === false)) { fallBack(); return; }
    root.classList.add('is-live');
    start();
  }).catch((e) => { console.error('Meadow hero: could not start, showing the still cover.', e); fallBack(); });

  const ro = new ResizeObserver(layout); ro.observe(root);
  off.push(() => ro.disconnect());

  // A lost context takes the picture with it: the headline comes back as text until the context does.
  on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); lost = true; fallBack(); });
  on(canvas, 'webglcontextrestored', () => {
    lost = false;
    if (!parts || dead) return;
    parts.letters.bake(); view.planted = '';
    layout(); render();
    root.classList.remove('is-static'); root.classList.add('is-live');
    start();
  });

  // The visitor's settings can change while the page is open.
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  on(calm, 'change', () => {
    if (still === reducedMotion()) return;
    still = !still;
    if (!still) { start(); return; }
    halt(); burst = null; ptr.x = null; ptr.v = 0;
    for (let i = flowers.length; i--;) { if (flowers[i].gone) flowers.splice(i, 1); else flowers[i].born = -1e3; }
    if (parts) { parts.seeds.clear(); parts.seeds.step(0, wt, 0, null, view); parts.field.reset(); sync(); redraw(); }
  });
  on(matchMedia('(hover: hover) and (pointer: fine)'), 'change', () => { fine = finePointer(); if (!fine) ptr.x = null; });

  // Pointer: hover parts the grass (fine pointers), a click plants, a mouse or pen drag sows a trail.
  let sowing = null; let skipClick = false;
  const at = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  on(root, 'pointerdown', (e) => {
    skipClick = false;
    if (e.pointerType !== 'touch' && e.button === 0 && !e.target.closest('button')) sowing = { ...at(e), moved: false };
  });
  on(root, 'pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = at(e);
    if (fine && !still) {
      if (ptr.x !== null && e.timeStamp > ptr.t) ptr.v = 0.7 * ptr.v + 0.3 * clamp((p.x - ptr.x) / (e.timeStamp - ptr.t), -3, 3);
      ptr.x = p.x; ptr.y = p.y; ptr.t = e.timeStamp;
    }
    if (sowing && Math.hypot(p.x - sowing.x, p.y - sowing.y) >= SOW) { plantAt(p.x, p.y); sowing = { ...p, moved: true }; }
  });
  on(window, 'pointerup', () => { skipClick = !!sowing?.moved; sowing = null; });
  on(window, 'pointercancel', () => { sowing = null; });
  on(root, 'pointerleave', () => { ptr.x = null; });
  on(root, 'click', (e) => { // click, not pointerdown, so a touch scroll over the field plants nothing
    if (e.target.closest('button')) return;
    if (skipClick) { skipClick = false; return; } // the click that ends a sowing drag
    const p = at(e); plantAt(p.x, p.y);
  });
  on(root.querySelector('[data-sow]'), 'click', plantSeeded);
  // A finger drawn sideways through the field (a phone has no hover): the grass parts round it as it goes, and it
  // sows a row as a mouse drag does. Upright, it is the page's scroll.
  const fingers = new AbortController(); off.push(() => fingers.abort());
  let row = null;   // where the stroke last sowed
  stroke(root, {
    move(x, y, t) {
      if (!still) {
        if (ptr.x !== null && t > ptr.t) ptr.v = 0.7 * ptr.v + 0.3 * clamp((x - ptr.x) / (t - ptr.t), -3, 3);
        ptr.x = x; ptr.y = y; ptr.t = t;
      }
      if (!row) row = { x, y }; else if (Math.hypot(x - row.x, y - row.y) >= SOW) { plantAt(x, y); row = { x, y }; }
    },
    end() { ptr.x = null; row = null; },
  }, fingers.signal);

  return {
    update(next = {}) {
      const before = cfg; cfg = tidy({ ...cfg, ...next });
      if (cfg.petals !== before.petals) for (const f of flowers) f.species = species(f.n);
      snd.set(cfg.sound); if (still) snd.play('air', cfg.wind, 0, 0);
      trim(); say(); sync();
      if (cfg.text !== before.text) { word(); settled = false; if (!stop) redraw(); }
      if (cfg.density !== before.density) layout(); else if (still) redraw();
    },
    action(id) {
      if (id === 'sow') plantSeeded();
      if (id === 'gust') gust();
    },
    destroy() {
      dead = true; halt(); cancelAnimationFrame(queued); clearTimeout(regrow); off.forEach((f) => f()); snd.destroy();
      if (parts) { for (const k of ['letters', 'sky', 'ground', 'grass', 'flowers', 'seeds', 'field']) parts[k].dispose(); parts.textures.forEach((t) => t.dispose()); }
      post.dispose(); renderer.dispose();
      if (!gl.isContextLost()) renderer.forceContextLoss();   // or mounts pile up contexts until the browser drops the oldest
      destroyDom();
    },
  };
}
