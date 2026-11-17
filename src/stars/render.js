// The WebGL side: a small aurora target, one half-float scene target (sky → stars → lines → meteor → land) and
// one post pass to the screen.
import {
  WebGLRenderer, WebGLRenderTarget, HalfFloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, NoColorSpace,
  RawShaderMaterial, GLSL3, BufferGeometry, InstancedBufferGeometry, BufferAttribute, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  DynamicDrawUsage, Mesh, Points, Texture, DataTexture, RedFormat, Camera,
  CustomBlending, NormalBlending, OneFactor, ZeroFactor, NoBlending, DoubleSide, Vector2, Vector3, Vector4,
} from 'three';
import { fullscreenVert, skyFrag, starVert, starFrag, lineVert, lineFrag, meteorVert, meteorFrag, auroraFrag, groundFrag, postFrag } from './shaders.js';
import { LINE_STRIDE } from './chart.js';
import { profile } from './ground.js';

const ASSETS = '/assets/stars/';

export async function createRenderer(canvas, { catalog, chart, low, signal }) {
  // The deep star map and the land decode off the main thread, and before there is a context to leak if they fail.
  const image = async (file, how) => createImageBitmap(await (await fetch(ASSETS + file, { signal })).blob(), how);
  const [bitmap, landMap] = await Promise.all([
    image('sky.webp', low ? { resizeWidth: 2048, resizeHeight: 2048, resizeQuality: 'high' } : undefined),
    image('land.webp', { premultiplyAlpha: 'premultiply' }),
  ]);
  const tops = profile(landMap);
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  const float = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = () => new WebGLRenderTarget(4, 4, { type: float ? HalfFloatType : UnsignedByteType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  const scene = target(); const aurora = target();
  aurora.texture.generateMipmaps = true; aurora.texture.minFilter = LinearMipmapLinearFilter; // its coarse levels are the light on the snow
  const auroraScale = low ? 0.25 : 0.5; // its lower border is the sharpest thing in it: a third was too soft

  const skyTex = new Texture(bitmap);
  skyTex.flipY = false; skyTex.colorSpace = NoColorSpace; skyTex.minFilter = LinearMipmapLinearFilter; skyTex.magFilter = LinearFilter;
  skyTex.anisotropy = 4; skyTex.needsUpdate = true;

  // Where the sky is to stay quiet (behind the headline): a small feathered field, rebuilt on layout. Computed here
  // rather than with canvas shadows or filters, so it is the same in every browser.
  const maskTex = new DataTexture(new Uint8Array(4).fill(255), 2, 2, RedFormat, UnsignedByteType);
  maskTex.minFilter = maskTex.magFilter = LinearFilter; maskTex.unpackAlignment = 1; maskTex.needsUpdate = true;
  const landTex = new Texture(landMap);
  landTex.flipY = false; landTex.colorSpace = NoColorSpace; landTex.minFilter = LinearMipmapLinearFilter; landTex.magFilter = LinearFilter; landTex.needsUpdate = true;

  const u = {
    uRes: { value: new Vector2(1, 1) }, uPole: { value: new Vector2() }, uRot: { value: new Vector2(1, 0) },
    uScale: { value: 1 }, uRing: { value: 100 }, uRatio: { value: 1 }, uTime: { value: 0 },
    uHorizonY: { value: 1 }, uAltScale: { value: 10 }, uNorthX: { value: 0 }, uTexel: { value: 0.001 },
    uSky: { value: skyTex }, uMask: { value: maskTex }, uMaskMap: { value: new Vector4(1, 1, 0, 0) }, uScene: { value: scene.texture }, uAurora: { value: aurora.texture },
    uLand: { value: landTex }, uLandMap: { value: new Vector4(0, 1, 1, 0) }, uDome: { value: new Vector3(0, 0, 1) },
    uSkyGain: { value: 1.25 }, uGrid: { value: 0.06 }, uAuroraGain: { value: 1 }, uSurge: { value: 0 },
    uGain: { value: 0.8 }, uTwinkle: { value: 1 }, uAlpha: { value: 1.15 }, uMagLimit: { value: low ? 7.2 : 8.0 }, uTone: { value: new Vector3(4, 0.6, 0.2) },
    uShoot: { value: new Vector4() }, uShootP: { value: 0 }, uPad: { value: 76 },
    uGrain: { value: 0.022 },
  };
  const material = (vertexShader, fragmentShader, extra) => new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader, fragmentShader, depthTest: false, depthWrite: false, blending: NoBlending, ...extra });
  const additive = { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, side: DoubleSide }; // quads face either way once y is flipped

  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new Camera();
  const pass = (frag, extra) => { const m = new Mesh(tri, material(fullscreenVert, frag, extra)); m.frustumCulled = false; return m; };
  const sky = pass(skyFrag);
  const auroraPass = pass(auroraFrag);
  const ground = pass(groundFrag, { blending: NormalBlending, transparent: true, premultipliedAlpha: true }); // premultiplied, so the window's glow can add to the sky
  const post = pass(postFrag);

  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(catalog.pos, 3)); // chart-plane x, y and magnitude; three counts vertices by this name
  starGeo.setAttribute('aCol', new BufferAttribute(catalog.col, 3));
  starGeo.setAttribute('aSeed', new BufferAttribute(catalog.seed, 1));
  const marks = new BufferAttribute(chart.marks, 2); marks.setUsage(DynamicDrawUsage);
  starGeo.setAttribute('aMark', marks);
  if (low) { let n = 0; while (n < catalog.n && catalog.mag[n] < 7.2) n++; starGeo.setDrawRange(0, n); } // brightest first
  const stars = new Points(starGeo, material(starVert, starFrag, additive));
  stars.frustumCulled = false;

  // One quad, instanced per line segment (and once for the meteor).
  const corners = new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3);
  const lineGeo = new InstancedBufferGeometry();
  lineGeo.setAttribute('position', corners); // three counts vertices by this name
  const lineBuf = new InstancedInterleavedBuffer(chart.lines, LINE_STRIDE); lineBuf.setUsage(DynamicDrawUsage);
  lineGeo.setAttribute('aSeg', new InterleavedBufferAttribute(lineBuf, 4, 0));
  lineGeo.setAttribute('aInk', new InterleavedBufferAttribute(lineBuf, 4, 4));
  lineGeo.setAttribute('aGlow', new InterleavedBufferAttribute(lineBuf, 1, 8));
  const lines = new Mesh(lineGeo, material(lineVert, lineFrag, additive));
  lines.frustumCulled = false;
  const meteorGeo = new BufferGeometry(); meteorGeo.setAttribute('position', corners);
  const meteor = new Mesh(meteorGeo, material(meteorVert, meteorFrag, additive));
  meteor.frustumCulled = false;
  const everything = [sky, auroraPass, ground, post, stars, lines, meteor];

  let W = 1; let H = 1; let groundTop = 0; let tick = 0; let auroraDirty = true;
  const api = {
    uniforms: u,
    lost: false,
    resize(w, h, ratio) {
      W = w; H = h;
      renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
      scene.setSize(Math.max(1, Math.floor(w * ratio)), Math.max(1, Math.floor(h * ratio)));
      aurora.setSize(Math.max(1, Math.round(w * auroraScale)), Math.max(1, Math.round(h * auroraScale)));
      u.uRes.value.set(w, h); u.uRatio.value = ratio;
      // The lens: a point spread about 1.75 px across at half height, and never under 1.25 device px wide, or a
      // drifting star flickers as it crosses the pixel grid.
      u.uAlpha.value = Math.max(1.55, (low ? 1 : 1.25) / ratio); // the low tier trades a little flicker for stars that stay small
      auroraDirty = true;
    },
    // The ground frame: where the true horizon lies on screen, how many px a degree of altitude takes, where north is.
    frameOfGround(horizonY, altScale, northX) {
      u.uHorizonY.value = horizonY; u.uAltScale.value = altScale; u.uNorthX.value = northX;
      u.uTexel.value = (Math.PI / 180) / (altScale * auroraScale);
      auroraDirty = true;
    },
    // cell is the original's star spacing: a wider cell is a sparser chart, so the catalogue is drawn less deep
    // (its stars triple with each magnitude). 38 is the sky as it was shot.
    depth(cell) { u.uMagLimit.value = (low ? 7.2 : 8.0) - 4.17 * Math.log10(cell / 38); },
    tops, // the land's own skyline, for ground.js
    ground(g) {
      u.uLandMap.value.set(g.left, g.w, g.h, 0); u.uDome.value.set(g.dome.x, g.dome.y, g.dome.r); groundTop = g.top;
    },
    // lines: the headline's lines in CSS px, cue: the button under it. The sky under them is dimmed with a wide
    // feather, not a box.
    mask(lines, cue) {
      const rects = [...lines, cue];
      const s = 8; const w = Math.ceil(W / s) + 1; const h = Math.ceil(H / s) + 1; const data = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          let sd = 1e9; const x = i * s; const y = j * s;
          for (const r of rects) { // signed distance to the nearest line of type
            const dx = Math.max(r.l - x, x - r.r); const dy = Math.max(r.t - y, y - r.b);
            sd = Math.min(sd, Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0));
          }
          const t = Math.min(1, Math.max(0, (sd + 14) / 96));
          data[j * w + i] = Math.round(255 * t * t * (3 - 2 * t));
        }
      }
      maskTex.dispose(); // its size changed: the GPU copy is immutable
      maskTex.image = { data, width: w, height: h }; maskTex.needsUpdate = true;
      u.uMaskMap.value.set(1 / (s * w), 1 / (s * h), 0.5 / w, 0.5 / h); // CSS px → the field's texel centres
    },
    warm() { renderer.initTexture(skyTex); renderer.initTexture(landTex); for (const o of everything) renderer.compile(o, camera); },
    frame(s) {
      u.uPole.value.set(s.poleX, s.poleY); u.uRot.value.set(Math.cos(s.rot), Math.sin(s.rot));
      u.uScale.value = s.scale; u.uRing.value = s.ring; u.uTime.value = s.time; u.uTwinkle.value = s.still ? 0 : 1; u.uSurge.value = s.surge;
      // A smaller chart packs more sky into a pixel: the exposure comes down with it, or a phone's sky is all stars.
      u.uGain.value = 0.8 * Math.min(1.2, Math.max(0.5, s.scale / 9.6)) ** 1.3;
      u.uTone.value.fromArray(s.tone);
      // Buffers go up only when the chart changed them: a settled sky uploads nothing.
      const nm = chart.takeMarks();
      if (nm) { marks.clearUpdateRanges(); marks.addUpdateRange(0, nm * 2); marks.needsUpdate = true; }
      lineGeo.instanceCount = chart.nLines;
      if (chart.nLines) { lineBuf.clearUpdateRanges(); lineBuf.addUpdateRange(0, chart.nLines * LINE_STRIDE); lineBuf.needsUpdate = true; }

      // The aurora moves slowly and is soft: a small target, refreshed every other frame.
      if (auroraDirty || (!s.still && tick++ % (low ? 3 : 2) === 0)) {
        auroraDirty = false;
        renderer.setRenderTarget(aurora); renderer.render(auroraPass, camera);
      }
      renderer.setRenderTarget(scene);
      renderer.render(sky, camera);
      const pad = Math.round(u.uPad.value * u.uRatio.value); // see starVert
      scene.viewport.set(-pad, -pad, scene.width + 2 * pad, scene.height + 2 * pad); renderer.setRenderTarget(scene);
      renderer.render(stars, camera);
      scene.viewport.set(0, 0, scene.width, scene.height); renderer.setRenderTarget(scene);
      if (chart.nLines) renderer.render(lines, camera);
      if (chart.shoot.on) { const m = chart.shoot; u.uShoot.value.set(m.x, m.y, m.dx, m.dy); u.uShootP.value = m.p; renderer.render(meteor, camera); }
      // The land only shades the rows it can reach.
      scene.scissorTest = true; scene.scissor.set(0, 0, scene.width, Math.ceil((groundTop + 3) * u.uRatio.value));
      renderer.setRenderTarget(scene); renderer.render(ground, camera);
      scene.scissorTest = false;
      renderer.setRenderTarget(null);
      renderer.render(post, camera);
    },
    dispose() {
      scene.dispose(); aurora.dispose(); skyTex.dispose(); bitmap.close?.(); landTex.dispose(); landMap.close?.(); maskTex.dispose();
      tri.dispose(); starGeo.dispose(); lineGeo.dispose(); meteorGeo.dispose();
      for (const o of everything) o.material.dispose();
      renderer.forceContextLoss(); // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); api.lost = true; }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { api.lost = false; auroraDirty = true; }, { signal });
  return api;
}
