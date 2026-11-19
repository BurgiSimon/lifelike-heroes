// The WebGL side. The frame, pass by pass (shaders.js says what each is): the tree and the curtain as what they take
// from the light → the light map → the crystals' spectra → the photograph in linear light into a half-float target
// → a restrained bloom → the lens and the film. Nothing here knows about the DOM; room.js says where things are.
import {
  WebGLRenderer, WebGLRenderTarget, HalfFloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping,
  SRGBColorSpace, NoColorSpace, TextureLoader, RawShaderMaterial, GLSL3, BufferGeometry, BufferAttribute, InstancedBufferGeometry,
  InstancedBufferAttribute, DynamicDrawUsage, Mesh, Camera, DataTexture, CanvasTexture, RGBAFormat, NoBlending, CustomBlending, AddEquation,
  OneFactor, OneMinusSrcColorFactor, DoubleSide, DataUtils, ShaderChunk, Vector2, Vector3, Vector4,
} from 'three';
import {
  BARS, fullscreenVert, leafVert, leafFrag, woodVert, woodFrag, clothVert, clothFrag, lightFrag, beamVert, beamFrag, sceneFrag, brightFrag, blurFrag, filmFrag,
} from './shaders.js';
import { TREE, BOUGHS, CRYSTALS, BEAMS, FW, FH, NEAR, FAR, DISC, SUN, KX } from './room.js';

const ASSETS = '/assets/light/';
const EXPOSURE = 0.2;    // the photographer's exposure: for the sunlit plaster, which the film pass then prints up to paper white

export async function createRenderer(canvas, { low = false } = {}) {
  // The scans are loaded before there is a context to leak if one fails. srgb: a picture of colour; without it the
  // file is data (normals, roughness) and must not be decoded as colour.
  const loader = new TextureLoader();
  const load = (file, srgb) => loader.loadAsync(ASSETS + file).then((t) => {
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
    return t;
  });
  const maps = await Promise.all([load('wall_diff.webp', true), load('wall_nor.webp'), load('floor_diff.webp', true), load('floor_rough.webp')]);

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  // Scene light is unclamped (the sunlit wall is several times paper white) and the light map's soft edges band in
  // eight bits: both need float targets.
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    renderer.dispose(); for (const t of maps) t.dispose();
    throw new Error('no float render targets');
  }
  const target = (float, mips = false, samples = 0) => new WebGLRenderTarget(4, 4, {
    type: float ? HalfFloatType : UnsignedByteType, depthBuffer: false, magFilter: LinearFilter, minFilter: mips ? LinearMipmapLinearFilter : LinearFilter, generateMipmaps: mips,
    wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, samples,
  });
  // The curtain is multisampled: where a fold turns edge-on to the light its cloth is slivers thinner than a texel,
  // and without it the fold's dark line comes out as a row of dashes.
  const tree = target(false, true); const curtain = target(false, true, 4); const light = target(true, true); const spec = target(true);
  const scene = target(true); const bloomA = target(true); const bloomB = target(true);

  // The headline as letters.js draws it from the DOM's own layout: it is the lettering on the glass.
  const letters = new CanvasTexture(document.createElement('canvas'));
  letters.minFilter = LinearMipmapLinearFilter; letters.magFilter = LinearFilter; letters.generateMipmaps = true;
  // Slow noise for the wall, made once: r limewash in clouds, g the brush's streaks, b and a how the plaster leans
  // away from flat. It repeats every four metres, which is more wall than a frame takes in at one height.
  const CN = 256; const cloudData = new Uint8Array(CN * CN * 4);
  {
    const hash = (x, y, s) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647 | 0, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    // value noise on a lattice that wraps after `per` cells
    const vn = (x, y, per, s) => { const i = Math.floor(x); const j = Math.floor(y); let u = x - i; let v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); const a = (m) => ((m % per) + per) % per; return (hash(a(i), a(j), s) * (1 - u) + hash(a(i + 1), a(j), s) * u) * (1 - v) + (hash(a(i), a(j + 1), s) * (1 - u) + hash(a(i + 1), a(j + 1), s) * u) * v; };
    const fbm = (x, y, fx, fy, s) => { let sum = 0; let amp = 0.5; for (let o = 0; o < 4; o++) { const k = 2 ** o; sum += amp * vn(x * fx * k, y * fy * k, Math.max(fx, fy) * k * 4, s + o); amp *= 0.5; } return sum / 0.9375; };
    for (let j = 0; j < CN; j++) {
      for (let i = 0; i < CN; i++) {
        const x = i / CN; const y = j / CN; const k = (j * CN + i) * 4;   // 0..1 over the four metres
        cloudData[k] = 255 * fbm(x, y, 5, 7, 1); cloudData[k + 1] = 255 * fbm(x, y, 9, 40, 9);
        cloudData[k + 2] = 255 * fbm(x, y, 8, 8, 21); cloudData[k + 3] = 255 * fbm(x, y, 8, 8, 33);
      }
    }
  }
  const cloud = new DataTexture(cloudData, CN, CN, RGBAFormat, UnsignedByteType);
  cloud.wrapS = cloud.wrapT = RepeatWrapping; cloud.minFilter = cloud.magFilter = LinearFilter; cloud.needsUpdate = true;
  // The pointer's breeze, as room.js keeps it.
  const fieldHalf = new Uint16Array(FW * FH * 4);
  const field = new DataTexture(fieldHalf, FW, FH, RGBAFormat, HalfFloatType);
  field.minFilter = field.magFilter = LinearFilter; field.needsUpdate = true;

  // One set of uniform objects per mounted hero, shared by reference between its passes.
  const u = {
    uRes: { value: new Vector2(1, 1) }, uPpm: { value: 1 }, uTime: { value: 0 }, uFrame: { value: 0 },
    uBough: { value: new Float32Array(BOUGHS * 2) }, uField: { value: field }, uTree: { value: new Vector2() }, uTreeBox: { value: new Vector4() }, uBreeze: { value: 0 },
    uClear: { value: new Vector4() }, uLeaves: { value: 1 },
    uCurt: { value: new Vector4() }, uCurtBox: { value: new Vector4() }, uCloth: { value: new Vector2() }, uCurtPx: { value: 1 },
    uMapBox: { value: new Vector4() }, uOpen: { value: new Vector4() }, uBars: { value: new Float32Array(BARS * 4) }, uBarN: { value: 0 },
    uPen: { value: 1 }, uPenTree: { value: new Vector2() }, uLetters: { value: letters }, uText: { value: 1 },
    uCurtain: { value: curtain.texture }, uTreeTex: { value: tree.texture }, uTreePx: { value: 1 }, uCrys: { value: new Float32Array(CRYSTALS * 4) }, uDz: { value: 1 },
    uCam: { value: new Vector3() }, uFloorY: { value: 0 }, uSkirt: { value: new Vector2() }, uLight: { value: light.texture }, uSpec: { value: spec.texture },
    uWallD: { value: maps[0] }, uWallN: { value: maps[1] }, uFloorD: { value: maps[2] }, uFloorR: { value: maps[3] }, uCloud: { value: cloud }, uPx: { value: 1 },
    uScene: { value: scene.texture }, uBloom: { value: bloomA.texture }, uTex: { value: null }, uStep: { value: new Vector2() }, uTexel: { value: new Vector2() },
    uBloomK: { value: low ? 0 : 0.3 }, toneMappingExposure: { value: EXPOSURE },
  };
  const material = (vertexShader, fragmentShader, extra) => new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader, fragmentShader, depthTest: false, depthWrite: false, blending: NoBlending, ...extra });
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new Camera();
  const mesh = (geo, mat) => { const m = new Mesh(geo, mat); m.frustumCulled = false; return m; };
  const pass = (frag) => mesh(tri, material(fullscreenVert, frag));
  const passes = { light: pass(lightFrag(low)), scene: pass(sceneFrag), bright: pass(brightFrag), blur: pass(blurFrag), film: pass(filmFrag(ShaderChunk.tonemapping_pars_fragment)) };
  const run = (m, to) => { renderer.setRenderTarget(to); renderer.render(m, camera); };
  const wipe = (to) => { renderer.setRenderTarget(to); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); };

  // What stands in the light is drawn as quads in a space whose y runs down, which turns them over: DoubleSide.
  const quad = () => { const q = new InstancedBufferGeometry(); q.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); q.setIndex([0, 1, 2, 0, 2, 3]); return q; };
  const inst = (geo, name, rows, from, size, dynamic) => {
    const a = new InstancedBufferAttribute(new Float32Array(rows.length ? rows.flatMap((r) => r.slice(from, from + size)) : dynamic * size), size);
    if (dynamic) a.setUsage(DynamicDrawUsage);
    geo.setAttribute(name, a); return a;
  };
  // A thing that covers light covers what is behind it too: each channel is laid over what is there, not added to it.
  const cover = { side: DoubleSide, transparent: true, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor };
  const add = { side: DoubleSide, transparent: true, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor };
  // In the low tier every second leaf is left off the tree: its shade is blurred far past the single leaf anyway.
  const leafRows = low ? TREE.leaves.filter((_, i) => i % 3 !== 2) : TREE.leaves;
  const leafGeo = quad(); inst(leafGeo, 'aLeaf', leafRows, 0, 4); inst(leafGeo, 'aSway', leafRows, 4, 4); inst(leafGeo, 'aKind', leafRows, 8, 2); leafGeo.instanceCount = leafRows.length;
  const woodGeo = quad(); inst(woodGeo, 'aA', TREE.wood, 0, 4); inst(woodGeo, 'aB', TREE.wood, 4, 4); inst(woodGeo, 'aR', TREE.wood, 8, 4); woodGeo.instanceCount = TREE.wood.length;
  const leaves = mesh(leafGeo, material(leafVert, leafFrag, cover)); const wood = mesh(woodGeo, material(woodVert, woodFrag, cover));
  const beamGeo = quad(); const aEnds = inst(beamGeo, 'aEnds', [], 0, 4, BEAMS); const aBeam = inst(beamGeo, 'aBeam', [], 0, 4, BEAMS); beamGeo.instanceCount = 0;
  const beams = mesh(beamGeo, material(beamVert, beamFrag, add));
  // The curtain's cloth: its points come from room.js every frame.
  const clothGeo = new BufferGeometry(); let clothPos = null; let clothFace = null;
  const cloth = mesh(clothGeo, material(clothVert, clothFrag, add));

  let W = 1; let H = 1; let frames = 0; let stirred = true;
  const sized = (t, w, h) => { const a = Math.max(2, Math.round(w)); const b = Math.max(2, Math.round(h)); if (t.width !== a || t.height !== b) t.setSize(a, b); };
  const box = (v, l, t, r, b) => v.set(l, t, 1 / (r - l), 1 / (b - t));
  return {
    resize(w, h, ratio) {
      W = w; H = h;
      const dw = Math.max(2, Math.round(w * ratio)); const dh = Math.max(2, Math.round(h * ratio));
      renderer.setPixelRatio(1); renderer.setSize(dw, dh, false);
      scene.setSize(dw, dh); sized(bloomA, dw / 4, dh / 4); sized(bloomB, dw / 4, dh / 4);
      sized(spec, dw / 2, dh / 2);   // a spectrum is as soft as the sun is wide: half size loses nothing
      u.uRes.value.set(w, h); u.uPx.value = dw / w; u.uTexel.value.set(1 / dw, 1 / dh);
    },
    // Where things are (room.js's g), turned into the rects each target covers and the sizes each pass works in.
    layout(g, cloth_) {
      const { ppm, open: o } = g; const k = low ? 0.6 : 1;
      u.uPpm.value = ppm; u.uOpen.value.set(o.l, o.t, o.r, o.b); u.uPen.value = g.pen; u.uDz.value = g.Dz;
      // the tree is NEAR and FAR further from the wall than the glass is, and its shadows' edges are wider by as much
      u.uPenTree.value.set(g.pen + DISC * NEAR * ppm / SUN[2], g.pen + DISC * FAR * ppm / SUN[2]);
      u.uBarN.value = Math.min(BARS, g.bars.length); g.bars.slice(0, BARS).forEach((b, i) => u.uBars.value.set([b.l, b.t, b.r, b.b], i * 4));
      u.uCam.value.set(g.cam.x, g.cam.y, g.cam.z); u.uFloorY.value = g.floorY; u.uSkirt.value.set(g.skirt.h, g.skirt.d);
      u.uClear.value.set(g.clear.l, g.clear.t, g.clear.r, g.clear.b); u.uTree.value.set(g.tree.x, g.tree.y);
      // The light map: the frame, and a margin where the light that comes down on the floor would have met the wall plane.
      const mg = 0.36 * ppm;
      box(u.uMapBox.value, -12, -12, W + mg, H + mg); sized(light, (W + mg + 12) * 0.5 * k, (H + mg + 12) * 0.5 * k);
      // The tree: the glass, and a margin as wide as its softest shadow and its furthest swing.
      const tm = u.uPenTree.value.y * 0.5 + 0.16 * ppm; const tb = Math.min(o.b, H + mg) + tm; const tk = 0.7 * k;
      box(u.uTreeBox.value, o.l - tm, o.t - tm, o.r + tm, tb); sized(tree, (o.r - o.l + 2 * tm) * tk, (tb - o.t + tm) * tk); u.uTreePx.value = 1 / tk;
      // The curtain: its cloth, and room to the right and above for a gust to carry its shadow.
      const cw = cloth_.w * g.curt.kx; const ch = cloth_.h * g.curt.ky; const ck = 0.8 * k;
      u.uCurt.value.set(g.curt.x, g.curt.y, g.curt.kx, g.curt.ky); u.uCloth.value.set(cloth_.full, cloth_.h);
      box(u.uCurtBox.value, g.curt.x - 0.12 * ppm, g.curt.y - 0.3 * ppm, g.curt.x + cw + 0.75 * ppm, g.curt.y + ch + 0.1 * ppm);
      sized(curtain, (cw + 0.87 * ppm) * ck, (ch + 0.4 * ppm) * ck); u.uCurtPx.value = 1 / ck;
      if (!clothPos) {
        clothPos = new BufferAttribute(cloth_.p, 3); clothPos.setUsage(DynamicDrawUsage);
        clothFace = new BufferAttribute(cloth_.nrm, 3); clothFace.setUsage(DynamicDrawUsage);
        clothGeo.setAttribute('position', clothPos); clothGeo.setAttribute('normal', clothFace);
        clothGeo.setAttribute('uv', new BufferAttribute(cloth_.uv, 2)); clothGeo.setIndex(new BufferAttribute(cloth_.index, 1));
      }
      stirred = true;
    },
    // draw: fills the letters' canvas. on: whether there is lettering at all.
    text(draw, on) { draw(letters.image); letters.needsUpdate = true; u.uText.value = on ? 1 : 0; },
    frame(view, cfg, room) {
      const { st } = room;
      u.uTime.value = st.t; u.uBreeze.value = st.breeze; u.uLeaves.value = cfg.leaves; u.uBough.value.set(st.bough);
      if (view.stirred || stirred) { for (let i = 0; i < fieldHalf.length; i++) fieldHalf[i] = DataUtils.toHalfFloat(st.field[i]); field.needsUpdate = true; stirred = view.stirred; }
      const c = u.uCrys.value; c.fill(0);
      // each crystal's shadow, how much it is there, and the x its thread is tied at (which does not swing)
      st.crystals.slice(0, CRYSTALS).forEach((k, i) => { const s = room.shadowOf(k); c.set([s.x, s.y, k.k, s.x - (k.sx - KX * k.sz) * u.uPpm.value], i * 4); });
      const n = st.nBeams;
      for (let i = 0; i < n; i++) { aEnds.array.set(st.beams.subarray(i * 8, i * 8 + 4), i * 4); aBeam.array.set(st.beams.subarray(i * 8 + 4, i * 8 + 8), i * 4); }
      aEnds.needsUpdate = aBeam.needsUpdate = true; beamGeo.instanceCount = n;
      if (clothPos) clothPos.needsUpdate = clothFace.needsUpdate = true;

      wipe(tree); run(wood, tree); run(leaves, tree);
      wipe(curtain); if (clothPos) run(cloth, curtain);
      run(passes.light, light);
      wipe(spec); if (n) run(beams, spec);
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
      for (const t of [tree, curtain, light, spec, scene, bloomA, bloomB, letters, field, cloud, ...maps]) t.dispose();
      for (const m of [...Object.values(passes), leaves, wood, beams, cloth]) m.material.dispose();
      for (const geo of [tri, leafGeo, woodGeo, beamGeo, clothGeo]) geo.dispose();
      renderer.forceContextLoss();   // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
}
