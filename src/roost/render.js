// The WebGL side. The frame: the sky (a photograph, in the lens's own projection) → every bird in the air,
// darkening it → the roofline and the sign, from a canvas → the birds on the sign → the lens and the print.
// shaders.js says why it is drawn that way. Nothing here knows about the DOM; flock.js says where the birds are.
import {
  WebGLRenderer, WebGLRenderTarget, UnsignedByteType, LinearFilter, ClampToEdgeWrapping, SRGBColorSpace, TextureLoader, RawShaderMaterial, GLSL3,
  BufferGeometry, BufferAttribute, InstancedBufferGeometry, InstancedBufferAttribute, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  DynamicDrawUsage, Mesh, Group, Camera, CanvasTexture, NoBlending, NormalBlending, CustomBlending, MinEquation, OneFactor, DoubleSide, Vector2,
} from 'three';
import { fullscreenVert, skyFrag, birdVert, birdFrag, maskFrag, perchVert, perchFrag, filmFrag } from './shaders.js';

const ASSETS = '/assets/roost/';

export async function createRenderer(canvas, flock) {
  // The sky is loaded before there is a context to leak if it fails.
  const sky = await new TextureLoader().loadAsync(ASSETS + 'sky.webp');
  sky.colorSpace = SRGBColorSpace; sky.wrapS = sky.wrapT = ClampToEdgeWrapping; sky.minFilter = sky.magFilter = LinearFilter; sky.generateMipmaps = false;

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  // Multisampled: the far birds are a few pixels of wing each, and without it they crawl.
  const scene = new WebGLRenderTarget(4, 4, { type: UnsignedByteType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, samples: 4 });
  // The roofline and the sign, as skyline.js paints them.
  const mask = new CanvasTexture(document.createElement('canvas'));
  mask.minFilter = mask.magFilter = LinearFilter; mask.generateMipmaps = false;

  // One set of uniform objects per mounted hero, shared by reference between its passes.
  const u = {
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 }, uF: { value: 1 }, uC: { value: new Vector2() }, uTime: { value: 0 }, uFrame: { value: 0 },
    uSky: { value: sky }, uLag: { value: 0 }, uMask: { value: mask }, uPpm: { value: 1 }, uScene: { value: scene.texture },
  };
  const material = (vertexShader, fragmentShader, extra) => new RawShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader, fragmentShader, depthTest: false, depthWrite: false, blending: NoBlending, ...extra });
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new Camera();
  const mesh = (geo, mat) => { const m = new Mesh(geo, mat); m.frustumCulled = false; return m; };
  const passes = {
    sky: mesh(tri, material(fullscreenVert, skyFrag)),
    mask: mesh(tri, material(fullscreenVert, maskFrag, { transparent: true, blending: NormalBlending })),
    film: mesh(tri, material(fullscreenVert, filmFrag)),
  };
  const run = (m, to) => { renderer.setRenderTarget(to); renderer.render(m, camera); };

  // A bird in the air: a body (a quad the lens sees face on) and two wings (a triangle each). flock.js's own
  // buffer is the instances: twelve numbers a bird.
  const birdGeo = new InstancedBufferGeometry();
  birdGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, 0, 0, 1, 1, 0, 1, 2, 0, 1, 0, 0, 2, 1, 0, 2, 2, 0, 2]), 3));
  birdGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9]);
  const inst = new InstancedInterleavedBuffer(flock.st.inst, 12); inst.setUsage(DynamicDrawUsage);
  birdGeo.setAttribute('aA', new InterleavedBufferAttribute(inst, 4, 0)); birdGeo.setAttribute('aB', new InterleavedBufferAttribute(inst, 4, 4)); birdGeo.setAttribute('aC', new InterleavedBufferAttribute(inst, 4, 8));
  birdGeo.instanceCount = 0;
  // Only ever darker: the blend keeps the lesser of what is there and the bird, so no order among them matters.
  const birds = mesh(birdGeo, material(birdVert, birdFrag, { side: DoubleSide, transparent: true, blending: CustomBlending, blendEquation: MinEquation, blendSrc: OneFactor, blendDst: OneFactor }));
  // A bird on the sign: a quad, from its feet up.
  const perchGeo = new InstancedBufferGeometry();
  perchGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); perchGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aP = new InstancedBufferAttribute(flock.st.perch, 4); aP.setUsage(DynamicDrawUsage); perchGeo.setAttribute('aP', aP); perchGeo.instanceCount = 0;
  const perched = mesh(perchGeo, material(perchVert, perchFrag, { side: DoubleSide, transparent: true, blending: NormalBlending }));
  // The four layers of the picture go into the multisampled target in one render, so it is resolved once a frame,
  // not once a layer: on a phone's tiled GPU each resolve is a full read and write of the frame. The opaque sky is
  // drawn first; the rest, all blended, go in this order.
  const layers = new Group();
  passes.sky.renderOrder = 0; birds.renderOrder = 1; passes.mask.renderOrder = 2; perched.renderOrder = 3;
  layers.add(passes.sky, birds, passes.mask, perched);

  let frames = 0;
  return {
    resize(w, h, ratio) {
      const dw = Math.max(2, Math.round(w * ratio)); const dh = Math.max(2, Math.round(h * ratio));
      renderer.setPixelRatio(1); renderer.setSize(dw, dh, false); scene.setSize(dw, dh);
      u.uRes.value.set(w, h); u.uPx.value = dw / w;
    },
    // The lens, as flock.js laid it out.
    layout(g) { u.uF.value = g.F; u.uC.value.set(g.cx, g.hy); u.uPpm.value = g.ppm; },
    // paint: fills the canvas with the roofline and the sign (skyline.js). Returns what it returns: where a bird can sit.
    paint(fn) { const slots = fn(mask.image); mask.needsUpdate = true; return slots; },
    frame(view) {
      const { st } = flock;
      u.uTime.value = st.t; u.uLag.value = st.lag;
      inst.needsUpdate = true; birdGeo.instanceCount = st.count;
      aP.needsUpdate = true; perchGeo.instanceCount = st.perched;
      birds.visible = st.count > 0; perched.visible = st.perched > 0;
      run(layers, scene);
      // The grain moves with the frames that are drawn; a still (frame 0, every time) keeps its grain where it is.
      u.uFrame.value = view.still ? 0 : frames++ % 240;
      run(passes.film, null);
    },
    dispose() {
      for (const t of [scene, mask, sky]) t.dispose();
      for (const m of [...Object.values(passes), birds, perched]) m.material.dispose();
      for (const geo of [tri, birdGeo, perchGeo]) geo.dispose();
      renderer.forceContextLoss();   // hand the context back now, not when the collector gets to it
      renderer.dispose();
    },
  };
}
