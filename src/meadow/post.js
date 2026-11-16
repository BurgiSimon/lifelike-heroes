// The lens and the film: scene → depth of field → near-lens blades → bloom → tone curve, grade, vignette, grain.
// The scene target is multisampled half-float holding tone-compressed colour and the circle of confusion in alpha.
import * as THREE from 'three';
import { LENS } from './config.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Every pixel gathers a disc; a tap counts where its own blur (or this pixel's) reaches across the gap, and is
// replaced by the pixel's own colour where it does not. Blur here is all foreground, so a larger CoC is also nearer.
const DOF = /* glsl */`
uniform sampler2D tScene; uniform vec2 uTexel; uniform float uRmax; uniform float uTop;
varying vec2 vUv;
vec3 unpack(vec3 c) { return c / max(1e-3, 1.0 - max(c.r, max(c.g, c.b))); }
void main() {
  vec4 c0 = texture2D(tScene, vUv); vec3 col0 = unpack(c0.rgb);
  if (vUv.y > uTop) { gl_FragColor = vec4(col0, 1.0); return; }     // nothing above this line is out of focus
  float coc0 = c0.a * uRmax;
  float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  vec3 acc = col0;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) + 0.5; float r = sqrt(fi / float(TAPS)) * uRmax; float th = fi * 2.39996323 + rot;
    vec4 s = texture2D(tScene, vUv + vec2(cos(th), sin(th)) * r * uTexel);
    float k = smoothstep(r - 0.75, r + 0.75, max(coc0, s.a * uRmax));
    acc += mix(col0, unpack(s.rgb), k);
  }
  gl_FragColor = vec4(acc / float(TAPS + 1), 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  if (uKnee > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uKnee * 0.5, uKnee * 2.0, l); c = min(c, vec3(40.0)); }   // only real highlights glow
  gl_FragColor = vec4(c, 1.0);
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
uniform sampler2D tHdr; uniform sampler2D tBloom; uniform float uExposure; uniform float uBloom; uniform vec2 uRes; uniform float uFrameNo;
varying vec2 vUv;
float hash(vec2 p) {
  uvec2 q = uvec2(p) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = texture2D(tHdr, vUv).rgb;
  #ifdef BLOOM
    c += texture2D(tBloom, vUv).rgb * uBloom;
  #endif
  // natural falloff toward the corners, applied to scene light as a lens does it
  vec2 q = (vUv - 0.5) * vec2(uRes.x / max(uRes.x, uRes.y), uRes.y / max(uRes.x, uRes.y)); float r2 = dot(q, q);
  c *= 1.0 / pow(1.0 + r2 * 1.1, 2.0);
  c = AgXToneMapping(c * uExposure);
  // Grade, on display light: a touch more contrast and colour than the flat AgX base, warm lights over cool shadows.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, 0.0), vec3(1.2));
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.22);
  c *= mix(vec3(0.96, 1.0, 1.06), vec3(1.035, 1.0, 0.95), smoothstep(0.0, 0.6, l));
  c = clamp(c, 0.0, 1.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // Grain: fine, strongest in the mid-tones, and it is the dither that keeps the sky from banding.
  vec2 gp = gl_FragCoord.xy + vec2(uFrameNo * 37.0, uFrameNo * 17.0);
  float g = hash(gp) + hash(gp + 91.7) - 1.0;
  c += g * (0.012 + 0.022 * (1.0 - abs(2.0 * l - 1.0)));
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
  const scene = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthBuffer: true, samples: low ? 2 : 4 });
  const dofRT = new THREE.WebGLRenderTarget(4, 4, opts);
  const LEVELS = low ? 0 : 5;
  const downs = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(4, 4, opts));
  const ups = Array.from({ length: Math.max(0, LEVELS - 1) }, () => new THREE.WebGLRenderTarget(4, 4, opts));

  const dof = mk(DOF, { tScene: { value: scene.texture }, uTexel: { value: new THREE.Vector2() }, uRmax: { value: 4 }, uTop: { value: 1 } }, { TAPS: low ? 10 : 20 });
  const down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKnee: { value: 0 } });
  const up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const fin = mk(FINAL, { tHdr: { value: dofRT.texture }, tBloom: { value: null }, uExposure: { value: 0.37 }, uBloom: { value: 0.05 }, uRes: { value: new THREE.Vector2(1, 1) }, uFrameNo: { value: 0 }, toneMappingExposure: { value: 1 } }, low ? {} : { BLOOM: 1 });

  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, cam); };

  return {
    scene, final: fin,
    setSize(w, h, crop = 1) {
      scene.setSize(w, h); dofRT.setSize(w, h);
      let bw = w; let bh = h;
      for (let i = 0; i < LEVELS; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); downs[i].setSize(bw, bh); if (i < LEVELS - 1) ups[i].setSize(bw, bh); }
      dof.uniforms.uTexel.value.set(1 / w, 1 / h); dof.uniforms.uRmax.value = LENS.max * w * crop;
      fin.uniforms.uRes.value.set(w, h);
    },
    setFocusTop(share) { dof.uniforms.uTop.value = share; },
    // world: everything with depth; over: the blurred near-lens layer, drawn after the lens has done its work.
    render(world, over, camera, frameNo) {
      renderer.setRenderTarget(scene); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(world, camera);
      pass(dof, dofRT);
      if (over) { renderer.autoClear = false; renderer.setRenderTarget(dofRT); renderer.render(over, camera); renderer.autoClear = true; }
      if (LEVELS) {
        let src = dofRT;
        for (let i = 0; i < LEVELS; i++) {
          down.uniforms.tSrc.value = src.texture; down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); down.uniforms.uKnee.value = i === 0 ? 2.2 : 0;
          pass(down, downs[i]); src = downs[i];
        }
        for (let i = LEVELS - 2; i >= 0; i--) {
          up.uniforms.tSrc.value = src.texture; up.uniforms.tAdd.value = downs[i].texture; up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
          pass(up, ups[i]); src = ups[i];
        }
        fin.uniforms.tBloom.value = src.texture;
      }
      fin.uniforms.uFrameNo.value = frameNo;
      pass(fin, null);
    },
    dispose() { [scene, dofRT, ...downs, ...ups].forEach((t) => t.dispose()); [dof, down, up, fin].forEach((m) => m.dispose()); tri.dispose(); },
  };
}
