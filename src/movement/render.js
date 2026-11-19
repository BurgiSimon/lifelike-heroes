// The WebGL side. The movement is drawn part by part from the mainplate up into a half-float target (linear light,
// with each pixel's height beside it), then the lens blurs what is off its plane of focus, a restrained bloom
// takes what really is bright, and one pass is the film (shaders.js). Nothing here knows about the DOM.
import {
  WebGLRenderer, WebGLRenderTarget, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, RawShaderMaterial, GLSL3,
  BufferGeometry, BufferAttribute, InstancedBufferGeometry, InstancedBufferAttribute, Mesh, Scene, Camera, DataTexture, RGBAFormat, NoBlending, NormalBlending, ShaderChunk,
  Vector2, Vector3, Vector4, Matrix3, DataUtils, RedFormat, UnsignedByteType,
} from 'three';
import { ENV, KEY } from './optics.js';
import { PRIMS, Z, BALANCE } from './caliber.js';
import {
  fullscreenVert, partVert, spriteVert, bakeFrag, floorFrag, plateFrag, wheelFrag, escapeFrag, forkFrag, balanceFrag, springFrag, windFrag, clickFrag,
  screwFrag, jewelFrag, lensFrag, brightFrag, blurFrag, filmFrag,
} from './shaders.js';

const ASSETS = '/assets/movement/';
const CAM = 260;      // mm from the plane of focus to the lens: a 100 mm macro at this magnification
const MARGIN = 3;     // mm the plates' field reaches past the frame: a tilt and a shadow both look a little outside it
const SPRITES = 48;   // most screws, or jewels, one batch holds

// The studio (optics.js says how the file is laid out): decoded here into half floats, one array per width of blur,
// rows turned over so that v runs up the picture as y does.
async function studio() {
  const res = await fetch(ASSETS + 'studio.webp'); if (!res.ok) throw new Error(`studio.webp answered ${res.status}`);
  const blob = await res.blob();
  // as the file has it: no colour management between its bytes and the numbers they stand for (a browser that does
  // not take the options decodes an untagged picture the same way)
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }).catch(() => createImageBitmap(blob));
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); bmp.close();
  const px = g.getImageData(0, 0, cv.width, cv.height).data; const AH = cv.height / 2;
  const sq = Float32Array.from({ length: 256 }, (_, i) => (i / 255) ** 2); const m4 = Float32Array.from({ length: 256 }, (_, i) => ENV.max * (i / 255) ** 4);
  const levels = []; let x0 = 0; let last = null;
  for (let k = 0; k < ENV.levels; k++) {
    const s = ENV.size >> k; const lin = new Float32Array(s * s * 3);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const a = (j * cv.width + x0 + i) * 4; const m = m4[px[((AH + j) * cv.width + x0 + i) * 4]]; const o = ((s - 1 - j) * s + i) * 3;
      lin[o] = m * sq[px[a]]; lin[o + 1] = m * sq[px[a + 1]]; lin[o + 2] = m * sq[px[a + 2]];
    }
    levels.push({ s, lin }); last = { s, lin }; x0 += s;
  }
  while (last.s > 1) {   // the rest of the way to one texel by halving: a texture's mips must run out
    const s = last.s >> 1; const lin = new Float32Array(s * s * 3);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) for (let c = 0; c < 3; c++) lin[(j * s + i) * 3 + c] = 0.25 * (last.lin[(2 * j * last.s + 2 * i) * 3 + c] + last.lin[(2 * j * last.s + 2 * i + 1) * 3 + c] + last.lin[((2 * j + 1) * last.s + 2 * i) * 3 + c] + last.lin[((2 * j + 1) * last.s + 2 * i + 1) * 3 + c]);
    last = { s, lin }; levels.push(last);
  }
  const one = DataUtils.toHalfFloat(1);
  return levels.map(({ s, lin }) => {
    const data = new Uint16Array(s * s * 4);
    for (let i = 0; i < s * s; i++) { data[i * 4] = DataUtils.toHalfFloat(lin[i * 3]); data[i * 4 + 1] = DataUtils.toHalfFloat(lin[i * 3 + 1]); data[i * 4 + 2] = DataUtils.toHalfFloat(lin[i * 3 + 2]); data[i * 4 + 3] = one; }
    return { data, width: s, height: s };
  });
}

export async function createRenderer(canvas, { low = false } = {}) {
  const mips = await studio();   // before there is a context to leak if it fails

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false; renderer.setClearColor(0x000000, 0);
  // Scene light is unclamped (a lamp in a polished bevel is a hundred times the plate beside it) and the plates'
  // outlines are distances: both need a float target.
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) { renderer.forceContextLoss(); renderer.dispose(); throw new Error('no float render targets'); }
  const target = (opt) => new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, ...opt });
  const scene = target({ count: 2 }); const sharp = target(); const bloomA = target(); const bloomB = target(); const field = target();

  // The headline's field (engrave.js); one grey texel, "no stroke anywhere", until there are words.
  const text = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat, UnsignedByteType);
  text.minFilter = text.magFilter = LinearFilter; text.unpackAlignment = 1; text.needsUpdate = true;
  const env = new DataTexture(mips[0].data, mips[0].width, mips[0].height, RGBAFormat, HalfFloatType);
  env.mipmaps = mips; env.generateMipmaps = false; env.minFilter = LinearMipmapLinearFilter; env.magFilter = LinearFilter; env.needsUpdate = true;

  // One set of uniform objects per mounted hero, shared by reference between its parts and passes: a frame sets
  // each value once, and two heroes on a page do not write over each other.
  const u = {
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 }, uPpm: { value: 50 }, uCamD: { value: CAM }, uTilt: { value: new Matrix3() }, uPivot: { value: new Vector3(0, 0, Z.bridge) },
    uEnv: { value: env }, uSdf: { value: field.texture }, uSdfMap: { value: new Vector4(0, 0, 1, 1) }, uSdfStep: { value: 0.03 }, uLevelZ: { value: new Vector4(Z.bridge, Z.cock, Z.pallet, 0) },
    uKey: { value: new Vector3(KEY.x, KEY.y, KEY.fall) }, uFrame: { value: 0 }, uRound: { value: Array.from({ length: 6 }, () => new Vector4()) },
    uScene: { value: scene.textures[0] }, uAux: { value: scene.textures[1] }, uSharp: { value: sharp.texture }, uBloom: { value: bloomA.texture },
    uTex: { value: null }, uStep: { value: new Vector2() }, uTexel: { value: new Vector2() }, uFocus: { value: 0 }, uCoc: { value: 1 },
    uBloomK: { value: low ? 0 : 0.28 }, toneMappingExposure: { value: 1.75 },
    uText: { value: text }, uTextMap: { value: new Vector4(0, 0, 1, 1) }, uTextK: { value: new Vector2(1, 0) },
    uA: { value: Array.from({ length: PRIMS }, () => new Vector4()) }, uB: { value: Array.from({ length: PRIMS }, () => new Vector4()) }, uCount: { value: 0 }, uMap: { value: new Vector4() },
  };
  const defines = low ? { LOW: 1 } : {};
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new BufferGeometry();
  quad.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  const camera = new Camera();
  const pass = (frag) => { const m = new Mesh(tri, new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: fullscreenVert, fragmentShader: frag, defines, depthTest: false, depthWrite: false, blending: NoBlending })); m.frustumCulled = false; return m; };
  const passes = { bake: pass(bakeFrag), lens: pass(lensFrag), bright: pass(brightFrag), blur: pass(blurFrag), film: pass(filmFrag(ShaderChunk.tonemapping_pars_fragment)) };
  const run = (mesh, to) => { renderer.setRenderTarget(to); renderer.render(mesh, camera); };

  // The parts, in the order they lie: each is drawn over what is beneath it, its edge blended by its own outline.
  const world = new Scene(); const parts = [];
  const part = (frag, extra = {}) => {
    const uniforms = { ...u, uBox: { value: new Vector4() }, uPart: { value: new Vector4() }, ...extra };
    const m = new Mesh(quad, new RawShaderMaterial({ glslVersion: GLSL3, uniforms, vertexShader: partVert, fragmentShader: frag, defines, depthTest: false, depthWrite: false, transparent: true, premultipliedAlpha: true, blending: NormalBlending }));
    m.frustumCulled = false; m.renderOrder = parts.length; parts.push(m); world.add(m);
    return uniforms;
  };
  // Screws and jewels: one quad each, in batches (those under the balance are drawn before it, the rest last).
  const sprites = (frag) => {
    const geo = new InstancedBufferGeometry(); geo.setAttribute('position', quad.getAttribute('position'));
    const pos = new InstancedBufferAttribute(new Float32Array(SPRITES * 4), 4); const look = new InstancedBufferAttribute(new Float32Array(SPRITES * 4), 4);
    geo.setAttribute('iPos', pos); geo.setAttribute('iLook', look); geo.instanceCount = 0;
    const m = new Mesh(geo, new RawShaderMaterial({ glslVersion: GLSL3, uniforms: { ...u, uPart: { value: new Vector4() } }, vertexShader: spriteVert, fragmentShader: frag, defines, depthTest: false, depthWrite: false, transparent: true, premultipliedAlpha: true, blending: NormalBlending }));
    m.frustumCulled = false; m.renderOrder = parts.length; parts.push(m); world.add(m); batches.push(geo);
    let list = [];
    return {
      set(items) { list = items.slice(0, SPRITES); list.forEach((s, i) => { pos.setXYZW(i, s.x, s.y, s.z, s.r); look.setXYZW(i, s.kind, s.turn || 0, 0, 0); }); geo.instanceCount = list.length; m.visible = list.length > 0; pos.needsUpdate = look.needsUpdate = true; },
      // the screws that ride a wheel turn with it
      turn(on, angle) { list.forEach((s, i) => { if (s.on === on && look.getY(i) !== s.turn + angle) { look.setY(i, s.turn + angle); look.needsUpdate = true; } }); },
    };
  };
  const batches = [];
  const wheel = () => part(wheelFrag, { uWheel: { value: new Vector4() } });
  const swing = { value: new Vector4() };
  const floor = part(floorFrag);
  const third = wheel();
  const escape = part(escapeFrag); const fork = part(forkFrag);
  const fourth = wheel();
  const pallet = part(plateFrag, { uCh: { value: 2 } });
  const lowScrews = sprites(screwFrag); const lowJewels = sprites(jewelFrag);
  const balance = part(balanceFrag, { uSwing: swing });
  const spring = part(springFrag, { uSwing: swing, uStud: { value: 0 } });
  const bridge = part(plateFrag, { uCh: { value: 0 } });
  const cock = part(plateFrag, { uCh: { value: 1 } });
  const crown = part(windFrag, { uWheel: { value: new Vector4() } }); const ratchet = part(windFrag, { uWheel: { value: new Vector4() } });
  const click = part(clickFrag);
  const highScrews = sprites(screwFrag); const highJewels = sprites(jewelFrag);
  const place = (p, at, half, z) => { p.uBox.value.set(at[0], at[1], half, half); p.uPart.value.x = z; };

  let W = 1; let H = 1; let frames = 0;
  return {
    resize(w, h, ratio) {
      W = w; H = h;
      const dw = Math.max(2, Math.round(w * ratio)); const dh = Math.max(2, Math.round(h * ratio));
      renderer.setPixelRatio(1); renderer.setSize(dw, dh, false);
      scene.setSize(dw, dh); sharp.setSize(dw, dh); bloomA.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4)); bloomB.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4));
      u.uRes.value.set(w, h); u.uPx.value = dw / w; u.uTexel.value.set(1 / dw, 1 / dh);
    },
    // g: the caliber's layout. The plates' outlines are baked into their field, and every part is put in its place.
    layout(g) {
      const w = 2 * (g.hw + MARGIN); const h = 2 * (g.hh + MARGIN);
      const step = Math.min(0.04, Math.max(0.014, 1 / (g.ppm * 1.3)), Math.max(w, h) / 2048);
      field.setSize(Math.ceil(w / step), Math.ceil(h / step));
      g.prims.slice(0, PRIMS).forEach((p, i) => { u.uA.value[i].set(p[0], p[1], p[2], p[3]); u.uB.value[i].set(p[4], p[5], p[6], p[7]); });
      u.uCount.value = Math.min(PRIMS, g.prims.length); u.uMap.value.set(-g.hw - MARGIN, -g.hh - MARGIN, w, h);
      run(passes.bake, field);
      u.uSdfMap.value.set(-g.hw - MARGIN, -g.hh - MARGIN, 1 / w, 1 / h); u.uSdfStep.value = w / field.width;
      u.uPpm.value = g.ppm;
      for (const [p, z] of [[floor, Z.floor], [bridge, Z.bridge]]) { p.uBox.value.set(0, 0, g.hw + MARGIN, g.hh + MARGIN); p.uPart.value.set(z, 0, 0, 0); }
      // the two small plates are drawn only where they are
      const b = g.at.balance; const f = g.at.foot;
      cock.uBox.value.set((b[0] + f[0]) / 2, (b[1] + f[1]) / 2, Math.abs(b[0] - f[0]) / 2 + 2.6, Math.abs(b[1] - f[1]) / 2 + 2.6); cock.uPart.value.set(Z.cock, 0, 0, 0);
      pallet.uBox.value.set(g.at.pallet[0], g.at.pallet[1], 3.6, 3.6); pallet.uPart.value.set(Z.pallet, 0, 0, 0);
      const [w3, w4] = g.wheels;
      for (const [p, w] of [[third, w3], [fourth, w4]]) { place(p, w.at, w.r + 0.2, w.z); p.uWheel.value.set(w.r, w.teeth, w.m, w.spokes); }
      place(escape, g.escape.at, 3, g.escape.z); place(fork, g.fork.at, 4, g.fork.z);
      place(balance, g.at.balance, BALANCE.rim + BALANCE.head + 0.1, Z.balance); place(spring, g.at.balance, BALANCE.springOut + 0.35, Z.spring); spring.uStud.value = g.stud;
      for (const [p, w, kind] of [[ratchet, g.ratchet, 0], [crown, g.crown, 1]]) { place(p, w.at, w.r + 0.25, w.z); p.uWheel.value.set(w.r, w.teeth, 0.2, kind); }
      place(click, g.click.at, 2.2, g.click.z);
      [w3, w4, g.escape, g.ratchet, g.crown].forEach((w, i) => u.uRound.value[i].set(w.at[0], w.at[1], w.r, w.z));
      const low = (s) => s.z < Z.balance;
      lowScrews.set(g.screws.filter(low)); highScrews.set(g.screws.filter((s) => !low(s)));
      const stone = (j) => ({ ...j, kind: j.chaton ? 1 : 0 });
      lowJewels.set(g.jewels.filter(low).map(stone)); highJewels.set(g.jewels.filter((s) => !low(s)).map(stone));
      this.fork = g.fork.turn; this.click = g.click.turn;
    },
    // field: the headline as engrave.js made it, or null for a plain bridge. g: the layout it was measured in.
    words(field, g) {
      u.uTextK.value.y = field ? 1 : 0; if (!field) return;
      text.dispose();   // its size changed: the GPU copy is immutable
      text.image = { data: field.data, width: field.width, height: field.height }; text.needsUpdate = true;
      const b = field.box;
      u.uTextMap.value.set((b.l - g.W / 2) / g.ppm, (g.H / 2 - b.t) / g.ppm, g.ppm / b.w, g.ppm / b.h);
      u.uTextK.value.x = field.range / g.ppm * 255 / 127;
    },
    frame(view) {
      // the hand's tilt: about the picture's x axis, then about its y
      const ca = Math.cos(view.tilt.x); const sa = Math.sin(view.tilt.x); const cb = Math.cos(view.tilt.y); const sb = Math.sin(view.tilt.y);
      u.uTilt.value.set(cb, sa * sb, ca * sb, 0, ca, -sa, -sb, sa * cb, ca * cb);
      u.uFocus.value = view.focus; u.uCoc.value = 0.29 / view.stop * u.uPpm.value * u.uPx.value;   // a disc 0.58 / f-number mm across for each mm off the plane
      u.uFrame.value = view.still ? 0 : frames++ % 240;   // the grain moves with the frames; a still keeps its grain where it is
      const st = view.st;
      third.uPart.value.y = st.third; fourth.uPart.value.y = st.fourth; escape.uPart.value.y = st.escape; fork.uPart.value.y = this.fork + st.fork;
      swing.value.set(st.balance, st.balance0, 0, 0);
      ratchet.uPart.value.y = st.ratchet; crown.uPart.value.y = st.crown; click.uPart.value.y = this.click + st.click; highScrews.turn('ratchet', st.ratchet);
      renderer.setRenderTarget(scene); renderer.clear(); renderer.render(world, camera);
      run(passes.lens, sharp);
      if (!low) {
        u.uTex.value = sharp.texture; run(passes.bright, bloomA);
        u.uTex.value = bloomA.texture; u.uStep.value.set(1 / bloomA.width, 0); run(passes.blur, bloomB);
        u.uTex.value = bloomB.texture; u.uStep.value.set(0, 1 / bloomA.height); run(passes.blur, bloomA);
      }
      run(passes.film, null);
    },
    dispose() {
      for (const t of [scene, sharp, bloomA, bloomB, field, env, text]) t.dispose();
      for (const m of [...Object.values(passes), ...parts]) m.material.dispose();
      tri.dispose(); quad.dispose(); for (const b of batches) b.dispose();
      renderer.forceContextLoss();   // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
}
