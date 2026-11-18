// The frame, pass by pass: the drops as a height field → the glass's state (fog, mist, film), one step on →
// the picture through both, with the camera's vignette, curve and grain, to the canvas.
import * as THREE from 'three';
import { fullscreenVert, dropVert, dropFrag, simFrag, compositeFrag, LAMPS } from './glsl.js';
import { STRIDE, CAPACITY } from './drops.js';
import { mistTile, MIST } from './mist.js';

const ASSETS = '/assets/rain/';
const PICTURE = 2048 / 1400;   // bokeh.webp, haze.webp
const GLASS = 0.5;             // the glass's state, in texels per CSS px: fog has no fine detail of its own
const GROW = 0.1;              // s between the steps in which fog and mist return: slower than a half float can count per frame

export async function createRenderer(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  if (!gl.isContextLost() && !gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) { renderer.dispose(); throw new Error('rain: no float render targets'); }
  renderer.autoClear = false;
  renderer.setPixelRatio(1);

  const loader = new THREE.TextureLoader();
  const load = (file) => loader.loadAsync(ASSETS + file).then((t) => { t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; });
  const [bokeh, haze, atlas] = await Promise.all([load('bokeh.webp'), load('haze.webp'), load('lens.webp')]).catch((err) => { renderer.dispose(); throw err; });
  // lens.webp is an atlas of the drop's picture and every smaller level of it, each averaged from the light itself
  // (see tools/build-assets.mjs): cut apart here into one texture with its own mip chain.
  const cut = document.createElement('canvas'); cut.width = atlas.image.width; cut.height = atlas.image.height;
  const g = cut.getContext('2d', { willReadFrequently: true }); g.drawImage(atlas.image, 0, 0);
  const L = atlas.image.height; const levels = [];
  for (let n = 0, w = L, top = 0; w >= 1; n++, w >>= 1) {
    const px = g.getImageData(n ? L : 0, n ? top : 0, w, w); levels.push({ data: new Uint8Array(px.data.buffer), width: w, height: w });
    if (n) top += w;
  }
  atlas.dispose();
  const lens = new THREE.DataTexture(levels[0].data, L, L, THREE.RGBAFormat, THREE.UnsignedByteType);
  lens.mipmaps = levels; lens.generateMipmaps = false; lens.minFilter = THREE.LinearMipmapLinearFilter; lens.magFilter = THREE.LinearFilter; lens.needsUpdate = true;
  const mist = new THREE.DataTexture(mistTile(), MIST.size, MIST.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  mist.wrapS = mist.wrapT = THREE.RepeatWrapping; mist.minFilter = mist.magFilter = THREE.LinearFilter; mist.needsUpdate = true;
  for (const t of [bokeh, haze, lens, mist]) renderer.initTexture(t);

  const target = (filter = THREE.LinearFilter) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false });
  const rt = { drops: target(THREE.NearestFilter), a: target(), b: target() };

  const shared = { uRes: { value: new THREE.Vector2(1, 1) }, uRatio: { value: 1 } };
  const mat = (vertexShader, fragmentShader, uniforms = {}, extra = {}) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms: { ...shared, ...uniforms }, depthTest: false, depthWrite: false, side: THREE.DoubleSide, ...extra });
  const HIGHEST = { transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };

  const cam = new THREE.Camera();
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const full = new THREE.Mesh(tri); full.frustumCulled = false;
  const pass = (material, to) => { full.material = material; renderer.setRenderTarget(to); renderer.render(full, cam); };

  // ---- drops: one quad, drawn once per drop
  const dropGeo = new THREE.InstancedBufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  const dropBuf = new THREE.InstancedInterleavedBuffer(new Float32Array(CAPACITY * STRIDE), STRIDE); dropBuf.setUsage(THREE.DynamicDrawUsage);
  dropGeo.setAttribute('aDrop', new THREE.InterleavedBufferAttribute(dropBuf, 4, 0));
  dropGeo.setAttribute('aShape', new THREE.InterleavedBufferAttribute(dropBuf, 2, 4));
  const mDrop = mat(dropVert, dropFrag, {}, HIGHEST);
  const dropMesh = new THREE.Mesh(dropGeo, mDrop); dropMesh.frustumCulled = false;
  const drawDrops = (data, count) => {
    dropBuf.array.set(count * STRIDE < data.length ? data.subarray(0, count * STRIDE) : data);
    dropBuf.clearUpdateRanges(); dropBuf.addUpdateRange(0, count * STRIDE); dropBuf.needsUpdate = true;
    dropGeo.instanceCount = count;
    renderer.setRenderTarget(rt.drops); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
    if (count) renderer.render(dropMesh, cam);
  };

  // ---- the glass
  const mSim = mat(fullscreenVert, simFrag, {
    uPrev: { value: null }, uDrops: { value: rt.drops.texture }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) },
    uGrow: { value: 0 }, uFogRate: { value: 1 / 14 }, uMistRate: { value: 1 / 26 }, uDt: { value: 0 }, uReach: { value: 60 }, uWipe: { value: 0 }, uReset: { value: 0 }, uBreath: { value: 0 }, uSeed: { value: 0 }, uAlong: { value: 0 }, uStamp: { value: 0 },
  });
  const mComp = mat(fullscreenVert, compositeFrag, {
    uBokeh: { value: bokeh }, uHaze: { value: haze }, uLens: { value: lens }, uMist: { value: mist }, uState: { value: null }, uDrops: { value: rt.drops.texture },
    uCover: { value: new THREE.Vector4(1, 1, 0, 0) }, uShift: { value: new THREE.Vector2() }, uSeed: { value: 0 }, uFog: { value: 0.9 }, uGrain: { value: 0.03 }, uExposure: { value: 0.62 },
    uLamp: { value: Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -9, 0, 1)) }, uLampCol: { value: Array.from({ length: LAMPS }, () => new THREE.Vector3()) },
  });

  // ---- the river behind the glass: two boats cross it, one each way, as rows of lamps. Where a boat is in the
  // picture (x: 0 left edge to 1 right edge) depends only on the time, so a still has them too.
  const BOATS = [
    { y: 0.468, every: 96, from: 1.12, to: -0.14, at: 31, lamps: [[0, 0, 0.5, [1, 0.74, 0.46]], [0.021, 0.004, 0.36, [1, 0.8, 0.55]], [0.043, 0.001, 0.3, [1, 0.72, 0.42]], [-0.016, 0.012, 0.42, [0.2, 1, 0.45]]] },   // a ferry, its cabin lit, a green lamp to starboard
    { y: 0.452, every: 141, from: -0.12, to: 1.14, at: 104, lamps: [[0, 0.016, 0.5, [1, 0.95, 0.86]], [-0.03, 0, 0.36, [1, 0.12, 0.08]], [-0.052, 0.003, 0.22, [1, 0.7, 0.4]], [0.018, 0.002, 0.26, [0.75, 0.86, 1]]] },   // a barge: its masthead light, a red lamp to port
  ];
  const river = (time) => {
    let n = 0;
    for (const b of BOATS) {
      const t = ((time + b.at) % b.every) / b.every; const x = b.from + (b.to - b.from) * t;
      for (const [dx, dy, gain, col] of b.lamps) { mComp.uniforms.uLamp.value[n].set(x + dx, b.y + dy, gain, 0.92); mComp.uniforms.uLampCol.value[n].set(...col); n++; }
    }
  };

  let W = 0; let H = 0; let ratio = 1; let grow = 0; let fresh = true; let frame = 0; let breath = 0;
  const strokes = [];   // what the pointer wiped since the last step: [ax, ay, bx, by]
  const resize = () => {
    if (!W || !H) return;
    const dw = Math.max(2, Math.round(W * ratio)); const dh = Math.max(2, Math.round(H * ratio));
    renderer.setSize(dw, dh, false);
    shared.uRes.value.set(W, H); shared.uRatio.value = dw / W;
    rt.drops.setSize(dw, dh);
    // the picture covers the pane, with a little to spare
    const pane = W / H; const zoom = 0.96;
    mComp.uniforms.uCover.value.set(zoom * Math.min(1, pane / PICTURE), zoom * Math.min(1, PICTURE / pane), 0, pane < 1 ? 0.02 : 0);
  };
  // The glass depends only on the box. The first one starts misted over; a box that changes keeps its glass,
  // stretched to the new one (a step of no time, read from the old state).
  const layout = () => {
    const sw = Math.max(2, Math.round(W * GLASS)); const sh = Math.max(2, Math.round(H * GLASS));
    if (rt.a.width === sw && rt.a.height === sh) return;
    if (fresh) { rt.a.setSize(sw, sh); rt.b.setSize(sw, sh); return; }
    const old = rt.a; rt.a = rt.b; rt.b = target(); rt.b.setSize(sw, sh); rt.a.setSize(sw, sh);
    drawDrops(dropBuf.array, 0);
    const u = mSim.uniforms; u.uGrow.value = u.uDt.value = u.uReset.value = u.uBreath.value = u.uWipe.value = 0; u.uPrev.value = old.texture;
    pass(mSim, rt.a); old.dispose();
  };
  // One step of the glass: what came back, what the drops swept, one stroke of the pointer.
  const glass = (dt, stroke, breath = 0) => {
    const u = mSim.uniforms;
    grow += dt; u.uGrow.value = 0; if (grow >= GROW) { u.uGrow.value = grow; grow = 0; }
    u.uDt.value = dt; u.uReset.value = fresh ? 1 : 0; u.uBreath.value = breath; fresh = false;
    u.uWipe.value = stroke ? 1 : 0;
    if (stroke) {
      u.uA.value.set(stroke[0], stroke[1]); u.uB.value.set(stroke[2], stroke[3]);
      const dx = stroke[2] - stroke[0]; const dy = stroke[3] - stroke[1]; const len = Math.hypot(dx, dy);
      if (len > 0.5) u.uDir.value.set(dx / len, dy / len);   // a stroke that stands still keeps the last one's grain
      u.uSeed.value = stroke[4] * 100; u.uReach.value = stroke[5]; u.uAlong.value = stroke[6] || 0;
    }
    u.uPrev.value = rt.a.texture;
    pass(mSim, rt.b);
    const t = rt.a; rt.a = rt.b; rt.b = t;
  };
  const picture = (time) => {
    river(time);
    mComp.uniforms.uState.value = rt.a.texture;
    pass(mComp, null);
  };

  return {
    setSize(w, h) { const moved = w !== W || h !== H; W = w; H = h; resize(); if (moved) layout(); },
    setRatio(r) { if (r !== ratio) { ratio = r; resize(); } },
    // fog: how thick the condensation stands (0 to 1); refog: seconds for wiped glass to mist over again
    setOptions({ fog, refog }) { mComp.uniforms.uFog.value = fog; mSim.uniforms.uFogRate.value = 1 / refog; mSim.uniforms.uMistRate.value = 1 / (refog * 2); },
    // the pointer went from (ax, ay) to (bx, by) with its hand on the glass; seed: which stroke this is
    // reach: the half-width of the wiped band, px; along: how far this stroke had come before this piece of it
    wipe(ax, ay, bx, by, seed, reach, along = 0) { strokes.push([ax, ay, bx, by, seed, reach, along]); if (strokes.length > 24) strokes.shift(); },
    // breathed on: misted over at once (the drops clear their own places again in the same step)
    breathe() { strokes.length = 0; breath = 1; },
    // The trails the pane opens with (or a drop that was run to its end at once): stamps, see drops.js.
    stamp(stamps) { mSim.uniforms.uStamp.value = 1; drawDrops(stamps, stamps.length / STRIDE); glass(0, null); mSim.uniforms.uStamp.value = 0; },
    // The view behind the glass moves a little against it as the head (the pointer) does: (x, y) in -1..1.
    look(x, y) { mComp.uniforms.uShift.value.set(-x * 0.008, y * 0.006); },
    frame(rain, dt, time) {
      drawDrops(rain.buf, rain.count);
      // every stroke since the last frame; a quiet frame is one step with none
      glass(dt, breath ? null : strokes.shift() || null, breath); breath = 0;
      while (strokes.length) glass(0, strokes.shift());
      mComp.uniforms.uGrain.value = low ? 0.022 : 0.03;
      frame = (frame + 1) % 240; mComp.uniforms.uSeed.value = frame;
      picture(time);
    },
    warm() { renderer.compile(dropMesh, cam); for (const m of [mSim, mComp]) { full.material = m; renderer.compile(full, cam); } },
    // resources: false when what this renderer held died with a lost context; context: false when the canvas's
    // context lives on for the next renderer.
    destroy({ context = true, resources = true } = {}) {
      if (resources) {
        for (const t of Object.values(rt)) t.dispose();
        for (const t of [bokeh, haze, lens, mist]) t.dispose();
        for (const m of [mDrop, mSim, mComp]) m.dispose();
        tri.dispose(); dropGeo.dispose();
      }
      renderer.dispose();
      if (context) renderer.forceContextLoss();
    },
  };
}
