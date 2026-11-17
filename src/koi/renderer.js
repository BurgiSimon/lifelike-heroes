// The frame, pass by pass: wind tile → wave simulation → slope map → caustics → shadow masks → koi layer →
// the composite through the water → floaters on top → bloom, tone curve and grade to the canvas.
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { fullscreenVert } from './glsl/common.js';
import { WAVES, DROPS, windFrag, simFrag, surfaceFrag, causticVert, causticFrag } from './glsl/water.js';
import { koiVert, koiFrag, koiMaskVert, koiMaskFrag } from './glsl/koi.js';
import { floatVert, floatFrag, floatMaskFrag } from './glsl/floaters.js';
import { compositeFrag, brightFrag, blurFrag, softFrag, postFrag } from './glsl/composite.js';
import { createFish } from './fish.js';
import { createFloaters } from './floaters.js';
import { paintSkins } from './skins.js';
import { WAVE } from './pond.js';

const ASSETS = '/assets/koi/';
const MARGIN = 44;       // px of simulated water beyond the frame, where waves are soaked up
const STEP = 1 / 60;     // the wave simulation's fixed step. ponytail: rings advance at 60 Hz on a 120/144 Hz screen; blend the last two states if that ever shows
const TILE = 320;        // px at scale 1 that one repeat of the scanned stones covers: cobbles a tenth of a koi long

export async function createRenderer(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  if (!gl.isContextLost() && !gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) { renderer.dispose(); throw new Error('koi: no float render targets'); }
  renderer.autoClear = false;
  renderer.setPixelRatio(1);

  const loader = new THREE.TextureLoader();
  const load = (file, srgb) => loader.loadAsync(ASSETS + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 2;
    renderer.initTexture(t); return t;
  });
  const [diff, nor, aux, sky] = await Promise.all([load('pebbles_diff.webp', true), load('pebbles_nor.webp'), load('pebbles_aux.webp'), load('canopy.webp')])
    .catch((err) => { renderer.dispose(); throw err; });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;

  const shared = { uRes: { value: new THREE.Vector2(1, 1) }, uS: { value: 1 }, uPx: { value: 1 }, uTime: { value: 0 } };
  const mat = (vertexShader, fragmentShader, uniforms = {}, extra = {}) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms: { ...shared, ...uniforms }, depthTest: false, depthWrite: false, side: THREE.DoubleSide, ...extra });
  const blend = (equation, src, dst) => ({ transparent: true, blending: THREE.CustomBlending, blendEquation: equation, blendSrc: src, blendDst: dst, blendEquationAlpha: equation, blendSrcAlpha: src, blendDstAlpha: dst });
  const OVER = blend(THREE.AddEquation, THREE.OneFactor, THREE.OneMinusSrcAlphaFactor); // premultiplied
  const ADD = blend(THREE.AddEquation, THREE.OneFactor, THREE.OneFactor);
  const MAX = blend(THREE.MaxEquation, THREE.OneFactor, THREE.OneFactor);                // overlapping shadows never double
  const target = (type = THREE.HalfFloatType, wrap = THREE.ClampToEdgeWrapping, format = THREE.RGBAFormat) => new THREE.WebGLRenderTarget(4, 4, { type, format, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: wrap, wrapT: wrap, depthBuffer: false, stencilBuffer: false });

  const rt = {
    wind: target(THREE.HalfFloatType, THREE.RepeatWrapping), simA: target(), simB: target(), surf: target(),
    caust: target(THREE.HalfFloatType, THREE.ClampToEdgeWrapping, THREE.RedFormat), caustTmp: target(THREE.HalfFloatType, THREE.ClampToEdgeWrapping, THREE.RedFormat), // light only: one channel
    mask: target(THREE.UnsignedByteType), shadowTmp: target(THREE.UnsignedByteType), shadow: target(THREE.UnsignedByteType), koi: target(), scene: target(), bloomA: target(), bloomB: target(),
  };
  rt.wind.setSize(low ? 256 : 512, low ? 256 : 512);
  // the finished caustics carry mips: the deep floor reads them blurred
  rt.caustTmp.texture.generateMipmaps = true; rt.caustTmp.texture.minFilter = THREE.LinearMipmapLinearFilter;
  // and the shadows: a floating thing's blurred shadow, less the sharp one, is where its meniscus throws a bright rim
  rt.shadow.texture.generateMipmaps = true; rt.shadow.texture.minFilter = THREE.LinearMipmapLinearFilter;
  // so do the slopes: the deep floor and the mirrored sky read a smoothed surface
  rt.surf.texture.generateMipmaps = true; rt.surf.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const textTex = new THREE.CanvasTexture(document.createElement('canvas'));
  textTex.minFilter = textTex.magFilter = THREE.LinearFilter; textTex.generateMipmaps = false;

  const skinTex = new THREE.CanvasTexture(document.createElement('canvas'));
  skinTex.colorSpace = THREE.SRGBColorSpace; skinTex.flipY = false; skinTex.minFilter = THREE.LinearMipmapLinearFilter;

  const cam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const pass = (material, to, clear) => {
    quad.material = material; renderer.setRenderTarget(to);
    if (clear) renderer.clear(true, false, false);
    renderer.render(quadScene, cam);
  };
  const draw = (scene, to, clear) => { renderer.setRenderTarget(to); if (clear) renderer.clear(true, false, false); renderer.render(scene, cam); };
  const sceneOf = (geo, material) => { const m = new THREE.Mesh(geo, material); m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return { scene: s, mesh: m }; };

  // ---- wind: a spectrum of small waves, mostly running one way, each at its own speed
  const waves = []; const phases = [];
  let slope = 0;
  for (let i = 0; i < WAVES; i++) {
    // 22 waves carry the swell; 8 short ones ride on it and draw the fine bright lines on the floor
    const short = i >= 22;
    const k = short ? 18 + Math.floor(rnd(i * 3 + 500) * 22) : 3 + Math.floor((rnd(i * 3 + 500) ** 1.25) * 13);
    const dir = 0.5 + (rnd(i * 3 + 501) - 0.5) * (short ? 3.4 : 4.2) + (i % 5 === 0 ? 3.1 : 0) + (i % 3 === 0 ? 1.6 : 0);   // crossing trains: the light on the floor is a net, not streaks
    const kx = Math.round(Math.cos(dir) * k) || 1; const ky = Math.round(Math.sin(dir) * k); const kk = Math.hypot(kx, ky);
    const amp = short ? 0.85 * (0.6 + 0.8 * rnd(i * 3 + 502)) / kk ** 1.6 : (0.6 + 0.8 * rnd(i * 3 + 502)) / kk ** 1.1;
    waves.push(new THREE.Vector4(kx, ky, amp, 0.62 * Math.sqrt(kk) * (short ? 1.6 : 1 + 0.04 * kk))); // the short ones held back a little, or the fine lines flicker
    phases.push(rnd(i + 600) * 6.283); if (!short) slope += (amp * kk) ** 2;
  }
  const norm = 1 / Math.sqrt(slope / 2) / 6.2831853; // unit rms gradient per unit of tile uv (of the swell)
  waves.forEach((w) => { w.z *= norm; });
  const mWind = mat(fullscreenVert, windFrag, { uWave: { value: waves }, uPhase: { value: phases } });

  // ---- wave simulation
  const drops = Array.from({ length: DROPS }, () => new THREE.Vector4());
  const mSim = mat(fullscreenVert, simFrag, { uPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uDomain: { value: new THREE.Vector2() }, uMargin: { value: MARGIN }, uStiff: { value: 0.1 }, uDamp: { value: 0.99 }, uDrop: { value: drops }, uDrops: { value: 0 } });
  const floaters = createFloaters(low ? { pollen: 26, petals: 5 } : {});
  const mSurf = mat(fullscreenVert, surfaceFrag, { uSim: { value: null }, uWind: { value: rt.wind.texture }, uSimTexel: mSim.uniforms.uTexel, uDomain: mSim.uniforms.uDomain, uMargin: mSim.uniforms.uMargin, uWindAmp: { value: 25 }, uPad: { value: floaters.pads }, uPads: { value: 0 } });

  // ---- caustics
  // The sheet is built once, in uv; only the size of its cells follows the box.
  const SHEET = low ? [200, 125] : [440, 275];
  const mCaust = mat(causticVert, causticFrag, { uSurf: { value: rt.surf.texture }, uFocus: { value: 1.55 }, uOver: { value: 36 }, uCell: { value: new THREE.Vector2(4, 4) } }, ADD);
  const caust = sceneOf(new THREE.PlaneGeometry(2, 2, SHEET[0], SHEET[1]), mCaust);
  caust.mesh.geometry.deleteAttribute('normal');

  // ---- koi
  const fish = createFish();
  const koiU = { uCaust: { value: rt.caustTmp.texture }, uShadow: { value: rt.shadow.texture }, uSkin: { value: skinTex } };
  const koi = sceneOf(fish.geo, mat(koiVert, koiFrag, koiU, OVER));
  const koiMask = sceneOf(fish.geo, mat(koiMaskVert, koiMaskFrag, {}, MAX));

  // ---- floaters
  const floatU = { uSurf: { value: rt.surf.texture }, uSky: { value: sky } };
  const floats = sceneOf(floaters.geo, mat(floatVert, floatFrag, floatU, OVER));
  const floatMask = sceneOf(floaters.geo, mat(floatVert, floatMaskFrag, floatU, MAX));

  // ---- composite and lens
  const mBlur = mat(fullscreenVert, blurFrag, { uTex: { value: null }, uStep: { value: new THREE.Vector2() } });
  const mSoft = mat(fullscreenVert, softFrag, { uTex: { value: rt.caust.texture }, uStep: { value: new THREE.Vector2() } });
  const mComp = mat(fullscreenVert, compositeFrag, { uSurf: { value: rt.surf.texture }, uCaust: { value: rt.caustTmp.texture }, uShadow: { value: rt.shadow.texture }, uKoi: { value: rt.koi.texture }, uText: { value: textTex }, uDiff: { value: diff }, uNor: { value: nor }, uAux: { value: aux }, uSky: { value: sky }, uTile: { value: 1000 }, uLod: { value: 0 } });
  const mBright = mat(fullscreenVert, brightFrag, { uScene: { value: rt.scene.texture }, uTexel: { value: new THREE.Vector2() } });
  const mPost = mat(fullscreenVert, postFrag(THREE.ShaderChunk.tonemapping_pars_fragment), { uScene: { value: rt.scene.texture }, uBloom: { value: rt.bloomA.texture }, uFrame: { value: 0 }, uBloomK: { value: low ? 0 : 0.5 }, toneMappingExposure: { value: 1.3 } });

  let W = 0; let H = 0; let S = 1; let ratio = 1; let simT = 0; let acc = 0; let frame = 0; let ripple = 260; let simW = 0; let simH = 0;
  const sources = []; // splashes still feeding the simulation: { x, y, t, kind }
  const clearSim = () => { for (const t of [rt.simA, rt.simB]) { renderer.setRenderTarget(t); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); } sources.length = 0; acc = 0; };

  const resize = () => {
    if (!W || !H) return;
    const dw = Math.max(2, Math.round(W * ratio)); const dh = Math.max(2, Math.round(H * ratio));
    renderer.setSize(dw, dh, false);
    shared.uRes.value.set(W, H); shared.uS.value = S; shared.uPx.value = dw / W;
    rt.koi.setSize(dw, dh); rt.scene.setSize(dw, dh);
    rt.bloomA.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4)); rt.bloomB.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4));
    mBright.uniforms.uTexel.value.set(1 / dw, 1 / dh);
    // slopes at half the CSS resolution; the light they focus at full, where its lines are a px or two wide
    const half = low ? 0.4 : 0.5; const cs = low ? 0.5 : Math.min(1, ratio, Math.sqrt(1.3e6 / (W * H)));   // a large box keeps the caustics at 1.3 megapixels
    rt.surf.setSize(Math.ceil(W * half), Math.ceil(H * half)); rt.caust.setSize(Math.ceil(W * cs), Math.ceil(H * cs)); rt.caustTmp.setSize(Math.ceil(W * cs), Math.ceil(H * cs));
    const sh = low ? 1 / 3 : 0.5;   // a leaf's shadow on the shallow floor is a crisp thing
    for (const t of [rt.mask, rt.shadowTmp, rt.shadow]) t.setSize(Math.ceil(W * sh), Math.ceil(H * sh));
    mComp.uniforms.uTile.value = TILE * S; mComp.uniforms.uLod.value = Math.log2(2048 / (TILE * S * (dw / W)));
  };
  // The simulation depends only on the box, not on the pixel ratio. A new grid starts as still water.
  const layout = () => {
    const cell = (low ? 4.5 : 4) * Math.max(1, Math.max(W, H) / 2000);
    const sw = Math.ceil((W + 2 * MARGIN) / cell); const sh = Math.ceil((H + 2 * MARGIN) / cell);
    if (sw !== simW || sh !== simH) { simW = sw; simH = sh; rt.simA.setSize(sw, sh); rt.simB.setSize(sw, sh); clearSim(); }
    mSim.uniforms.uTexel.value.set(1 / sw, 1 / sh); mSim.uniforms.uDomain.value.set(W + 2 * MARGIN, H + 2 * MARGIN);
    mSim.uniforms.uStiff.value = (WAVE * STEP / cell) ** 2;
    const over = mCaust.uniforms.uOver.value;
    mCaust.uniforms.uCell.value.set((W + 2 * over) / SHEET[0], (H + 2 * over) / SHEET[1]);
  };

  // One fixed step of the water. Splashes are short trains of pushes; a koi pushes a low bow wave ahead of
  // itself and leaves a dip behind, so a sprint draws a wake.
  let nd = 0;
  const add = (x, y, r, k) => { if (nd < DROPS) drops[nd++].set(x, y, r, k); };
  const stepSim = (st) => {
    simT += STEP; nd = 0;
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = sources[i]; const age = simT - s.t;
      if (s.kind === 'pellet') { if (age > 0.95) sources.splice(i, 1); else add(s.x, s.y, 10 * S, -4 * Math.cos(6.283 * 2.6 * age) * Math.exp(-age * 1.4) * Math.min(1, age * 30)); }
      else if (s.kind === 'gulp') { if (age > 0.3) sources.splice(i, 1); else add(s.x, s.y, 6.5 * S, -1.3 * Math.cos(6.283 * 5 * age)); }
      else { if (age > 0.14) sources.splice(i, 1); else add(s.x, s.y, 8 * S, 2.2 * Math.cos(6.283 * 3.5 * age)); }
    }
    if (st) for (const f of st.fish) {
      // a koi near the surface carries a low swell with it even at a cruise; in a sprint it draws a real wake
      const s = S * f.z; const k = Math.min(f.v / (24 * s), 6); const push = 0.05 * k * (1.15 - f.dive) + 0.03 * Math.max(k - 1.2, 0) ** 2 + f.gulp * 0.35 + f.scare * 0.8;   // and a startled koi kicks off with a boil
      if (push < 1e-4) continue;
      add(f.x, f.y, 8 * s, push); add(f.sp[4].x, f.sp[4].y, 9 * s, -push * 0.8);
    }
    mSim.uniforms.uDrops.value = nd;
    mSim.uniforms.uPrev.value = rt.simA.texture;
    pass(mSim, rt.simB);
    const t = rt.simA; rt.simA = rt.simB; rt.simB = t;
  };

  const render = (st, time) => {
    shared.uTime.value = time;
    fish.pose(st.fish, S);
    floaters.update(st, time);
    mSurf.uniforms.uPads.value = floaters.padCount;
    renderer.setClearColor(0x000000, 0);

    pass(mWind, rt.wind);
    mSurf.uniforms.uSim.value = rt.simA.texture;
    pass(mSurf, rt.surf);
    draw(caust.scene, rt.caust, true);
    mSoft.uniforms.uStep.value.set((low ? 0.9 : 0.7) / rt.caust.width, (low ? 0.9 : 0.7) / rt.caust.height);
    pass(mSoft, rt.caustTmp);   // the one render into the target that carries mips

    draw(koiMask.scene, rt.mask, true);
    draw(floatMask.scene, rt.mask, false);
    mBlur.uniforms.uTex.value = rt.mask.texture; mBlur.uniforms.uStep.value.set(0.5 / rt.mask.width, 0); pass(mBlur, rt.shadowTmp);
    mBlur.uniforms.uTex.value = rt.shadowTmp.texture; mBlur.uniforms.uStep.value.set(0, 0.5 / rt.mask.height); pass(mBlur, rt.shadow);   // the one render into the target that carries mips

    draw(koi.scene, rt.koi, true);
    pass(mComp, rt.scene);
    draw(floats.scene, rt.scene, false);

    if (!low) {
      pass(mBright, rt.bloomA);
      mBlur.uniforms.uTex.value = rt.bloomA.texture; mBlur.uniforms.uStep.value.set(1 / rt.bloomA.width, 0); pass(mBlur, rt.bloomB);
      mBlur.uniforms.uTex.value = rt.bloomB.texture; mBlur.uniforms.uStep.value.set(0, 1 / rt.bloomA.height); pass(mBlur, rt.bloomA);
    }
    mPost.uniforms.uFrame.value = frame++ % 240;
    pass(mPost, null);
  };

  return {
    setSize(w, h, s) { const moved = w !== W || h !== H; W = w; H = h; S = s; resize(); if (moved) layout(); },
    setRatio(r) { if (r !== ratio) { ratio = r; resize(); } },
    setRipple(px) { ripple = px; mSim.uniforms.uDamp.value = Math.exp(-STEP / (ripple / WAVE / 1.6)); },   // a ring is still there to see as it reaches the ripple option's distance
    stock(list) { fish.stock(list); paintSkins(skinTex.image, list); skinTex.needsUpdate = true; },
    text(root, drawTextMask) { drawTextMask(textTex.image, root); textTex.needsUpdate = true; },
    splash(x, y, kind) { sources.push({ x, y, kind, t: simT }); },
    // Advance the water by dt in fixed steps (a long frame catches up at most three), then draw.
    frame(st, dt, time) {
      acc = Math.min(acc + dt, STEP * 3);
      while (acc >= STEP) { stepSim(st); acc -= STEP; }
      render(st, time);
    },
    // No loop: still water, or water that has been running for a while after the splashes given.
    still(st, time, splashes = [], seconds = 0) {
      clearSim();
      for (const s of splashes) sources.push({ ...s, t: simT });
      for (let i = 0; i < seconds / STEP; i++) stepSim(null);
      render(st, time);
    },
    // resources: false when what this renderer held died with a lost context; context: false when the canvas's
    // context lives on for the next renderer.
    destroy({ context = true, resources = true } = {}) {
      if (resources) {
        for (const t of Object.values(rt)) t.dispose();
        for (const t of [diff, nor, aux, sky, textTex, skinTex]) t.dispose();
        for (const m of [mWind, mSim, mSurf, mCaust, mBlur, mSoft, mComp, mBright, mPost, koi.mesh.material, koiMask.mesh.material, floats.mesh.material, floatMask.mesh.material]) m.dispose();
        fish.geo.dispose(); floaters.geo.dispose(); caust.mesh.geometry.dispose(); quad.geometry.dispose();
      }
      renderer.dispose();
      if (context) renderer.forceContextLoss();
    },
  };
}
