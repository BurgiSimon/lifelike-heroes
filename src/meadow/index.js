// Meadow hero — the cover of Fieldnote's Weather issue, photographed: a steel word standing in a real meadow at the
// end of a stormy day. Wind is the subject: a ripple and slow gusts cross the field on a slant and lift seeds into
// the light; a fine pointer parts the grass on a spring and its speed counts as a gust; a click plants a flower where
// it lands and a drag sows a row. mount(root, options) returns { update(options), action(id), destroy() }.
import './style.css';
import * as THREE from 'three';
import { loop, governor, reducedMotion, finePointer, quality, rnd, clamp, lerp } from '../shared/kit.js';
import { D, CAP, EYE, SHARE, FORE, FAR_EDGE, NEAR_PLANT, WIND, START, CURVE, PETALS, SOW, FADE, GROW } from './config.js';
import { ground } from './terrain.js';
import { shared, sward } from './glsl.js';
import { createLetters, EM } from './letters.js';
import { createSky } from './sky.js';
import { createGround } from './ground.js';
import { createGrass } from './grass.js';
import { createFlowers } from './flowers.js';
import { createSeeds } from './seeds.js';
import { createField } from './field.js';
import { createPost } from './post.js';

const DEFAULTS = { wind: 1, reach: 150, density: 1, cap: 60, petals: 'mixed' };
const ASSETS = `${import.meta.env.BASE_URL}assets/meadow/`;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function mount(root, options = {}) {
  let cfg = { ...DEFAULTS, ...options };
  const still = reducedMotion();           // one settled frame, redrawn on input
  const fine = finePointer();
  const low = quality() === 'low' || (quality() === 'auto' && !fine);
  root.classList.add('mdw');
  root.innerHTML = `
    <canvas class="mdw__canvas" aria-hidden="true"></canvas>
    <h1 class="mdw__title">Weather</h1>
    <button type="button" class="mdw__cue" data-sow>Sow a flower</button>
    <p class="mdw__note"><span>Fieldnote · issue cover</span><span>Issue 14</span></p>
    <p class="sr-only" role="status" data-status></p>`;
  const canvas = root.querySelector('canvas');
  const title = root.querySelector('.mdw__title');
  const status = root.querySelector('[data-status]');
  const off = [];
  const on = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); off.push(() => el.removeEventListener(type, fn, opt)); };
  const destroyDom = () => { root.classList.remove('mdw', 'is-live', 'is-static'); root.innerHTML = ''; };

  // Asked for here, not left to three, which logs an error when there is no WebGL2 to be had.
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) { root.classList.add('is-static'); return { update() {}, action() {}, destroy: destroyDom }; }
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // every shader here writes its own output
  renderer.debug.checkShaderErrors = import.meta.env.DEV;

  const camera = new THREE.PerspectiveCamera();
  const eyeY = ground(0, 0) + EYE;
  camera.position.set(0, eyeY, 0); camera.updateMatrixWorld();
  const world = new THREE.Scene(); const over = new THREE.Scene();
  const post = createPost(renderer, { low });
  const view = { W: 0, H: 0, tanH: 0.4, tanTop: 0.2, tanBot: 0.2, hz: 0.53, foot: 1.03, ratio: 1, planted: '', eyeY };
  let parts = null; let dead = false; let stop = null;
  let frameNo = 0; let wt = 0; let now = 0;           // frames drawn, the wind's clock, the hero's clock (s)
  let burst = null; let settled = false;
  const ptr = { x: null, y: 0, t: 0, v: 0 };          // v: horizontal speed in px per ms, eased
  const flowers = []; let planted = 0;

  // Where a point of the frame meets the field: the ray is cast to the height the next flower will stand at (lift),
  // so its head opens under the pointer and its root is the ground below. Above the horizon it is the field's far
  // edge; nothing lands nearer than the lens can hold.
  const groundAt = (px, py, lift = () => 0) => {
    const dx = (px / view.W * 2 - 1) * view.tanH; const dy = view.tanTop - (py / view.H) * (view.tanTop + view.tanBot);
    let t = FAR_EDGE; let prev = 0.4;
    for (let s = 0.6; s <= FAR_EDGE; s += 0.35) {
      if (eyeY + dy * s < ground(dx * s, -s) + lift(dx * s, -s)) { // crossed: refine
        let a = prev; let b = s;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (eyeY + dy * m < ground(dx * m, -m) + lift(dx * m, -m)) b = m; else a = m; }
        t = b; break;
      }
      prev = s;
    }
    t = clamp(t, clamp(0.62 / view.tanBot, 1.4, NEAR_PLANT), FAR_EDGE);   // a tall frame looks down at ground much nearer the lens
    return { x: dx * t, z: -t };
  };
  const depthY = (p) => (view.hz + (view.foot - view.hz) * p ** CURVE) * view.H;   // the original's depth → screen y

  const say = () => { status.textContent = `${flowers.filter((f) => !f.gone).length} flowers in the field.`; };
  const sync = () => { parts?.flowers.sync(flowers); settled = false; };
  const species = (n) => { const set = PETALS[cfg.petals] || PETALS.mixed; return set[n % set.length]; };
  // Past the cap the oldest goes: it wilts over FADE in the loop, or is simply gone when nothing moves.
  const trim = () => {
    for (let rest = flowers.filter((f) => !f.gone).sort((a, b) => a.born - b.born || a.n - b.n); rest.length > cfg.cap; rest.shift()) {
      if (still) flowers.splice(flowers.indexOf(rest[0]), 1); else rest[0].gone = now;
    }
  };
  // The next flower's height at a spot: a little taller than the leaves around it, so the head clears them.
  const tall = (x, z) => Math.min(0.95, sward(x, z) * 1.2 * (0.95 + rnd(planted * 7) * 0.45) + 0.14);
  const plant = (x, z, born) => {
    const h = tall(x, z);
    const n = planted++;
    flowers.push({ n, x, y: ground(x, z), z, h, ph: rnd(n * 7 + 1), species: species(n), size: 0.9 + 0.3 * rnd(n * 7 + 2), seed: rnd(n * 7 + 3), born, gone: 0 });
    trim(); say(); sync();
    if (still) redraw();
  };
  const plantAt = (px, py) => { if (!parts) return; const g = groundAt(px, py, tall); plant(g.x, g.z, still ? -1e3 : now); };
  const plantSeeded = () => plantAt((0.05 + 0.9 * rnd(planted * 13 + 5)) * view.W, depthY(0.14 + 0.78 * rnd(planted * 13 + 6)));
  const gust = () => {
    if (still || burst || !parts) return;
    // the front starts off the field's upwind corner and leaves by the downwind one
    burst = { x: -view.tanH * 34 * WIND.dir[0] - WIND.burst.width * 1.5, end: view.tanH * 34 * WIND.dir[0] - 34 * WIND.dir[1] + WIND.burst.width * 1.5 };
    settled = false;
  };

  const layout = () => {
    const r = root.getBoundingClientRect(); const W = Math.round(r.width); const H = Math.round(r.height);
    if (!W || !H || !parts) return;
    const aspect = W / H;
    let tanH = parts.letters.width / (aspect < 0.8 ? 0.86 : SHARE) / 2 / D; let tanV = tanH / aspect;
    if (CAP / D / (2 * tanV) > 0.3) { tanV = CAP / D / 0.6; tanH = tanV * aspect; }   // a wide, short frame: the word stops growing
    const hz = lerp(0.47, 0.53, smooth(0.6, 1.3, aspect));                            // eye level as a share of the height, from the top
    Object.assign(view, { W, H, tanH, tanTop: 2 * tanV * hz, tanBot: 2 * tanV * (1 - hz), hz, foot: (H + 24) / H });
    const n = 0.2;
    // A level camera with the frame shifted, as a view camera would: the letters' verticals stay vertical.
    camera.projectionMatrix.makePerspective(-tanH * n, tanH * n, view.tanTop * n, -view.tanBot * n, n, 400);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const pw = Math.max(2, Math.round(W * view.ratio)); const ph = Math.max(2, Math.round(H * view.ratio));
    renderer.setPixelRatio(1); renderer.setSize(pw, ph, false);
    // A tall frame is a crop of the same lens: its blur is larger against the frame's width.
    const crop = clamp(H / W, 1, 2.2);
    post.setSize(pw, ph, crop);
    shared.uPx.value = 2 * tanH / pw; shared.uFrame.value = 2 * tanH * crop; shared.uHz.value.set(hz, view.foot);
    // The DOM headline sits where the steel one stands, so the hand-over is a dissolve, not a jump.
    const fs = EM * W / (2 * tanH * D); const base = (hz - (parts.letters.baseY + 0.14 - eyeY) / D / (2 * tanV)) * H;
    title.style.setProperty('--title-size', `${fs.toFixed(1)}px`); title.style.setProperty('--title-top', `${(base + 0.0375 * fs - 0.8 * fs).toFixed(1)}px`);
    // Replant only when the frame takes in different ground.
    const near = clamp(EYE / view.tanBot * 0.6, 0.9, FORE - 0.8);
    const key = `${tanH.toFixed(2)}|${view.tanBot.toFixed(2)}|${cfg.density}`;
    if (key !== view.planted) { view.planted = key; parts.grass.build({ tanH, tanBot: view.tanBot, near, count: Math.round((low ? 34000 : 70000) * cfg.density), fore: Math.round((low ? 260 : 520) * cfg.density) }); }
    // The pointer's springs are laid out by the original's depth rows: where each row's ground is on screen, how tall its grass stands there.
    parts.field.layout(W, depthY, (p) => { const g = groundAt(W / 2, depthY(p)); return 0.5 * W / (2 * tanH * Math.max(1, -g.z)); });
    post.setFocusTop(1 - hz + 0.07);   // nothing nearer than about 12 m is in focus; its tops stay below this line of the frame
    settled = false;
    if (still || !stop) redraw();
  };

  const render = () => {
    if (!parts || dead) return;
    shared.uTime.value = wt; shared.uWind.value = still ? 0 : cfg.wind; parts.flowers.uNow.value = now;
    shared.uBurst.value.set(burst ? burst.x : -1e4, burst ? 1 : 0);
    post.render(world, over, camera, still ? 0 : frameNo++);
  };

  // Without a loop (reduced motion, or before it starts) changes ask for one frame; several in a row share it.
  let queued = 0;
  const redraw = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; render(); }); };

  const tick = (dt) => {
    gov.tick(dt);
    const f = Math.min(2, dt * 60);   // in 60 Hz frames, clamped so a stalled tab does not fling the grass
    now += dt; wt += dt * (0.55 + 0.45 * cfg.wind);
    if (burst) { burst.x += dt * WIND.burst.speed; if (burst.x > burst.end) burst = null; }
    const flying = parts.seeds.step(dt, wt, cfg.wind, burst, view);
    ptr.v *= 0.9 ** f;
    const sprung = parts.field.step(f, ptr, cfg.reach);
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

  // 1.5 is the ceiling: the scene is multisampled, and an integrated GPU cannot fill 2× of it at 60 Hz
  const gov = governor({ max: Math.min(devicePixelRatio || 1, 1.5), onChange: (ratio) => { view.ratio = ratio; layout(); } });

  const tex = (file, { srgb = false, repeat = false, aniso = 1 } = {}) => new THREE.TextureLoader().loadAsync(ASSETS + file).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    return t;
  });
  Promise.all([tex('sky.jpg', { aniso: 2 }), tex('env.jpg'), tex('plate.jpg', { srgb: true, repeat: true, aniso: 8 }), tex('plate-rough.jpg', { repeat: true, aniso: 4 }), tex('thatch.jpg', { srgb: true, repeat: true, aniso: 8 })]).then(([sky, env, plate, rough, thatch]) => {
    if (dead) { [sky, env, plate, rough, thatch].forEach((t) => t.dispose()); return; }
    env.wrapS = THREE.RepeatWrapping;
    const letters = createLetters(renderer, { env, plate, rough });
    parts = { letters, sky: createSky(sky), ground: createGround(thatch), grass: createGrass(), flowers: createFlowers(), seeds: createSeeds(), field: createField(), textures: [sky, env, plate, rough, thatch] };
    world.add(letters.mesh, parts.sky.mesh, parts.ground.mesh, ...parts.grass.meshes, ...parts.flowers.meshes, parts.seeds.mesh); over.add(parts.grass.fore);
    layout();
    // Seven flowers stand in the field on load, at the original's spots.
    for (const [u, p] of START) { const g = groundAt(u * view.W, depthY(p), tall); plant(g.x, g.z, -1e3); }
    if (!still && cfg.wind > 0) parts.seeds.prime(view);
    render();
    cancelAnimationFrame(queued); queued = 0;
    root.classList.add('is-live');
    if (!still) stop = loop(root, tick);
  }).catch((e) => { console.error(e); root.classList.add('is-static'); });

  const ro = new ResizeObserver(layout); ro.observe(root);
  off.push(() => ro.disconnect());

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

  return {
    update(next = {}) {
      const before = cfg; cfg = { ...cfg, ...next };
      cfg.wind = clamp(+cfg.wind, 0, 3); cfg.reach = clamp(+cfg.reach, 60, 280); cfg.density = clamp(+cfg.density, 0.5, 1.5); cfg.cap = clamp(Math.round(+cfg.cap), 12, 120);
      if (cfg.petals !== before.petals) for (const f of flowers) f.species = species(f.n);
      trim(); say(); sync();
      if (cfg.density !== before.density) layout(); else if (still) redraw();
    },
    action(id) {
      if (id === 'sow') plantSeeded();
      if (id === 'gust') gust();
    },
    destroy() {
      dead = true; stop?.(); cancelAnimationFrame(queued); off.forEach((f) => f());
      if (parts) { for (const k of ['letters', 'sky', 'ground', 'grass', 'flowers', 'seeds', 'field']) parts[k].dispose(); parts.textures.forEach((t) => t.dispose()); }
      post.dispose(); renderer.dispose(); destroyDom();
    },
  };
}
