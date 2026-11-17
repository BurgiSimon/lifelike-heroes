// The lens and the film: scene → near-field blur at half size (with the blades at the lens drawn straight into it)
// → bloom → composite, tone curve, grade, vignette, grain. The scene target is multisampled 8-bit holding packed
// (tone-compressed) colour and the circle of confusion in alpha.
import * as THREE from 'three';
import { LENS } from './config.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const UNPACK = /* glsl */`vec3 unpack(vec3 c) { c *= c; return c / max(1e-3, 1.0 - max(c.r, max(c.g, c.b))); }`;

// Half size: scene light averaged over 2 × 2, and the largest blur among them, so a thin blurred blade keeps its radius.
const PRE = /* glsl */`
uniform sampler2D tScene; uniform vec2 uTexel;
varying vec2 vUv;
${UNPACK}
void main() {
  vec4 a = texture2D(tScene, vUv + uTexel * vec2(-0.5, -0.5)); vec4 b = texture2D(tScene, vUv + uTexel * vec2(0.5, -0.5));
  vec4 c = texture2D(tScene, vUv + uTexel * vec2(-0.5, 0.5)); vec4 d = texture2D(tScene, vUv + uTexel * vec2(0.5, 0.5));
  gl_FragColor = vec4((unpack(a.rgb) + unpack(b.rgb) + unpack(c.rgb) + unpack(d.rgb)) * 0.25, max(max(a.a, b.a), max(c.a, d.a)));
}`;

// Every pixel gathers a disc; a tap counts where its own blur (or this pixel's) reaches across the gap. The disc is
// then weighed as the largest blur found would fill it, and what the taps did not claim stays this pixel's own.
// Blur here is all foreground, so a larger radius is also nearer. Out: blurred light × its share, and the share.
const disc = (n) => Array.from({ length: n }, (_, i) => { const r = Math.sqrt((i + 0.5) / n); const a = i * 2.39996323; return `vec3(${(Math.cos(a) * r).toFixed(5)}, ${(Math.sin(a) * r).toFixed(5)}, ${r.toFixed(5)})`; }).join(', ');
const GATHER = (taps) => /* glsl */`
uniform sampler2D tPre; uniform vec2 uTexel; uniform float uRmax; uniform float uTop;
varying vec2 vUv;
const vec3 DISC[${taps}] = vec3[${taps}](${disc(taps)});
void main() {
  if (vUv.y > uTop) { gl_FragColor = vec4(0.0); return; }           // nothing above this line is out of focus
  vec4 c0 = textureLod(tPre, vUv, 0.0);
  float r0 = c0.a * uRmax;
  // Four turns of the same disc on a 2 × 2 grid; the tent in the last pass folds them into one disc four times as dense.
  vec2 par = mod(floor(gl_FragCoord.xy), 2.0); float rot = (par.x + 2.0 * par.y) * 0.6;
  mat2 turn = mat2(cos(rot), sin(rot), -sin(rot), cos(rot));
  vec3 acc = vec3(0.0); float K = 0.0; float Rk = r0;
  for (int i = 0; i < ${taps}; i++) {
    float r = DISC[i].z * uRmax;
    vec4 s = textureLod(tPre, vUv + turn * DISC[i].xy * uRmax * uTexel, 0.0);
    float rs = s.a * uRmax;
    float k = smoothstep(r - 0.6, r + 0.6, max(r0, rs));
    acc += s.rgb * k; K += k; Rk = max(Rk, rs * step(0.01, k));
  }
  float n = max(${taps}.0 * Rk * Rk / (uRmax * uRmax), K);
  vec3 col = (acc + c0.rgb * (n - K + 1.0)) / (n + 1.0);
  float amt = smoothstep(0.35, 1.3, Rk);                            // under about a pixel the sharp frame is the better picture
  gl_FragColor = vec4(col * amt, amt);
}`;

// First bloom level: the finished picture at half size (sharp under blurred), a quarter the size, highlights only.
const GLOW = /* glsl */`
uniform sampler2D tPre; uniform sampler2D tDof; uniform vec2 uTexel; uniform float uKnee;
varying vec2 vUv;
vec3 at(vec2 o) { vec4 d = texture2D(tDof, vUv + o * uTexel); return texture2D(tPre, vUv + o * uTexel).rgb * (1.0 - d.a) + d.rgb; }
void main() {
  vec3 c = (at(vec2(-1.0, -1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0)) + at(vec2(1.0, 1.0))) * 0.25;
  float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uKnee * 0.5, uKnee * 2.0, l);
  gl_FragColor = vec4(min(c, vec3(40.0)), 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4((texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25, 1.0);
}`;

const UP = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
    + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25;
  gl_FragColor = vec4(c + texture2D(tAdd, vUv).rgb, 1.0);
}`;

const FINAL = /* glsl */`
#include <common>
#include <tonemapping_pars_fragment>
uniform sampler2D tScene; uniform sampler2D tDof; uniform sampler2D tBloom;
uniform float uExposure; uniform float uBloom; uniform vec2 uRes; uniform float uFrameNo; uniform float uGrain; uniform float uSharp; uniform vec3 uGlare;
varying vec2 vUv;
${UNPACK}
float hash(vec2 p) {
  uvec2 q = uvec2(p) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 p = texture2D(tScene, vUv).rgb;
  if (uSharp > 0.0) {                       // the canvas is being stretched over more device pixels: give the edges back
    vec2 t = 1.0 / uRes;
    vec3 nb = (texture2D(tScene, vUv + vec2(t.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(t.x, 0.0)).rgb + texture2D(tScene, vUv + vec2(0.0, t.y)).rgb + texture2D(tScene, vUv - vec2(0.0, t.y)).rgb) * 0.25;
    p = clamp(p + (p - nb) * uSharp, 0.0, 0.995);
  }
  // sharp frame under the blurred layer; four taps half a texel out make a 3 × 3 tent of the half-size layer
  vec2 h = 1.0 / uRes;
  vec4 b = (texture2D(tDof, vUv + h * vec2(-1.0, -1.0)) + texture2D(tDof, vUv + h * vec2(1.0, -1.0)) + texture2D(tDof, vUv + h * vec2(-1.0, 1.0)) + texture2D(tDof, vUv + h * vec2(1.0, 1.0))) * 0.25;
  vec3 c = unpack(p) * (1.0 - b.a) + b.rgb;
  #ifdef BLOOM
    c += texture2D(tBloom, vUv).rgb * uBloom;
  #endif
  // natural falloff toward the corners, applied to scene light as a lens does it
  vec2 q = (vUv - 0.5) * vec2(uRes.x / max(uRes.x, uRes.y), uRes.y / max(uRes.x, uRes.y)); float r2 = dot(q, q);
  c *= 1.0 / pow(1.0 + r2 * 1.1, 2.0);
  // Veiling glare: the low sun in the lens lifts the shadows on its side of the frame, warm.
  c += vec3(1.0, 0.62, 0.34) * uGlare.z * exp(-2.2 * length((vUv - uGlare.xy) * vec2(uRes.x / uRes.y, 1.0)));
  // Colour is given back on scene light, where the tone curve can still fold it into the display's range: on display
  // light the same push empties the blue channel across the straw.
  c = max(mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.16), 0.0);
  c = AgXToneMapping(c * uExposure);
  // Grade, on display light: a touch more contrast than the flat AgX base, cool shadows under warm lights.
  c = pow(max(c, 0.0), vec3(1.2));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += vec3(-0.003, 0.0, 0.010) * (1.0 - smoothstep(0.0, 0.35, l));    // added, not multiplied: a multiply cannot lift an empty channel
  c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.955), smoothstep(0.1, 0.7, l));
  c = clamp(max(c, l * 0.06), 0.0, 1.0);                               // no channel falls to nothing next to a lit one
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // Grain: fine, strongest in the mid-tones, and it is the dither that keeps the sky from banding.
  vec2 gp = gl_FragCoord.xy + vec2(uFrameNo * 37.0, uFrameNo * 17.0);
  float g = hash(gp) + hash(gp + 91.7) - 1.0;
  c += g * (0.012 + 0.022 * (1.0 - abs(2.0 * l - 1.0))) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createPost(renderer, { low }) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const mk = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
  const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const scene = new THREE.WebGLRenderTarget(4, 4, { ...opts, type: THREE.UnsignedByteType, depthBuffer: true, samples: low ? 2 : 4 });
  const preRT = new THREE.WebGLRenderTarget(4, 4, opts); const dofRT = new THREE.WebGLRenderTarget(4, 4, opts);
  const LEVELS = low ? 0 : 4;                                   // bloom octaves, from a quarter of the frame down
  const downs = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(4, 4, opts));
  const ups = Array.from({ length: Math.max(0, LEVELS - 1) }, () => new THREE.WebGLRenderTarget(4, 4, opts));

  const pre = mk(PRE, { tScene: { value: scene.texture }, uTexel: { value: new THREE.Vector2() } });
  const gather = mk(GATHER(low ? 10 : 16), { tPre: { value: preRT.texture }, uTexel: { value: new THREE.Vector2() }, uRmax: { value: 4 }, uTop: { value: 1 } });
  const glow = mk(GLOW, { tPre: { value: preRT.texture }, tDof: { value: dofRT.texture }, uTexel: { value: new THREE.Vector2() }, uKnee: { value: 2.2 } });
  const down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const fin = mk(FINAL, {
    tScene: { value: scene.texture }, tDof: { value: dofRT.texture }, tBloom: { value: null }, uExposure: { value: 0.37 }, uBloom: { value: 0.12 }, uGlare: { value: new THREE.Vector3(0, 1, 0) },
    uRes: { value: new THREE.Vector2(1, 1) }, uFrameNo: { value: 0 }, uGrain: { value: 1 }, uSharp: { value: 0 }, toneMappingExposure: { value: 1 },
  }, low ? {} : { BLOOM: 1 });

  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, cam); };

  return {
    // crop: how much taller than wide the frame is (its blur is larger against its width). fill: canvas pixels per device pixel.
    setSize(w, h, crop = 1, fill = 1) {
      const hw = Math.max(2, w >> 1); const hh = Math.max(2, h >> 1);
      scene.setSize(w, h); preRT.setSize(hw, hh); dofRT.setSize(hw, hh);
      let bw = hw; let bh = hh;
      for (let i = 0; i < LEVELS; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); downs[i].setSize(bw, bh); if (i < LEVELS - 1) ups[i].setSize(bw, bh); }
      pre.uniforms.uTexel.value.set(1 / w, 1 / h);
      gather.uniforms.uTexel.value.set(1 / hw, 1 / hh); gather.uniforms.uRmax.value = LENS.max * w * crop * 0.5;
      glow.uniforms.uTexel.value.set(1 / hw, 1 / hh);
      fin.uniforms.uRes.value.set(w, h);
      // stretched pixels make coarse grain and soft edges: less of the one, a little unsharp mask for the other
      fin.uniforms.uGrain.value = Math.min(1, Math.max(0.35, fill * 1.6)); fin.uniforms.uSharp.value = fill < 0.95 ? 0.3 : 0;
    },
    setFocusTop(share) { gather.uniforms.uTop.value = share; },
    // Builds every program before the first frame, off the main thread where the driver can, so the page is not
    // frozen (and can scroll) while the shaders compile.
    compile(world, fore, camera) {
      if (!renderer.extensions.has('KHR_parallel_shader_compile')) return Promise.resolve();   // then the first frame compiles them, as before
      renderer.setRenderTarget(scene);
      const all = [renderer.compileAsync(world, camera), renderer.compileAsync(fore, camera)];
      for (const m of [pre, gather, glow, down, up, fin]) { quad.material = m; all.push(renderer.compileAsync(quad, cam)); }
      renderer.setRenderTarget(null);
      return Promise.all(all);
    },
    // the sun's place in the frame (uv) and how much of it reaches the lens, 0..1
    setSun(u, v, sunny) { fin.uniforms.uGlare.value.set(u, v, 0.1 * sunny); },
    // world: everything with depth; fore: the blades at the lens, already as wide as their blur.
    render(world, fore, camera, frameNo) {
      renderer.setRenderTarget(scene); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(world, camera);
      pass(pre, preRT); pass(gather, dofRT);
      renderer.autoClear = false; renderer.setRenderTarget(dofRT); renderer.render(fore, camera); renderer.autoClear = true;
      if (LEVELS) {
        pass(glow, downs[0]);
        let src = downs[0];
        for (let i = 1; i < LEVELS; i++) { down.uniforms.tSrc.value = src.texture; down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); pass(down, downs[i]); src = downs[i]; }
        for (let i = LEVELS - 2; i >= 0; i--) {
          up.uniforms.tSrc.value = src.texture; up.uniforms.tAdd.value = downs[i].texture; up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
          pass(up, ups[i]); src = ups[i];
        }
        fin.uniforms.tBloom.value = src.texture;
      }
      fin.uniforms.uFrameNo.value = frameNo % 1024;   // wrapped: hours in, the count would outgrow a float's whole numbers and the grain would coarsen
      pass(fin, null);
    },
    dispose() { [scene, preRT, dofRT, ...downs, ...ups].forEach((t) => t.dispose()); [pre, gather, glow, down, up, fin].forEach((m) => m.dispose()); tri.dispose(); },
  };
}
