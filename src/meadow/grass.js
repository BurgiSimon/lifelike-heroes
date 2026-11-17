// The grass: tussocks of leaf blades, seed stalks of several species (some carrying spikelets or umbels as parts of
// their own) and broad-leaved herbs, instanced. The camera never moves, so the field is planted for this one view:
// dense fine blades near the lens, fewer and wider toward the crest, sorted near to far once so the depth test rejects
// most hidden blades before they are shaded. All motion and all lighting happen in the vertex shader (a blade is one
// to three pixels wide; there is little for a fragment to add).
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { ground } from './terrain.js';
import { LIGHT, PACK, WIND_GLSL, sward, bare } from './glsl.js';
import { LENS, GROW, FADE, FORE, EYE, SUN } from './config.js';

export const BLADE_VERT = /* glsl */`
${LIGHT}
${WIND_GLSL}
attribute vec3 iRoot;     // where it stands
attribute vec4 iA;        // height, width, yaw, rest lean (negative: the stalk has snapped and its top hangs)
attribute vec4 iB;        // phase, tone, dryness, kind: 0 leaf, 1 broad leaf; stalks: 2 foxtail, 3 plume, 4 sorrel, 5 plantain,
                          // 6 globe (dandelion clock, clover), 7 oat, 8 umbel; parts a stalk carries: 9 oat spikelet, 10 umbel ray
uniform float uPx; uniform float uFrame;
varying vec3 vCol; varying float vCoc; varying vec3 vHead;
#ifdef FLOWER
attribute vec4 iLife;     // born, gone (s), unused, unused
uniform float uNow;
#else
attribute vec4 iS;        // the sward's height 0.3, 0.9 and 2 m toward the sun, and here: it never changes, so it is planted, not computed
attribute vec4 iC;        // a part: where on its stalk it is set (0..1), its reach, the way it points, its rise (m). A plant: 0, 0, 0, hue
#endif
#ifdef RIBBON
varying vec3 vProf;
#endif

void main() {
  float t = position.y; float side = position.x;
  float h = iA.x; float w = iA.y; float ph = iB.x * 6.2831853; float kind = iB.w;
  bool broad = kind > 0.5 && kind < 1.5; bool stem = kind > 1.5; bool part = kind > 8.5;
  float own = fract(iB.x * 7.31);                                    // a second number of the plant's own
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
  float flex = (stem ? 0.8 : broad ? 0.45 : 1.0) * (0.8 + 0.4 * iB.y);
  #ifdef FLOWER
    flex = 0.6; push *= 0.6;
  #endif
  // Flutter: quick and small, partly across the wind, livelier inside a gust.
  float fl = uWind * (0.012 + 0.4 * abs(wl)) * sin(uTime * 9.0 + ph * 7.0 + iRoot.x * 3.1);
  vec2 lean = rdir * abs(iA.w) + (WDIR * (wl + 0.4 * fl) + vec2(-WDIR.y, WDIR.x) * 0.6 * fl) * flex + vec2(push, 0.0);

  // Seed heads by species: length and half-width in metres, and how far the top bows over.
  float hl = 0.0; float hw = 0.0; float nod = 0.0; float big = mix(0.65, 1.35, own);
  if (stem) {
    if (kind < 2.5) { hl = 0.075 * big; hw = 0.0042; nod = 0.03; }                   // foxtail, timothy: a tight cylinder
    else if (kind < 3.5) { hl = 0.12 * big; hw = 0.006 * big; nod = 0.05; }          // Yorkshire fog, bents: a soft plume
    else if (kind < 4.5) { hl = 0.22 * big; hw = 0.010; }                            // sorrel: a rusty tower
    else if (kind < 5.5) { hl = 0.024 * big; hw = 0.0045; }                          // plantain: a dark bud on a bare stalk
    else if (kind < 6.5) { hl = 2.0 * w; hw = w; }                                   // a globe of the radius given: a dandelion clock, a clover
    else if (kind < 7.5 || (part && kind < 9.5)) nod = 0.22;                         // oat: bare and bowed over (its spikelets ride the same curve)
  }
  // a stalk spends its last four rings on its head
  float hs = hl > 0.0 ? max(0.3, 1.0 - hl / max(h, 0.01)) : 1.0;
  float tt = hl > 0.0 ? (t < 0.4286 ? t * hs * 2.3333 : hs + (t - 0.4286) * (1.0 - hs) * 1.75) : t;
  float hd = hl > 0.0 ? clamp((tt - hs) / (1.0 - hs), 0.0, 1.0) : 0.0;
  vec3 T; vec3 P;
  #ifdef FLOWER
    P = iRoot + stemAt(tt, h, lean, 0.0, T);
  #else
    P = iRoot + stemAt(part ? iC.x : tt, h, lean, nod, T);
    if (part) {
      // a short curve of its own from that point of the stalk: an umbel's ray goes straight out and up; a spikelet
      // goes out on a hair, then hangs, and trails and trembles in the wind
      vec3 cd = vec3(cos(iC.z), 0.0, sin(iC.z));
      vec3 e2 = cd * iC.y + vec3(0.0, iC.w, 0.0); vec3 e1 = e2 * vec3(0.3, 0.55, 0.3);
      if (kind < 9.5) { e1 = cd * iC.y + vec3(0.0, 0.4 * iC.y, 0.0); e2.xz -= WDIR * (1.2 * wl + 4.0 * fl) * iC.w; }
      T = normalize(2.0 * (1.0 - t) * e1 + 2.0 * t * (e2 - e1));
      P += 2.0 * t * (1.0 - t) * e1 + t * t * e2;
      tt = t;
    } else if (iA.w < 0.0 && tt > 0.3 + 0.35 * own) {
      vec3 Tb; vec3 Pb = iRoot + stemAt(0.3 + 0.35 * own, h, lean, 0.0, Tb);
      T = normalize(vec3(rdir.x, -0.5 - own, rdir.y)); P = Pb + T * (tt - 0.3 - 0.35 * own) * h;
    }
  #endif
  vec3 toCam = cameraPosition - P; float dist = length(toCam); vec3 V = toCam / dist;

  // ---- outline
  float wide = w * mix(0.55, 1.0, smoothstep(0.0, 0.3, tt)) * (1.0 - pow(tt, 2.2));                    // a leaf blade
  // Never thinner than a pixel and a bit: a sub-pixel blade only shimmers. Far off, where that is several blades'
  // width, the top is let go thin instead, so the crest is a soft edge and not a row of reeds.
  float thin = 1.0 - pow(tt, mix(6.0, 1.1, smoothstep(13.0, 24.0, dist)));
  float head = 0.0;                                                                                    // how much of a seed head this point is
  if (broad) wide = w * (0.14 + 0.86 * pow(sin(3.14159 * pow(tt, 0.62)), 1.2)) * (1.0 - pow(tt, 6.0));
  else if (part) {
    if (kind < 9.5) { float k = clamp((t - 0.42) / 0.58, 0.0, 1.0); wide = w * pow(sin(3.14159 * k), 0.8); head = step(0.001, k); thin = 0.6 * head; }   // the hair it hangs on is too fine to see
    else { wide = max(0.0008, w * pow(sin(2.6 * clamp((t - 0.7) / 0.3, 0.0, 1.0)), 0.7)); thin = 0.55; }                                                // a thin ray, a knot of florets at its end
  } else if (stem) {
    float x = 2.0 * hd - 1.0;
    float prof = kind < 2.5 ? pow(sin(3.14159 * hd), 0.35) : kind < 3.5 ? pow(sin(3.14159 * pow(hd, 0.8)), 0.6) * (1.0 - 0.35 * hd)
      : kind < 4.5 ? pow(sin(3.14159 * pow(hd, 0.75)), 0.8) : kind < 5.5 ? pow(sin(3.14159 * hd), 0.5) : sqrt(max(0.0, 1.0 - x * x));
    wide = max((kind > 5.5 && kind < 6.5 ? 0.0028 : w) * (1.0 - 0.5 * tt) * (1.0 - smoothstep(0.8, 1.0, hd)), 2.0 * hw * prof);
    head = smoothstep(0.0, 0.12, hd);
  }
  #ifdef FLOWER
    wide = w * (1.0 - 0.3 * tt);
  #endif
  float halfW = 0.5 * max(wide, uPx * dist * 1.3 * thin);
  vHead = vec3(side, head, hd + t * float(part));

  vec3 sideT = vec3(-rdir.y, 0.0, rdir.x);
  vec3 sideC = normalize(cross(T, V));
  if (dot(sideT, sideC) < 0.0) sideT = -sideT;
  vec3 sdir = normalize(mix(sideT, sideC, broad ? 0.25 : 0.7));   // mostly turned to the lens, so no blade vanishes edge-on
  vec3 n = normalize(cross(sideT, T)); if (dot(n, V) < 0.0) n = -n;
  n = normalize(n + sideT * side * 0.45);             // a blade is a shallow gutter, not a flat strip

  // ---- light
  float up = max(P.y - iRoot.y, 0.0);
  #ifdef FLOWER
    float sw = sward(iRoot.xz); float hue = 0.5;
  #else
    float sw = iS.w; float hue = iC.w;
  #endif
  // The roots stand in each other's shade; the sky still finds its way down, so the shade is blue-green, not black.
  float ao = mix(0.18, 1.0, smoothstep(0.0, 1.0, up / sw));
  float shade = 1.0;
  #ifdef RIBBON
    ao = mix(0.04, 1.0, smoothstep(0.05, 0.62, tt));                  // at the lens the blades are taller than any sward
    shade = iS.w;                                                     // and each tussock stands in its neighbours' shade its own way
  #endif
  #ifdef FLOWER
    float sunVis = swardSun(P, up + (iB.x - 0.5) * 0.12) * wordShadow(P);
  #else
    // swardSun() with its three looks toward the sun read from the instance: a third of this shader's cost otherwise
    float h0 = up + (iB.x - 0.5) * 0.12; float rise = uSun.y / length(uSun.xz);
    float sunVis = smoothstep(-0.10, 0.05, h0 + 0.3 * rise - iS.x) * smoothstep(-0.12, 0.06, h0 + 0.9 * rise - iS.y)
      * smoothstep(-0.14, 0.08, h0 + 2.0 * rise - iS.z) * wordShadow(P) * shade;
  #endif
  sunVis *= cloudSun(iRoot.xz);
  float dry = smoothstep(0.35, 0.8, clamp(iB.z + (tt - 0.5) * 0.35, 0.0, 1.0));
  vec3 green = broad ? mix(vec3(0.022, 0.060, 0.024), vec3(0.050, 0.110, 0.036), iB.y) : mix(vec3(0.030, 0.070, 0.030), vec3(0.085, 0.13, 0.05), iB.y);
  green *= mix(vec3(0.78, 1.0, 1.35), vec3(1.25, 1.05, 0.6), hue);                    // from a blue-green fog grass to a yellow-green fescue
  vec3 straw = mix(vec3(0.30, 0.225, 0.12), vec3(0.47, 0.39, 0.22), iB.y);
  vec3 alb = mix(green, straw, dry);
  vec3 trn = mix(green * vec3(1.9, 2.3, 0.7), straw * vec3(0.9, 0.7, 0.4), dry);     // what it lets through: a green leaf glows, straw goes gold
  if (part) {
    if (kind < 9.5) { alb = mix(vec3(0.26, 0.31, 0.14), vec3(0.50, 0.41, 0.23), iB.z); trn = alb * 2.0; }               // thin glumes: they light up
    else { float f = smoothstep(0.66, 0.8, t); alb = mix(green * 0.7, vec3(0.38, 0.38, 0.33), f); trn = mix(green * 0.4, alb * 1.1, f); }
  } else if (head > 0.0) {
    vec3 hc = kind < 2.5 ? mix(vec3(0.15, 0.20, 0.10), vec3(0.42, 0.34, 0.19), iB.z)            // foxtail: grey-green, straw once it has set seed
      : kind < 3.5 ? mix(vec3(0.27, 0.21, 0.19), vec3(0.44, 0.38, 0.26), iB.y)                  // fog: dusky pink to buff
      : kind < 4.5 ? mix(vec3(0.19, 0.075, 0.05), vec3(0.11, 0.05, 0.04), iB.y)                 // sorrel
      : kind < 5.5 ? mix(vec3(0.05, 0.04, 0.03), vec3(0.50, 0.47, 0.36), smoothstep(0.25, 0.4, hd) * smoothstep(0.75, 0.55, hd) * abs(side))   // plantain: dark, ringed with pale anthers
      : w > 0.016 ? vec3(0.27, 0.27, 0.26) : mix(vec3(0.42, 0.40, 0.34), vec3(0.40, 0.12, 0.24), step(0.3, iB.y));     // a clock; white clover or red
    alb = mix(alb, hc, head); trn = mix(trn, hc * (kind < 3.5 ? 1.25 : kind < 5.5 ? 0.6 : w > 0.016 ? 2.4 : 1.2), head);
  }
  #ifdef FLOWER
    alb = vec3(0.05, 0.10, 0.03); trn = alb * vec3(1.8, 2.2, 0.7);
  #endif
  float ndl = dot(n, uSun);
  float lit = max(ndl * 0.8 + 0.2, 0.0); float through = max(-ndl * 0.85 + 0.15, 0.0);
  vec3 col = alb * (skyLight(n) * 0.55 + skyLight(-n) * 0.35) * ao * mix(0.55, 1.0, shade);
  col += uSunCol * sunVis * (alb * lit + trn * through * 0.9);
  float fwd = pow(max(dot(V, -uSun), 0.0), 6.0);                       // toward the sun, thin things glow
  col += uSunCol * sunVis * trn * fwd * 1.1;
  // sheen: the waxy face mirrors the bright sky by the sun, far more where the wind lays the blade over
  vec3 hv = normalize(uSun + V);
  float laid = smoothstep(0.06, 0.55, abs(wl) * flex + abs(push));
  col += uSunCol * sunVis * pow(max(dot(n, hv), 0.0), 26.0) * (0.10 + 0.6 * laid) * tt;
  col += uHaze * (0.05 + 0.22 * sunVis) * laid * tt * tt * ao;

  float depth = -(viewMatrix * vec4(P, 1.0)).z;
  col *= min(1.0, mix(2.0, 3.2, tt) / max(max(col.r, max(col.g, col.b)), 1e-3));     // a tip may burn in the backlight, not turn into a lamp
  vCol = haze(col, dist);
  #ifdef RIBBON
    // Too near for the post blur: the blade is drawn as wide as its circle of confusion, as thin as a blurred
    // line really is (a line of width w through a disc of radius R peaks at 2w / (pi R)).
    float R = ${LENS.a.toFixed(6)} * abs(uLens.y / max(depth, 0.05) - 1.0) * uFrame * depth * (0.75 + 0.5 * iB.x);
    vProf = vec3(side, min(1.0, 4.0 * halfW / (3.14159 * max(R, halfW))) * mix(1.0, 0.6, head), tt);   // a seed head is half air
    halfW += R;
    vCoc = 1.0;
  #else
    vCoc = cocAt(depth);
  #endif
  P += sdir * side * halfW;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  #ifdef FLOWER
    if (fade <= 0.0 || h <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #endif
}`;

const BLADE_FRAG = /* glsl */`
${PACK}
varying vec3 vCol; varying float vCoc; varying vec3 vHead;     // across the blade −1..1, how much of a seed head, along the head
#ifdef RIBBON
varying vec3 vProf;
#endif
void main() {
  // A seed head is dense down its middle and fringed with awns: against the light the core stays dark and the rim
  // glows; its spikelets sit in rows.
  float e = vHead.x * vHead.x;
  vec3 col = vCol * mix(1.0, (0.42 + 1.25 * e * e) * (0.88 + 0.12 * sin(vHead.z * 50.0 + abs(vHead.x) * 4.0)), vHead.y);
  #ifdef RIBBON
    float a = vProf.y * sqrt(max(0.0, 1.0 - vProf.x * vProf.x)) * (1.0 - smoothstep(0.82, 1.0, vProf.z));
    gl_FragColor = vec4(col * a, a);      // straight onto the blurred layer: scene light, premultiplied
  #else
    gl_FragColor = vec4(pack(col), vCoc);
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

export function bladeMaterial(shared, defines = {}, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG, defines, uniforms: { ...shared, ...(extra.uniforms || {}) }, side: THREE.DoubleSide, ...(extra.params || {}) });
}

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const LEAF = 0; const BROAD = 1; const FOXTAIL = 2; const PLUME = 3; const SORREL = 4; const PLANTAIN = 5; const GLOBE = 6; const OAT = 7; const UMBEL = 8; const SPIKELET = 9; const RAY = 10;
const PARTS_TO = 13;     // m: past this a spikelet is under a pixel, so nothing carries parts and an oat is planted as a plume

// Plants the field for a view: tanH is the half-width of the frame at unit distance, near the closest ground in view.
// ponytail: builds one object per blade and sorts them (about 0.1 s for 80k); replants are debounced, so it is one hitch per resize.
function plant({ tanH, near, count }) {
  const far = 33.5; const e = 0.7;                       // blades per metre of depth fall off as depth^-0.3
  const a = near ** e; const b = far ** e;
  const out = [];
  // c0..c3: for a part [where on its stalk, reach, the way it points, rise], for a plant its hue in c3
  const put = (d, x, y, z, h, w, yaw, rest, ph, tone, dry, kind, c0, c1, c2, c3) => { out.push({ d, x, y, z, h, w, yaw, rest, ph, tone, dry, kind, c0, c1, c2, c3, s: 0 }); };
  let i = 0; let guard = 0;
  while (out.length < count && guard++ < count * 6) {
    const id = i++ * 31;
    const d = (rnd(id) * (b - a) + a) ** (1 / e);
    const x = (rnd(id + 1) * 2 - 1) * (tanH * d + 1.2);
    const z = -d;
    // The field begins raggedly: nearer than this the blades belong to the foreground layer.
    if (d < near + 1.2 && rnd(id + 10) > smooth(near - 0.2, near + 1.2, d)) continue;
    // Thin patches and thick ones, and a few worn spots: a meadow is not sown evenly.
    const patch = 0.5 + 0.5 * Math.sin(x * 0.9 + 1.7 * Math.sin(z * 0.6 + 0.4)) * Math.sin(z * 0.75 + 1.2 * Math.sin(x * 0.5));
    const worn = bare(x, z) * smooth(17, 11, d);
    if (rnd(id + 2) > (0.3 + 0.7 * smooth(0.15, 0.6, patch)) * (1 - 0.88 * worn)) continue;
    const sw = sward(x, z);
    const dryPatch = 0.5 + 0.5 * Math.sin(x * 0.23 + z * 0.31 + 2.0) * Math.sin(x * 0.11 - z * 0.17);
    const stand = 0.5 + 0.5 * Math.sin(x * 0.47 + 1.4 * Math.sin(z * 0.33)) * Math.sin(z * 0.41 + 0.6);
    const herbs = 0.5 + 0.5 * Math.sin(x * 0.37 + 1.9 * Math.sin(z * 0.29)) * Math.sin(z * 0.33 + 0.7 + 1.3 * Math.sin(x * 0.21));
    const zone = 0.5 + 0.5 * Math.sin(x * 0.21 + 1.6 * Math.sin(z * 0.17 + 2.0)) * Math.sin(z * 0.26 - 0.8 * Math.sin(x * 0.15) + 0.5);
    // Seed stalks come in stands with open sward between them, and few right at the lens, where they would wall the field off.
    const tall = rnd(id + 3) < (0.02 + 0.5 * smooth(0.58, 0.85, stand)) * (0.18 + 0.82 * smooth(2.5, 9, d));
    // Which grass leads here: oats on one side of the field, fog on another, foxtail between and among both; sorrel keeps to its own corners.
    const pick = rnd(id + 12);
    let head = pick < 0.15 + 0.6 * smooth(0.55, 0.75, zone) ? OAT : pick > 0.85 - 0.6 * smooth(0.45, 0.25, zone) ? PLUME : FOXTAIL;
    if (herbs < 0.13 && rnd(id + 14) < 0.6) head = SORREL;
    if (head === OAT && d > PARTS_TO) head = PLUME;
    const herb = !tall && d < 16 && rnd(id + 9) < 0.02 + 0.2 * smooth(0.55, 0.9, herbs);                  // dock and plantain
    const dead = !herb && rnd(id + 11) < 0.035 + 0.5 * worn;                                              // last year's tussock, laid over
    const dryC = dead ? 1 : clamp01(0.22 + 0.6 * dryPatch + (rnd(id + 4) - 0.5) * 0.5);
    const tone = rnd(id + 5); const hue = clamp01(0.5 + (zone - 0.5) * 0.8 + (rnd(id + 15) - 0.5) * 0.7);
    const n = herb ? 3 + Math.floor(rnd(id + 6) * 4) : 5 + Math.floor(rnd(id + 6) * 5);
    const y = ground(x, z);
    for (let k = 0; k < n && out.length < count; k++) {
      const q = id * 11 + k * 13;
      const yaw = rnd(q) * 6.2832; const r = 0.015 + 0.06 * rnd(q + 1);
      const bx = x + Math.cos(yaw) * r; const bz = z + Math.sin(yaw) * r; const ph = rnd(q + 6); const tn = clamp01(tone + (rnd(q + 7) - 0.5) * 0.3);
      if (herb) {
        // broad leaves low in the sward; a plantain sends a few bare stalks up through them, each with its dark bud
        if (k < 2 && rnd(id + 16) < 0.5) put(d, bx, y, bz, sw * (0.7 + 0.5 * rnd(q + 3)) + 0.05, 0.0022, yaw, 0.04 + 0.2 * rnd(q + 5), ph, tn, 0.3, PLANTAIN, 0, 0, 0, hue);
        else put(d, bx, y, bz, (0.10 + 0.2 * rnd(q + 3)) * (0.6 + sw), 0.014 + 0.016 * rnd(q + 4), yaw, 0.45 + 0.65 * rnd(q + 5), ph, tn, 0.12 * rnd(q + 8), BROAD, 0, 0, 0, hue);
      } else if (tall && !dead && k < 1 + Math.floor(rnd(q + 2) * 2.4)) {
        const hgt = sw * (1.0 + 1.1 * rnd(q + 3) ** 2 + (head === SORREL ? 0.2 : head === OAT ? 0.45 : 0)) + 0.06;
        // some stands have set seed, some are still green; one stalk in ten is last year's, bleached and leaning any way, a few are snapped
        const old = rnd(q + 9);
        const dry = old < 0.1 ? 1 : clamp01(dryC + (rnd(q + 8) - 0.5) * 0.35 + 0.05 + 0.35 * rnd(id + 13));
        let rest = old < 0.1 ? 0.4 + 0.6 * rnd(q + 5) : 0.03 + 0.14 * rnd(q + 5);
        if (old > 0.94 && head !== OAT) rest = -rest;
        put(d, bx, y, bz, hgt, head === SORREL ? 0.0042 : 0.0026 + 0.001 * rnd(q + 4), yaw, rest, ph, tn, dry, head, 0, 0, 0, hue);
        if (head === OAT) {
          const m = 6 + Math.floor(rnd(q + 10) * 5);
          for (let j = 0; j < m; j++) {
            const p = id * 11 + 140 + (k * 11 + j) * 6; const at = 0.66 + 0.33 * (j + rnd(p)) / m;
            put(d, bx, y, bz, hgt, 0.003 + 0.0015 * rnd(p + 1), yaw, rest, ph, tn, dry, SPIKELET, at, 0.01 + 0.03 * rnd(p + 2) * (1.3 - at), yaw + (rnd(p + 3) - 0.5) * 3.2, -0.018 - 0.028 * rnd(p + 4));
          }
        }
      } else {
        put(d, bx, y, bz, sw * (0.4 + 0.8 * rnd(q + 3) ** 1.3) * (dead ? 0.8 : 1), 0.005 + 0.004 * rnd(q + 4), yaw,
          dead ? 0.8 + 0.4 * rnd(q + 5) : 0.15 + 0.6 * rnd(q + 5) ** 1.5, ph, tn, clamp01(dryC + (rnd(q + 8) - 0.5) * 0.35), LEAF, 0, 0, 0, hue);
      }
    }
    // The odd plant among the grass: a dandelion gone to seed, clover where the sward is short, cow parsley among the herbs.
    if (tall || herb || dead || d > PARTS_TO) continue;
    const odd = rnd(id + 17); const yaw = rnd(id + 18) * 6.2832; const ph = rnd(id + 19); const tn = rnd(id + 20);
    if (odd < 0.006) put(d, x, y, z, sw * (0.95 + 0.3 * rnd(id + 21)) + 0.04, 0.019 + 0.006 * rnd(id + 22), yaw, 0.04 + 0.1 * rnd(id + 23), ph, tn, 0, GLOBE, 0, 0, 0, hue);
    else if (odd < 0.006 + 0.05 * smooth(0.42, 0.3, sw)) put(d, x, y, z, sw * (0.6 + 0.4 * rnd(id + 21)), 0.010 + 0.004 * rnd(id + 22), yaw, 0.05 + 0.2 * rnd(id + 23), ph, tn, 0, GLOBE, 0, 0, 0, hue);
    else if (d > 3.5 && odd > 1 - 0.008 * smooth(0.5, 0.8, herbs)) {
      const hgt = sw * (1.5 + 0.8 * rnd(id + 21)) + 0.15; const rest = 0.03 + 0.08 * rnd(id + 23);
      put(d, x, y, z, hgt, 0.0042, yaw, rest, ph, tn, 0.1, UMBEL, 0, 0, 0, hue);
      // the umbel at the top and a few on side branches, each seven rays to seven knots of white
      for (let u = 0, heads = 2 + Math.floor(rnd(id + 22) * 3); u < heads; u++) {
        const p = id * 11 + 140 + u * 50;
        const at = u ? 0.62 + 0.3 * rnd(p) : 1; const az = rnd(p + 1) * 6.2832; const off = u ? 0.05 + 0.09 * rnd(p + 2) : 0; const lift = u ? 0.06 + 0.1 * rnd(p + 3) : 0.035;
        const R = 0.022 + 0.02 * rnd(p + 4);
        for (let j = 0; j < 7; j++) {
          const ja = j * 2.4 + rnd(p + 5 + j); const jr = R * Math.sqrt((j + 0.5) / 7);
          const vx = Math.cos(az) * off + Math.cos(ja) * jr; const vz = Math.sin(az) * off + Math.sin(ja) * jr;
          put(d, x, y, z, hgt, 0.008 + 0.005 * rnd(p + 12 + j), yaw, rest, ph, tn, 0, RAY, at, Math.hypot(vx, vz), Math.atan2(vz, vx), lift + 0.012 * (1 - (jr / R) ** 2));
        }
      }
    }
  }
  return out;
}

// The blades right at the lens, planted by where their tips should end in the frame: between its foot and a little
// under eye level, so they frame the field without crossing the word.
function plantFore({ tanH, tanBot, count }) {
  const eyeY = ground(0, 0) + EYE; const out = [];
  for (let c = 0; out.length < count && c < count * 3; c++) {
    const id = c * 17 + 5;
    // tussocks, with open lanes between them to see the field through
    const d0 = 0.5 + (FORE - 0.4) * rnd(id) ** 0.8; const x0 = (rnd(id + 1) * 2 - 1) * (tanH * d0 + 0.4);
    const lane = Math.sin(x0 * 2.1 / Math.max(1, d0 * 0.6) + 1.0) * Math.sin(x0 * 0.9 + d0 * 1.7);
    if (lane < 0.0) continue;
    const stemmy = rnd(id + 2) < 0.1; const reach0 = rnd(id + 3); const tone = rnd(id + 8); const dryC = 0.6 * rnd(id + 9) ** 2.2;                 // green leaves, mostly: the straw is in the stems
    const shade = 0.1 + 0.9 * rnd(id + 10) ** 3;          // most stand in the shade of the ones toward the sun; a few catch it whole
    const n = 4 + Math.floor(rnd(id + 4) * 7);
    for (let k = 0; k < n && out.length < count; k++) {
      const q = id * 5 + k * 29;
      const yaw = rnd(q) * 6.2832; const r = 0.02 + 0.1 * rnd(q + 1);
      const x = x0 + Math.cos(yaw) * r; const d = Math.max(0.42, d0 + Math.sin(yaw) * r); const z = -d;
      const y = ground(x, z); const foot = eyeY - tanBot * d;
      const stem = stemmy && k < 2;
      // share of the way from the frame's foot to eye level its tip reaches
      const up = stem ? 0.15 + 0.45 * (0.5 * reach0 + 0.5 * rnd(q + 3)) ** 1.4 : 0.04 + 0.4 * (0.6 * reach0 + 0.4 * rnd(q + 3)) ** 1.6;
      const h = Math.min(1.3, foot + (eyeY - foot) * up - y);
      if (h < 0.18) continue;
      out.push({
        d, x, y, z, h, w: stem ? 0.0034 : 0.0055 + 0.004 * rnd(q + 4), yaw,
        rest: stem ? 0.03 + 0.1 * rnd(q + 6) : 0.12 + 0.45 * rnd(q + 6) ** 1.5,
        ph: rnd(q + 7), tone: clamp01(tone + (rnd(q + 5) - 0.5) * 0.3), dry: clamp01(dryC + (rnd(q + 8) - 0.5) * 0.3 + (stem ? 0.3 : 0)), kind: stem ? (rnd(id + 11) < 0.5 ? FOXTAIL : PLUME) : LEAF,
        c0: 0, c1: 0, c2: 0, c3: rnd(id + 12),
        s: clamp01(shade * (0.8 + 0.4 * rnd(q + 9))),
      });
    }
  }
  return out;
}

const ATTRS = [['iRoot', 3], ['iA', 4], ['iB', 4], ['iS', 4], ['iC', 4]];
// The instance buffers are made once, at the most a build can ask for: three fixes a geometry's instance ceiling
// at its first draw, so growing them later would silently drop the farthest blades.
function alloc(geo, cap) {
  for (const [name, size] of ATTRS) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); }
  geo.instanceCount = 0;
}
function write(geo, list, ribbon) {
  const at = geo.attributes; const n = Math.min(list.length, at.iRoot.count);
  const R = at.iRoot.array; const A = at.iA.array; const B = at.iB.array; const S = at.iS.array; const C = at.iC.array;
  const sl = Math.hypot(SUN[0], SUN[2]); const sx = SUN[0] / sl; const sz = SUN[2] / sl;
  for (let i = 0; i < n; i++) {
    const b = list[i]; const j = i * 4;
    R[i * 3] = b.x; R[i * 3 + 1] = b.y; R[i * 3 + 2] = b.z;
    A[j] = b.h; A[j + 1] = b.w; A[j + 2] = b.yaw; A[j + 3] = b.rest;
    B[j] = b.ph; B[j + 1] = b.tone; B[j + 2] = b.dry; B[j + 3] = b.kind;
    C[j] = b.c0; C[j + 1] = b.c1; C[j + 2] = b.c2; C[j + 3] = b.c3;
    S[j] = 0.92 * sward(b.x + sx * 0.3, b.z + sz * 0.3); S[j + 1] = 0.92 * sward(b.x + sx * 0.9, b.z + sz * 0.9); S[j + 2] = 0.92 * sward(b.x + sx * 2, b.z + sz * 2);
    S[j + 3] = ribbon ? b.s : sward(b.x, b.z);
  }
  for (const [name, size] of ATTRS) { const a = at[name]; a.clearUpdateRanges(); a.addUpdateRange(0, n * size); a.needsUpdate = true; }
  geo.instanceCount = n;
}

// max: the most blades and foreground blades any build will ask for.
export function createGrass(shared, max) {
  const nearGeo = bladeGeometry(7); const farGeo = bladeGeometry(3); const foreGeo = bladeGeometry(7);
  alloc(nearGeo, Math.ceil(max.count * 0.7)); alloc(farGeo, Math.ceil(max.count * 0.85)); alloc(foreGeo, max.fore);
  const mat = bladeMaterial(shared);
  const foreMat = bladeMaterial(shared, { RIBBON: 1 }, { params: { transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } });
  const near = new THREE.Mesh(nearGeo, mat); const far = new THREE.Mesh(farGeo, mat); const fore = new THREE.Mesh(foreGeo, foreMat);
  near.frustumCulled = far.frustumCulled = fore.frustumCulled = false; near.renderOrder = 1; far.renderOrder = 2;
  return {
    meshes: [near, far], fore,
    // Replant for a view. The two detail levels are split by depth with a ragged edge so no line shows where they meet.
    build(view) {
      const list = plant(view).sort((p, q) => p.d - q.d);
      const split = (b) => b.d < (b.kind >= PLANTAIN ? PARTS_TO + 2 : 9 + 3 * b.ph);   // small heads and parts keep the finer strip as far as they go
      write(nearGeo, list.filter(split)); write(farGeo, list.filter((b) => !split(b)));
      write(foreGeo, plantFore({ ...view, count: view.fore }).sort((p, q) => q.d - p.d), true);   // far to near: they are blended
      return list.length;
    },
    dispose() { nearGeo.dispose(); farGeo.dispose(); foreGeo.dispose(); mat.dispose(); foreMat.dispose(); },
  };
}
