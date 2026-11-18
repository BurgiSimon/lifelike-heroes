// The WebGL side. The frame, pass by pass: the mist's field (half size, kept from frame to frame) → the drops as
// a height map (instanced caps, MAX-blended) → the photograph (city, rain, mist, the near drops) in linear light
// into a half-float target → a restrained bloom → the lens and the film. The city itself is decoded once into two
// mipped targets. Nothing here knows about the DOM.
import {
  WebGLRenderer, WebGLRenderTarget, HalfFloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping,
  SRGBColorSpace, NoColorSpace, TextureLoader, RawShaderMaterial, GLSL3, BufferGeometry, BufferAttribute, InstancedBufferGeometry,
  InstancedBufferAttribute, DynamicDrawUsage, Mesh, Camera, DataTexture, CanvasTexture, RedFormat, NoBlending, CustomBlending, MaxEquation,
  OneFactor, DoubleSide, ShaderChunk, Vector2, Vector3, Vector4,
} from 'three';
import { CAPS, fullscreenVert, lensFrag, wideFrag, mistFrag, dropVert, dropFrag, sceneFrag, brightFrag, blurFrag, filmFrag } from './shaders.js';
import { MAX } from './pane.js';
import { TX, VFOV, VTALL } from './optics.js';

const ASSETS = '/assets/mist/';
const EXPOSURE = 0.3;    // the photographer's exposure for the city: the sky stays night, the lamps still burn out
const MIST = 2;          // CSS px per texel of the mist's field: its edges are soft things
const BACK = 1 / 60;     // share of the mist that comes back per second: a wiped patch has closed in about a minute

export async function createRenderer(canvas, { low = false } = {}) {
  // The city is loaded before there is a context to leak if a file fails.
  const loader = new TextureLoader();
  const load = (file, srgb) => loader.loadAsync(ASSETS + file).then((t) => {
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.minFilter = LinearFilter; t.generateMipmaps = false;
    return t;
  });
  const maps = await Promise.all([load('city_base.webp', true), load('city_glow.webp'), load('city_wide.webp')]);

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  // Scene light is unclamped (a lamp's disc is several times paper white) and the mist creeps back by less than an
  // 8-bit step a frame: both need float targets.
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    renderer.dispose(); for (const t of maps) t.dispose();
    throw new Error('no float render targets');
  }
  const target = (mips = false) => {
    const t = new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthBuffer: false, minFilter: mips ? LinearMipmapLinearFilter : LinearFilter, magFilter: LinearFilter, generateMipmaps: mips });
    return t;
  };
  const lens = target(true); const wide = target(true); const water = target(); let mistA = target(); let mistB = target();
  const scene = target(); const bloomA = target(); const bloomB = target();
  lens.setSize(maps[0].image.width, maps[0].image.height); wide.setSize(maps[2].image.width, maps[2].image.height);

  // The headline, drawn by letters.js from the DOM's own layout.
  const textTex = new CanvasTexture(document.createElement('canvas'));
  textTex.minFilter = textTex.magFilter = LinearFilter; textTex.generateMipmaps = false;
  // Where someone breathed on the glass to write: a small feathered field round the headline's lines, rebuilt on layout.
  const maskTex = new DataTexture(new Uint8Array(4).fill(255), 2, 2, RedFormat, UnsignedByteType);
  maskTex.minFilter = maskTex.magFilter = LinearFilter; maskTex.unpackAlignment = 1; maskTex.needsUpdate = true;

  // One set of uniform objects per mounted hero, shared by reference between its passes.
  const u = {
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 }, uFrame: { value: 0 },
    uBase: { value: maps[0] }, uGlow: { value: maps[1] }, uExposure: { value: EXPOSURE },
    uPrev: { value: null }, uDt: { value: 0 }, uBack: { value: BACK }, uCaps: { value: 0 },
    uCap: { value: Array.from({ length: CAPS }, () => new Vector4()) }, uCapK: { value: Array.from({ length: CAPS }, () => new Vector4()) },
    uWater: { value: water.texture }, uMist: { value: null }, uText: { value: textTex }, uMask: { value: maskTex }, uMaskMap: { value: new Vector4(1, 1, 0, 0) },
    uLens: { value: lens.texture }, uWide: { value: wide.texture }, uTexel: { value: new Vector2() }, uCam: { value: new Vector3() }, uLodLens: { value: 1 },
    uThick: { value: 1 }, uLetters: { value: 1 },
    uScene: { value: scene.texture }, uBloom: { value: bloomA.texture }, uTex: { value: null }, uStep: { value: new Vector2() },
    uBloomK: { value: low ? 0 : 0.35 }, toneMappingExposure: { value: 1 },
  };
  const material = (fragmentShader, extra) => new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: fullscreenVert, fragmentShader, depthTest: false, depthWrite: false, blending: NoBlending, ...extra });
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new Camera();
  const pass = (frag) => { const m = new Mesh(tri, material(frag)); m.frustumCulled = false; return m; };
  const passes = { lens: pass(lensFrag), wide: pass(wideFrag), mist: pass(mistFrag), scene: pass(sceneFrag), bright: pass(brightFrag), blur: pass(blurFrag), film: pass(filmFrag(ShaderChunk.tonemapping_pars_fragment)) };
  const run = (mesh, to) => { renderer.setRenderTarget(to); renderer.render(mesh, camera); };

  // The drops: one quad each, its place and size from pane.js every frame.
  const quads = new InstancedBufferGeometry();
  quads.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); quads.setIndex([0, 1, 2, 0, 2, 3]);
  const aDrop = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4); aDrop.setUsage(DynamicDrawUsage);
  const aKind = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4); aKind.setUsage(DynamicDrawUsage);
  quads.setAttribute('aDrop', aDrop); quads.setAttribute('aKind', aKind); quads.instanceCount = 0;
  const drops = new Mesh(quads, new RawShaderMaterial({
    glslVersion: GLSL3, uniforms: u, vertexShader: dropVert, fragmentShader: dropFrag, depthTest: false, depthWrite: false, side: DoubleSide,   // y runs down here, which turns the quads over
    transparent: true, blending: CustomBlending, blendEquation: MaxEquation, blendSrc: OneFactor, blendDst: OneFactor, blendEquationAlpha: MaxEquation, blendSrcAlpha: OneFactor, blendDstAlpha: OneFactor,
  }));
  drops.frustumCulled = false;

  let W = 0; let H = 0; let S = 1; let frames = 0; let baked = false; let misted = false; let old = [];
  const clear = (t, r, g, b) => { renderer.setRenderTarget(t); renderer.setClearColor((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255), 1); renderer.clear(true, false, false); };

  // Strokes wiped out of the mist, CAPS at a time; dt goes with the first pass only.
  const wipe = (strokes, dt) => {
    let i = 0;
    do {
      let n = 0;
      for (; n < CAPS && i < strokes.length; n++, i++) { const s = strokes[i]; u.uCap.value[n].set(s.ax, s.ay, s.bx, s.by); u.uCapK.value[n].set(s.r, s.v, s.k, 0); }
      u.uCaps.value = n; u.uDt.value = dt; dt = 0; u.uPrev.value = mistA.texture;
      run(passes.mist, mistB);
      const t = mistA; mistA = mistB; mistB = t;
    } while (i < strokes.length);
    u.uMist.value = mistA.texture;
  };
  // The mist as the scene opens: whole, but for the tracks of the drops that ran down it before anyone was looking.
  const fresh = () => { clear(mistA, 1, 0, 0); wipe(old, 0); misted = true; };

  return {
    resize(w, h, ratio) {
      const moved = w !== W || h !== H;
      W = w; H = h; S = h / 900;
      const dw = Math.max(2, Math.round(w * ratio)); const dh = Math.max(2, Math.round(h * ratio));
      renderer.setPixelRatio(1); renderer.setSize(dw, dh, false);
      scene.setSize(dw, dh); water.setSize(dw, dh); bloomA.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4)); bloomB.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4));
      u.uRes.value.set(w, h); u.uPx.value = dw / w; u.uTexel.value.set(1 / dw, 1 / dh);
      // The camera: a 50 mm lens, the film's long side along the frame's. Its axis meets the frame a little above
      // the middle on a wide screen, so the skyline sits high and the headline has the dark quay to itself.
      // An upright phone sees a narrow slice: it is aimed left, at the tallest lights.
      const tall = h > w; const focal = h / (2 * (tall ? VTALL : VFOV)) * Math.max(1, w / h / (TX / VFOV) * 1.02);   // wider than the bake: move in until it covers
      u.uCam.value.set(w * 0.5 + (tall ? 0.1 * focal : 0), h * 0.4, focal);
      u.uLodLens.value = lens.width / (2 * TX * focal);
      if (moved) { mistA.setSize(Math.ceil(w / MIST), Math.ceil(h / MIST)); mistB.setSize(Math.ceil(w / MIST), Math.ceil(h / MIST)); misted = false; }
    },
    // rects: the headline's lines in CSS px. The mist lies thicker round them, with a wide feather.
    mask(rects) {
      const s = 8; const w = Math.ceil(W / s) + 1; const h = Math.ceil(H / s) + 1; const data = new Uint8Array(w * h).fill(255);
      if (rects.length) for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          let sd = 1e9; const x = i * s; const y = j * s;
          for (const r of rects) {   // signed distance to the nearest line of type
            const dx = Math.max(r.l - x, x - r.r); const dy = Math.max(r.t - y, y - r.b);
            sd = Math.min(sd, Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0));
          }
          const t = Math.min(1, Math.max(0, (sd + 10) / (110 * S)));
          data[j * w + i] = Math.round(255 * t * t * (3 - 2 * t));
        }
      }
      maskTex.dispose();   // its size changed: the GPU copy is immutable
      maskTex.image = { data, width: w, height: h }; maskTex.needsUpdate = true;
      u.uMaskMap.value.set(1 / (s * w), 1 / (s * h), 0.5 / w, 0.5 / h);   // CSS px → the field's texel centres
    },
    // The headline's canvas (letters.js draws into it); on: whether it is written on the glass at all.
    text(draw, on) { const out = draw(textTex.image); textTex.needsUpdate = true; u.uLetters.value = on ? 1 : 0; return out; },
    // The tracks already in the mist when the scene opens: strokes as wipe() takes them. The mist is laid again.
    history(strokes) { old = strokes; misted = false; },
    // After a lost context: everything that was rendered once has to be rendered again.
    restore() { baked = false; misted = false; },
    // st: the pane (pane.js). strokes: what was wiped since the last frame. dt: s of the mist's own time.
    frame(view, cfg, st, strokes, dt) {
      if (!baked) { u.uTex.value = maps[2]; run(passes.lens, lens); run(passes.wide, wide); baked = true; }
      if (!misted) fresh();
      if (dt > 0 || strokes.length) wipe(strokes, dt);
      u.uThick.value = cfg.mist;

      let n = 0; const a = aDrop.array; const k = aKind.array;
      for (const d of st.drops) {
        if (n >= MAX) break;
        // a rain drop does not arrive at its full size: it spreads on the glass in the first tenth of a second
        const spread = d.side ? 1 : Math.min(1, 0.45 + (st.t - d.born) / 0.12);
        a[n * 4] = d.x; a[n * 4 + 1] = d.y; a[n * 4 + 2] = d.r * spread; a[n * 4 + 3] = d.tail;
        k[n * 4] = d.seed; k[n * 4 + 1] = d.side; k[n * 4 + 2] = Math.min(1, d.r / (8 * S)) * (d.run ? 0.5 : 1); k[n * 4 + 3] = 0;   // a bead is round; a big drop is not, until it runs
        n++;
      }
      quads.instanceCount = n; aDrop.needsUpdate = true; aKind.needsUpdate = true;
      clear(water, 0, 0, 0);
      if (n) run(drops, water);

      run(passes.scene, scene);
      if (!low) {
        u.uTex.value = scene.texture; run(passes.bright, bloomA);
        u.uTex.value = bloomA.texture; u.uStep.value.set(1 / bloomA.width, 0); run(passes.blur, bloomB);
        u.uTex.value = bloomB.texture; u.uStep.value.set(0, 1 / bloomA.height); run(passes.blur, bloomA);
      }
      // The grain moves with the frames that are drawn; a still (frame 0, every time) keeps its grain where it is.
      u.uFrame.value = view.still ? 0 : frames++ % 240;
      run(passes.film, null);
    },
    dispose() {
      for (const t of [lens, wide, water, mistA, mistB, scene, bloomA, bloomB, maskTex, textTex, ...maps]) t.dispose();
      for (const m of Object.values(passes)) m.material.dispose();
      drops.material.dispose(); quads.dispose(); tri.dispose();
      renderer.forceContextLoss();   // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
}
