// The grass: tussocks of leaf blades and seed-headed stems, instanced. The camera never moves, so the field is
// planted for this one view: dense fine blades near the lens, fewer and wider toward the crest, sorted near to far
// once so the depth test rejects most hidden blades before they are shaded. All motion and all lighting happen in
// the vertex shader (a blade is one to three pixels wide; there is nothing for a fragment to add).
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { ground } from './terrain.js';
import { shared, LIGHT, WIND_GLSL, sward } from './glsl.js';
import { LENS, GROW, FADE, FORE, EYE, SUN } from './config.js';

export const BLADE_VERT = /* glsl */`
${LIGHT}
${WIND_GLSL}
attribute vec3 iRoot;     // where it stands
attribute vec4 iA;        // height, width, yaw, rest lean
attribute vec4 iB;        // phase, tone, dryness, kind (0 leaf, 1 stem with a seed head)
uniform float uPx; uniform float uFrame;
varying vec3 vCol; varying float vCoc;
#ifndef FLOWER
attribute vec4 iS;        // the sward's height 0.3, 0.9 and 2 m toward the sun, and here: it never changes, so it is planted, not computed
#endif
#ifdef RIBBON
varying vec3 vProf;
#endif
#ifdef FLOWER
attribute vec4 iLife;     // born, gone (s), unused, unused
uniform float uNow;
#endif

void main() {
  float t = position.y; float side = position.x;
  float h = iA.x; float w = iA.y; float ph = iB.x * 6.2831853; float kind = iB.w;
  float fade = 1.0;
  #ifdef FLOWER
    float age = clamp((uNow - iLife.x) / ${GROW.toFixed(2)}, 0.0, 1.0);
    float up0 = 1.0 - pow(1.0 - min(1.0, age / 0.7), 3.0);       // the stem rises first
    h *= max(up0, 0.001);
    fade = iLife.y > 0.0 ? clamp(1.0 - (uNow - iLife.y) / ${FADE.toFixed(2)}, 0.0, 1.0) : 1.0;
    h *= mix(0.2, 1.0, fade);
  #endif
  vec2 rdir = vec2(cos(iA.z), sin(iA.z));
  vec4 rclip = projectionMatrix * viewMatrix * vec4(iRoot, 1.0);
  float wl = weather(iRoot.xz, ph);
  float push = pushAt(rclip);
  float flex = mix(1.0, 0.8, kind) * (0.8 + 0.4 * iB.y);
  #ifdef FLOWER
    flex = 0.6; push *= 0.6;
  #endif
  vec2 lean = rdir * iA.w + WDIR * wl * flex + vec2(push, 0.0);
  // a stem spends its last four rings on the seed head
  float tt = kind > 0.5 ? (t < 0.43 ? t * 1.68 : 0.72 + (t - 0.4286) * 0.49) : t;
  vec3 T; vec3 P = iRoot + stemAt(tt, h, lean, T);
  vec3 toCam = cameraPosition - P; float dist = length(toCam); vec3 V = toCam / dist;

  float hd = clamp((tt - 0.72) / 0.28, 0.0, 1.0);
  float wp = kind > 0.5
    ? (0.42 + 2.1 * pow(sin(3.14159 * hd), 0.7)) * (1.0 - smoothstep(0.8, 1.0, hd))
    : mix(0.55, 1.0, smoothstep(0.0, 0.3, tt)) * (1.0 - pow(tt, 2.2));
  #ifdef FLOWER
    wp = 1.0 - 0.3 * tt;
  #endif
  // never thinner than a pixel and a bit: a sub-pixel blade only shimmers
  float minW = uPx * dist * 1.3 * (1.0 - pow(tt, 6.0));
  float halfW = 0.5 * max(w * wp, minW);

  vec3 sideT = vec3(-rdir.y, 0.0, rdir.x);
  vec3 sideC = normalize(cross(T, V));
  if (dot(sideT, sideC) < 0.0) sideT = -sideT;
  vec3 sdir = normalize(mix(sideT, sideC, 0.7));      // mostly turned to the lens, so no blade vanishes edge-on
  vec3 n = normalize(cross(sideT, T)); if (dot(n, V) < 0.0) n = -n;
  n = normalize(n + sideT * side * 0.45);             // a blade is a shallow gutter, not a flat strip

  // ---- light
  float up = tt * h;
  #ifdef FLOWER
    float sw = sward(iRoot.xz);
  #else
    float sw = iS.w;
  #endif
  float ao = mix(0.06, 1.0, smoothstep(0.0, 1.0, up / sw));           // the roots stand in each other's shade
  #ifdef RIBBON
    ao = mix(0.10, 1.0, smoothstep(0.1, 0.8, tt));                    // at the lens the blades are taller than any sward
  #endif
  #ifdef FLOWER
    float sunVis = swardSun(P, up + (iB.x - 0.5) * 0.12) * wordShadow(P);
  #else
    // swardSun() with its three looks toward the sun read from the instance: a third of this shader's cost otherwise
    float h0 = up + (iB.x - 0.5) * 0.12; float rise = uSun.y / length(uSun.xz);
    float sunVis = smoothstep(-0.10, 0.05, h0 + 0.3 * rise - iS.x) * smoothstep(-0.12, 0.06, h0 + 0.9 * rise - iS.y)
      * smoothstep(-0.14, 0.08, h0 + 2.0 * rise - iS.z) * wordShadow(P);
  #endif
  float dry = smoothstep(0.35, 0.8, clamp(iB.z + (tt - 0.5) * 0.35, 0.0, 1.0));
  vec3 green = mix(vec3(0.030, 0.070, 0.014), vec3(0.085, 0.13, 0.026), iB.y);
  vec3 straw = mix(vec3(0.30, 0.225, 0.085), vec3(0.47, 0.39, 0.18), iB.y);
  vec3 alb = mix(green, straw, dry);
  vec3 trn = mix(green * vec3(1.9, 2.3, 0.7), straw * vec3(1.15, 1.0, 0.75), dry);   // what a leaf lets through
  if (kind > 0.5 && tt > 0.7) { alb = mix(vec3(0.46, 0.37, 0.18), vec3(0.34, 0.20, 0.12), iB.y * iB.y); trn = alb * 1.7; }
  #ifdef FLOWER
    alb = vec3(0.05, 0.10, 0.02); trn = alb * vec3(1.8, 2.2, 0.7);
  #endif
  float ndl = dot(n, uSun);
  float lit = max(ndl * 0.8 + 0.2, 0.0); float through = max(-ndl * 0.85 + 0.15, 0.0);
  vec3 col = alb * (skyLight(n) * 0.55 + skyLight(-n) * 0.35) * ao;
  col += uSunCol * sunVis * (alb * lit + trn * through * 0.9);
  float fwd = pow(max(dot(V, -uSun), 0.0), 6.0);                       // toward the sun, thin things glow
  col += uSunCol * sunVis * trn * fwd * 0.6;
  // sheen: the waxy face mirrors the bright sky by the sun, far more where the wind lays the blade over
  vec3 hv = normalize(uSun + V);
  float laid = smoothstep(0.06, 0.55, abs(wl) * flex + abs(push));
  col += uSunCol * sunVis * pow(max(dot(n, hv), 0.0), 26.0) * (0.10 + 0.6 * laid) * tt;
  col += uHaze * (0.05 + 0.22 * sunVis) * laid * tt * tt * ao;

  float depth = -(viewMatrix * vec4(P, 1.0)).z;
  col *= min(1.0, 2.0 / max(max(col.r, max(col.g, col.b)), 1e-3));     // a glint may sparkle, not burn a star into the lens
  vCol = haze(col, dist);
  #ifdef RIBBON
    // Too near for the post blur: the blade is drawn as wide as its circle of confusion, as thin as a blurred
    // line really is (a line of width w through a disc of radius R peaks at 2w / (pi R)).
    float R = ${LENS.a.toFixed(6)} * abs(uLens.y / max(depth, 0.05) - 1.0) * uFrame * depth;
    vProf = vec3(side, min(1.0, 4.0 * halfW / (3.14159 * max(R, halfW))) * (kind > 0.5 && tt > 0.72 ? 0.6 : 1.0), tt);   // a seed head is half air
    halfW += R;
    vCoc = 1.0;
  #else
    vCoc = cocAt(depth);
  #endif
  P += sdir * side * halfW;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  #ifdef FLOWER
    if (fade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #endif
}`;

const BLADE_FRAG = /* glsl */`
vec3 pack(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
varying vec3 vCol; varying float vCoc;
#ifdef RIBBON
varying vec3 vProf;
#endif
void main() {
  #ifdef RIBBON
    float a = vProf.y * sqrt(max(0.0, 1.0 - vProf.x * vProf.x)) * (1.0 - smoothstep(0.82, 1.0, vProf.z));
    gl_FragColor = vec4(vCol * a, a);
  #else
    gl_FragColor = vec4(pack(vCol), vCoc);
  #endif
}`;

// One blade: a strip of rings, x = side (−1 / +1), y = 0..1 along it.
export function bladeGeometry(rings) {
  const pos = []; const idx = [];
  for (let k = 0; k <= rings; k++) { pos.push(-1, k / rings, 0, 1, k / rings, 0); }
  for (let k = 0; k < rings; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

export function bladeMaterial(defines = {}, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG, defines, uniforms: { ...shared, ...(extra.uniforms || {}) }, side: THREE.DoubleSide, ...(extra.params || {}) });
}

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Plants the field for a view: tanH is the half-width of the frame at unit distance, near the closest ground in view.
function plant({ tanH, near, count }) {
  const far = 33.5; const e = 0.7;                       // blades per metre of depth fall off as depth^-0.3
  const a = near ** e; const b = far ** e;
  const out = [];
  let i = 0; let guard = 0;
  while (out.length < count && guard++ < count * 6) {
    const id = i++ * 11;
    const d = (rnd(id) * (b - a) + a) ** (1 / e);
    const x = (rnd(id + 1) * 2 - 1) * (tanH * d + 1.2);
    const z = -d;
    // Thin patches and thick ones: a meadow is not sown evenly.
    const patch = 0.5 + 0.5 * Math.sin(x * 0.9 + 1.7 * Math.sin(z * 0.6 + 0.4)) * Math.sin(z * 0.75 + 1.2 * Math.sin(x * 0.5));
    if (rnd(id + 2) > 0.3 + 0.7 * smooth(0.15, 0.6, patch)) continue;
    const sw = sward(x, z);
    const dryPatch = 0.5 + 0.5 * Math.sin(x * 0.23 + z * 0.31 + 2.0) * Math.sin(x * 0.11 - z * 0.17);
    const stand = 0.5 + 0.5 * Math.sin(x * 0.47 + 1.4 * Math.sin(z * 0.33)) * Math.sin(z * 0.41 + 0.6);   // seed stems come in stands
    const tall = rnd(id + 3) < 0.02 + 0.24 * smooth(0.45, 0.85, stand);
    const dryC = Math.min(1, Math.max(0, 0.22 + 0.6 * dryPatch + (rnd(id + 4) - 0.5) * 0.5));
    const tone = rnd(id + 5);
    const n = 5 + Math.floor(rnd(id + 6) * 5);
    const y = ground(x, z);
    for (let k = 0; k < n && out.length < count; k++) {
      const q = id * 7 + k * 13;
      const yaw = rnd(q) * 6.2832; const r = 0.015 + 0.06 * rnd(q + 1);
      const stem = tall && k < 1 + Math.floor(rnd(q + 2) * 2.4);
      const hgt = stem ? sw * (1.3 + 0.65 * rnd(q + 3)) + 0.06 : sw * (0.4 + 0.8 * rnd(q + 3) ** 1.3);
      out.push({
        d, x: x + Math.cos(yaw) * r, y, z: z + Math.sin(yaw) * r,
        h: hgt, w: stem ? 0.0032 + 0.001 * rnd(q + 4) : 0.005 + 0.004 * rnd(q + 4),
        yaw, rest: stem ? 0.03 + 0.12 * rnd(q + 5) : 0.15 + 0.6 * rnd(q + 5) ** 1.5,
        ph: rnd(q + 6), tone: Math.min(1, Math.max(0, tone + (rnd(q + 7) - 0.5) * 0.3)), dry: Math.min(1, Math.max(0, dryC + (rnd(q + 8) - 0.5) * 0.35 + (stem ? 0.3 : 0))), kind: stem ? 1 : 0,
      });
    }
  }
  return out;
}

// The blades right at the lens, planted by where their tips should end in the frame: between its foot and a little
// under eye level, so they frame the field without crossing the word.
function plantFore({ tanH, tanBot, count }) {
  const eyeY = ground(0, 0) + EYE; const out = [];
  for (let c = 0; out.length < count && c < count; c++) {
    const id = c * 17 + 5;
    // tussocks, with open lanes between them to see the field through
    const d0 = 0.5 + (FORE - 0.4) * rnd(id) ** 0.8; const x0 = (rnd(id + 1) * 2 - 1) * (tanH * d0 + 0.4);
    const lane = Math.sin(x0 * 2.1 / Math.max(1, d0 * 0.6) + 1.0) * Math.sin(x0 * 0.9 + d0 * 1.7);
    if (lane < -0.25) continue;
    const stemmy = rnd(id + 2) < 0.16; const reach0 = rnd(id + 3); const tone = rnd(id + 8); const dryC = 0.15 + 0.6 * rnd(id + 9);
    const n = 4 + Math.floor(rnd(id + 4) * 7);
    for (let k = 0; k < n && out.length < count; k++) {
      const q = id * 5 + k * 29;
      const yaw = rnd(q) * 6.2832; const r = 0.02 + 0.1 * rnd(q + 1);
      const x = x0 + Math.cos(yaw) * r; const d = Math.max(0.42, d0 + Math.sin(yaw) * r); const z = -d;
      const y = ground(x, z); const foot = eyeY - tanBot * d;
      const stem = stemmy && k < 2;
      // share of the way from the frame's foot to eye level its tip reaches
      const up = stem ? 0.15 + 0.5 * (0.5 * reach0 + 0.5 * rnd(q + 3)) ** 1.3 : 0.02 + 0.4 * (0.6 * reach0 + 0.4 * rnd(q + 3)) ** 1.7;
      const h = Math.min(1.3, foot + (eyeY - foot) * up - y);
      if (h < 0.18) continue;
      out.push({
        d, x, y, z, h, w: stem ? 0.0034 : 0.0055 + 0.004 * rnd(q + 4), yaw,
        rest: stem ? 0.03 + 0.1 * rnd(q + 6) : 0.12 + 0.45 * rnd(q + 6) ** 1.5,
        ph: rnd(q + 7), tone: Math.min(1, Math.max(0, tone + (rnd(q + 5) - 0.5) * 0.3)), dry: Math.min(1, dryC + (rnd(q + 8) - 0.5) * 0.3 + (stem ? 0.3 : 0)), kind: stem ? 1 : 0,
      });
    }
  }
  return out;
}

function fill(geo, list) {
  const n = list.length; const root = new Float32Array(n * 3); const A = new Float32Array(n * 4); const B = new Float32Array(n * 4); const S = new Float32Array(n * 4);
  const sl = Math.hypot(SUN[0], SUN[2]); const sx = SUN[0] / sl; const sz = SUN[2] / sl;
  list.forEach((b, i) => {
    root.set([b.x, b.y, b.z], i * 3); A.set([b.h, b.w, b.yaw, b.rest], i * 4); B.set([b.ph, b.tone, b.dry, b.kind], i * 4);
    S.set([0.92 * sward(b.x + sx * 0.3, b.z + sz * 0.3), 0.92 * sward(b.x + sx * 0.9, b.z + sz * 0.9), 0.92 * sward(b.x + sx * 2, b.z + sz * 2), sward(b.x, b.z)], i * 4);
  });
  geo.setAttribute('iRoot', new THREE.InstancedBufferAttribute(root, 3));
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4));
  geo.setAttribute('iS', new THREE.InstancedBufferAttribute(S, 4));
  geo.instanceCount = n;
}

export function createGrass() {
  const nearGeo = bladeGeometry(7); const farGeo = bladeGeometry(3); const foreGeo = bladeGeometry(7);
  const mat = bladeMaterial();
  const foreMat = bladeMaterial({ RIBBON: 1 }, { params: { transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } });
  const near = new THREE.Mesh(nearGeo, mat); const far = new THREE.Mesh(farGeo, mat); const fore = new THREE.Mesh(foreGeo, foreMat);
  near.frustumCulled = far.frustumCulled = fore.frustumCulled = false; near.renderOrder = 1; far.renderOrder = 2;
  return {
    meshes: [near, far], fore,
    // Replant for a view. Cheap enough to do on a resize; the two detail levels are split by depth with a ragged
    // edge so no line shows where they meet.
    build(view) {
      const list = plant(view).sort((p, q) => p.d - q.d);
      const split = (b) => b.d < 9 + 3 * b.ph;
      fill(nearGeo, list.filter(split)); fill(farGeo, list.filter((b) => !split(b)));
      fill(foreGeo, plantFore({ ...view, count: view.fore }).sort((p, q) => q.d - p.d));   // far to near: they are blended
      return list.length;
    },
    dispose() { nearGeo.dispose(); farGeo.dispose(); foreGeo.dispose(); mat.dispose(); foreMat.dispose(); },
  };
}
