// The WebGL side: the scene in linear light into a half-float target, a restrained bloom of what really is bright,
// then one pass that is the lens and the film (shaders.js). Nothing here knows about the DOM.
import {
  WebGLRenderer, WebGLRenderTarget, HalfFloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping,
  SRGBColorSpace, NoColorSpace, TextureLoader, RawShaderMaterial, GLSL3, BufferGeometry, BufferAttribute, Mesh, Camera,
  DataTexture, RedFormat, NoBlending, ShaderChunk, Vector2, Vector3, Vector4,
} from 'three';
import { MARKS, fullscreenVert, sceneFrag, brightFrag, blurFrag, filmFrag } from './shaders.js';

const ASSETS = '/assets/{{id}}/';

export async function createRenderer(canvas, { low = false } = {}) {
  // Real ingredients (a scanned surface, a photographed sky) are loaded here, before there is a context to leak if
  // one fails. srgb: a picture of colour (albedo, a photograph); without it the file is data (normals, roughness,
  // height) and must not be decoded as colour.
  const loader = new TextureLoader();
  const load = (file, { srgb = false, repeat = false, aniso = 4 } = {}) => loader.loadAsync(ASSETS + file).then((t) => {
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
    return t;
  });
  const maps = await Promise.all([]);   // STARTER: e.g. [load('floor_diff.webp', { srgb: true, repeat: true }), load('floor_nor.webp', { repeat: true })]

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  // Scene light is unclamped (the sun is several times paper white), so it needs a float target; 8 bits clip it.
  const float = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = () => new WebGLRenderTarget(4, 4, { type: float ? HalfFloatType : UnsignedByteType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  const scene = target(); const bloomA = target(); const bloomB = target();

  // Where the scene is to stay quiet (behind the type): a small feathered field, rebuilt on layout. Computed here
  // rather than with canvas shadows or filters, so it is the same in every browser.
  const maskTex = new DataTexture(new Uint8Array(4).fill(255), 2, 2, RedFormat, UnsignedByteType);
  maskTex.minFilter = maskTex.magFilter = LinearFilter; maskTex.unpackAlignment = 1; maskTex.needsUpdate = true;

  // One set of uniform objects per mounted hero, shared by reference between its passes: a frame sets each value
  // once, and two heroes on a page do not write over each other.
  const u = {
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 }, uTime: { value: 0 }, uFrame: { value: 0 },
    uPtr: { value: new Vector3(-1e4, -1e4, 0) }, uReach: { value: 160 },
    uMarks: { value: Array.from({ length: MARKS }, () => new Vector4(0, 0, 0, 0)) },
    uMask: { value: maskTex }, uMaskMap: { value: new Vector4(1, 1, 0, 0) },
    uScene: { value: scene.texture }, uBloom: { value: bloomA.texture }, uTex: { value: null }, uStep: { value: new Vector2() }, uTexel: { value: new Vector2() },
    uBloomK: { value: low ? 0 : 0.5 }, toneMappingExposure: { value: 1 },
  };
  const material = (fragmentShader, extra) => new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: fullscreenVert, fragmentShader, defines: low ? { LOW: 1 } : {}, depthTest: false, depthWrite: false, blending: NoBlending, ...extra });
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new Camera();
  const pass = (frag) => { const m = new Mesh(tri, material(frag)); m.frustumCulled = false; return m; };
  const passes = { scene: pass(sceneFrag), bright: pass(brightFrag), blur: pass(blurFrag), film: pass(filmFrag(ShaderChunk.tonemapping_pars_fragment)) };
  const run = (mesh, to) => { renderer.setRenderTarget(to); renderer.render(mesh, camera); };

  let W = 1; let H = 1; let frames = 0;
  return {
    resize(w, h, ratio) {
      W = w; H = h;
      const dw = Math.max(2, Math.round(w * ratio)); const dh = Math.max(2, Math.round(h * ratio));
      renderer.setPixelRatio(1); renderer.setSize(dw, dh, false);
      scene.setSize(dw, dh); bloomA.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4)); bloomB.setSize(Math.ceil(dw / 4), Math.ceil(dh / 4));
      u.uRes.value.set(w, h); u.uPx.value = dw / w; u.uTexel.value.set(1 / dw, 1 / dh);
    },
    // rects: the lines of type in CSS px. The scene under them is dimmed with a wide feather.
    mask(rects) {
      const s = 8; const w = Math.ceil(W / s) + 1; const h = Math.ceil(H / s) + 1; const data = new Uint8Array(w * h).fill(255);
      if (rects.length) for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          let sd = 1e9; const x = i * s; const y = j * s;
          for (const r of rects) {   // signed distance to the nearest line of type
            const dx = Math.max(r.l - x, x - r.r); const dy = Math.max(r.t - y, y - r.b);
            sd = Math.min(sd, Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0));
          }
          const t = Math.min(1, Math.max(0, (sd + 14) / 96));
          data[j * w + i] = Math.round(255 * t * t * (3 - 2 * t));
        }
      }
      maskTex.dispose();   // its size changed: the GPU copy is immutable
      maskTex.image = { data, width: w, height: h }; maskTex.needsUpdate = true;
      u.uMaskMap.value.set(1 / (s * w), 1 / (s * h), 0.5 / w, 0.5 / h);   // CSS px → the field's texel centres
    },
    frame(view, cfg) {
      u.uTime.value = view.time; u.uReach.value = cfg.reach;
      u.uPtr.value.set(view.ptr.x, view.ptr.y, view.ptr.k);
      u.uMarks.value.forEach((v, i) => { const m = view.marks[i]; if (m) v.set(m.x, m.y, view.now - m.t, 1); else v.set(0, 0, 0, 0); });
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
      for (const t of [scene, bloomA, bloomB, maskTex, ...maps]) t.dispose();
      for (const m of Object.values(passes)) m.material.dispose();
      tri.dispose();
      renderer.forceContextLoss();   // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
}
