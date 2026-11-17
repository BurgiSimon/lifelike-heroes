// The flowers: real meadow species standing in for the original's four petal colours — a field poppy (accent), a
// cornflower (sky), a field scabious (plum) and a pot marigold (clay), at the large end of life size. A flower is a small plant:
// the bloom that opens where the click landed, and usually a bud and one or two lower blooms beside it. Every head is
// built in the vertex shader from one small grid drawn many times: petals, the cup under them, the centre. Growth
// (the stem rises with its bud, then the head opens) and the fade of the oldest run from each flower's birth time.
import * as THREE from 'three';
import { GROW, FADE } from './config.js';
import { LIGHT, PACK, WIND_GLSL } from './glsl.js';
import { bladeGeometry, bladeMaterial } from './grass.js';
import { rnd } from '../shared/kit.js';

const MAX = 168;            // plants: the cap tops out at 120; the rest is room for the ones fading out
const HEADS = 4;            // heads a plant can carry
const SLOTS = 14;           // per head: eleven petals, two halves of the cup, a centre

const VERT = /* glsl */`
${LIGHT}
${WIND_GLSL}
attribute vec3 iRoot;
attribute vec4 iStem;     // stem height, yaw, rest lean, wind phase
attribute vec4 iHead;     // species, size, bud (1: it stays shut), seed
attribute vec3 iLife;     // born, gone, slot
uniform float uNow;
varying vec3 vAlb; varying vec3 vFront; varying vec3 vBack; varying vec4 vPet; varying vec2 vLens;

float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  float u = position.x; float v = position.y;
  float sp = iHead.x; float seed = iHead.w; float slot = iLife.z;
  float age = clamp((uNow - iLife.x) / ${GROW.toFixed(2)}, 0.0, 1.0);
  float up0 = 1.0 - pow(1.0 - min(1.0, age / 0.7), 3.0);
  float open = (1.0 - pow(1.0 - max(0.0, (age - 0.6) / 0.4), 2.0)) * (1.0 - iHead.z);
  float fade = iLife.y > 0.0 ? clamp(1.0 - (uNow - iLife.y) / ${FADE.toFixed(2)}, 0.0, 1.0) : 1.0;
  float h = iStem.x * max(up0, 0.001) * mix(0.2, 1.0, fade);
  // the same lean as its stem
  vec4 rclip = projectionMatrix * viewMatrix * vec4(iRoot, 1.0);
  float wl = weather(iRoot.xz, iStem.w * 6.2831853); float push = pushAt(rclip) * 0.6;
  vec2 lean = vec2(cos(iStem.y), sin(iStem.y)) * iStem.z + WDIR * wl * 0.6 + vec2(push, 0.0);
  vec3 T; vec3 tip = iRoot + stemAt(1.0, h, lean, 0.0, T);
  vec3 toCam = normalize(cameraPosition - tip);
  // A head looks up its stem and a little outward, each its own way: from a lens at grass height most are seen
  // three-quarter or from the side, as cups and discs, not as rosettes.
  vec3 A = normalize(T * 0.85 + vec3(uSun.x, 0.0, uSun.z) * 0.12 + vec3(toCam.x, 0.0, toCam.z) * 0.5 + vec3(cos(seed * 40.0), 0.0, sin(seed * 40.0)) * 0.42);
  vec3 X = normalize(cross(A, vec3(0.31, 0.0, 0.95))); vec3 Y = cross(A, X);

  // species: 0 poppy, 1 cornflower, 2 scabious, 3 marigold. Lengths in petal lengths; cups in rad above the head's plane.
  float n     = sp < 0.5 ? 4.0   : sp < 1.5 ? 10.0  : 11.0;
  float len   = sp < 0.5 ? 0.060 : sp < 1.5 ? 0.032 : sp < 2.5 ? 0.030 : 0.038;
  float wid   = sp < 0.5 ? 1.50  : sp < 1.5 ? 0.66  : sp < 2.5 ? 0.70  : 0.50;
  float reach = sp < 0.5 ? 1.0   : sp < 1.5 ? 1.0   : sp < 2.5 ? 0.62  : 1.0;      // petal length
  float baseR = sp < 0.5 ? 0.03  : sp < 1.5 ? 0.20  : sp < 2.5 ? 0.50  : 0.24;      // where the petals leave the head
  float cup0  = sp < 0.5 ? 1.00  : sp < 1.5 ? 1.02  : sp < 2.5 ? 0.34  : 0.50;
  float cup1  = sp < 0.5 ? 0.30  : sp < 1.5 ? 0.32  : sp < 2.5 ? -0.20 : 0.12;
  float coreR = sp < 0.5 ? 0.13  : sp < 1.5 ? 0.30  : sp < 2.5 ? 0.64  : 0.36;
  float coreH = sp < 0.5 ? 0.20  : sp < 1.5 ? 0.26  : sp < 2.5 ? 0.46  : 0.16;
  float invH  = sp < 0.5 ? 0.0   : sp < 1.5 ? 0.62  : sp < 2.5 ? 0.20  : 0.30;      // the cup of bracts under the head
  float invR  = sp < 0.5 ? 0.0   : sp < 1.5 ? 0.30  : sp < 2.5 ? 0.44  : 0.30;
  float budH  = sp < 0.5 ? 0.42  : invH + 0.28;
  float budR  = sp < 0.5 ? 0.20  : 0.30;
  // ponytail: far heads are drawn over life size (×3.4 at the word), in step with the far blades, which the
  // one-pixel floor widens as much: a flower planted there is still seen, and still sits right in its grass
  float s = len * iHead.y * pow(max(1.0, rclip.w / 5.0), 0.75) * fade;       // one petal length, m
  float grow = mix(0.42, 1.0, open);                                         // a bud is under half the bloom's size
  float H = mix(budH, invH, open) * s; float Rv = mix(budR, invR, open) * s;
  vec3 O = tip + A * H;                                                      // where the petals are set

  vec3 P; vec3 nrm; vec3 alb; float thin = 1.0; float part = 0.0;
  float tone = 0.86 + 0.28 * fract(seed * 7.7);
  vec3 hue = (sp < 0.5 ? vec3(0.66, 0.105, 0.05) : sp < 1.5 ? vec3(0.17, 0.27, 0.60) : sp < 2.5 ? vec3(0.37, 0.21, 0.37) : vec3(0.64, 0.25, 0.10)) * tone;
  if (slot > 12.5) {
    // centre: the grid laid over a dome (square to disc, so its rim is round)
    float w2 = v * 2.0 - 1.0;
    vec2 d = vec2(u * sqrt(1.0 - 0.5 * w2 * w2), w2 * sqrt(1.0 - 0.5 * u * u));
    float dome = sqrt(max(0.0, 1.0 - dot(d, d)));
    vec3 radial = X * d.x + Y * d.y;
    P = O + (radial * coreR + A * coreH * dome) * s * open;
    nrm = normalize(A * (dome + 0.25) + radial);
    alb = sp < 0.5 ? mix(vec3(0.02, 0.015, 0.02), vec3(0.20, 0.24, 0.07), smoothstep(0.75, 0.45, length(d)))    // dark stamens round a green capsule
        : sp < 1.5 ? vec3(0.13, 0.07, 0.25)
        : sp < 2.5 ? hue * mix(1.15, 0.8, dome)
        : mix(vec3(0.50, 0.24, 0.03), vec3(0.72, 0.42, 0.05), dome);
    thin = 0.0; part = 1.0;
  } else if (slot > 10.5) {
    // the cup under the head, and the whole of a bud: two halves of an egg
    float a = (slot - 11.0 + u * 0.5 + 0.5) * 3.14159265 + seed * 6.0;
    float prof = pow(sin(3.14159265 * (0.08 + 0.80 * v)), 0.6);
    vec3 radial = X * cos(a) + Y * sin(a);
    P = tip + A * H * v + radial * Rv * prof;
    nrm = normalize(radial + A * (v - 0.45) * 1.4);
    alb = sp < 0.5 ? vec3(0.070, 0.105, 0.036) : sp < 1.5 ? mix(vec3(0.055, 0.085, 0.030), vec3(0.11, 0.085, 0.045), v) : vec3(0.060, 0.10, 0.034);
    thin = 0.0; part = 2.0;
    if (H <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  } else {
    if (slot >= n) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float jit = hash1(slot + 1.0 + seed * 61.0);
    // poppy: two outer petals and two inner ones across them; the composites: every other ray a little shorter and raised
    float ring = sp < 0.5 ? step(1.5, slot) : mod(slot, 2.0);
    float a = (sp < 0.5 ? (slot + ring * 0.5) * 3.14159265 : slot / n * 6.2831853) + seed * 6.0 + (jit - 0.5) * 1.6 / n;
    float L = s * grow * reach * (1.0 - (sp < 0.5 ? 0.1 : 0.16) * ring) * (0.86 + 0.28 * jit);
    // a bud holds its petals up along the stem; they fall open to the species' cup
    float tilt = ring * (sp < 0.5 ? 0.2 : 0.12) + (jit - 0.5) * 0.3;
    float c0 = mix(1.42, cup0 + tilt, open); float c1 = mix(1.42, cup1 + tilt, open);
    // outline: a poppy's fan with a wavy rim, a cornflower's trumpet split into teeth, a scabious's lobed lip, a marigold's strap
    float prof = sp < 0.5 ? 0.12 + 0.88 * smoothstep(0.0, 0.62, v) : sp < 1.5 ? 0.20 + 0.80 * pow(v, 1.6) : sp < 2.5 ? 0.35 + 0.65 * pow(v, 0.8) : 0.50 + 0.50 * smoothstep(0.0, 0.3, v);
    float notch = sp < 0.5 ? 0.22 * u * u - 0.05 * sin(u * 7.0 + jit * 20.0) : (sp < 1.5 ? 0.26 : sp < 2.5 ? 0.16 : 0.09) * (0.5 - 0.5 * cos(u * 6.2831853));
    float vv = v * (1.0 - notch * v * v);
    // The petal follows an arc whose pitch runs from c0 at the claw to c1 at the tip: a poppy is a real bowl from
    // the side, a marigold a saucer.
    float k = c1 - c0; float c = c0 + k * vv;
    float rr = abs(k) < 0.02 ? cos(c0) * vv : (sin(c) - sin(c0)) / k;
    float zz = abs(k) < 0.02 ? sin(c0) * vv : (cos(c0) - cos(c)) / k;
    float rho = baseR * s * grow + L * rr; float halfW = prof * wid * L * 0.5;
    // a poppy's broad petals wrap round the bowl and overlap; the narrow rays of the others lie flat with a fold
    float wrap = sp < 0.5 ? 1.0 : 0.0; float flat1 = 1.0 - wrap;
    float aw = a + wrap * u * min(1.25, halfW / max(rho, 0.3 * L));
    vec3 Rd = X * cos(aw) + Y * sin(aw); vec3 Td = Y * cos(aw) - X * sin(aw);
    float fold = sp < 1.5 ? 0.30 : 0.14;
    float crinkle = sp < 0.5 ? 0.07 * sin(u * 5.0 + jit * 9.0) * sin(vv * 6.0 + jit * 5.0) * vv : 0.0;
    vec3 along = Rd * cos(c) + A * sin(c); vec3 outn = A * cos(c) - Rd * sin(c);
    P = O + Rd * rho * (1.0 + 0.06 * ring + 0.04 * (jit - 0.5)) + A * L * zz + Td * u * halfW * flat1 + outn * L * (u * u * fold * vv * flat1 + crinkle);
    nrm = normalize(outn - Td * u * fold * 2.0 * flat1 + along * crinkle * 3.0);
    float tint = 0.84 + 0.32 * jit;
    alb = sp < 0.5 ? mix(mix(hue * 0.5, vec3(0.03, 0.012, 0.02), step(0.5, fract(seed * 3.3))), hue * tint, smoothstep(0.08, 0.30, v))   // some carry a dark blotch at the claw
        : sp < 1.5 ? mix(vec3(0.26, 0.30, 0.52), hue * tint, smoothstep(0.0, 0.5, v))
        : sp < 2.5 ? hue * tint * mix(0.85, 1.4, v)
        : mix(vec3(0.72, 0.42, 0.06), hue * tint, smoothstep(0.0, 0.45, v));
  }

  vec3 V = normalize(cameraPosition - P);
  if (dot(nrm, V) < 0.0) nrm = -nrm;
  float sunVis = wordShadow(tip) * swardSun(tip, h + 0.05) * cloudSun(iRoot.xz);
  float ndl = dot(nrm, uSun);
  // lit from behind: a petal square to the sun glows through, one edge-on to it stays dull, so a head has light and dark petals
  vFront = skyLight(nrm) * 0.8 + uSunCol * sunVis * (max(ndl, 0.0) * 0.9 + 0.06);
  vBack = (skyLight(-nrm) * 0.3 + uSunCol * sunVis * pow(max(-ndl, 0.0), 0.8) * 1.3) * thin;
  vAlb = alb; vPet = vec4(u, v, part, sp);
  vLens = vec2(cocAt(-(viewMatrix * vec4(P, 1.0)).z), 1.0 - exp(-length(cameraPosition - P) * 0.003));
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  if (fade <= 0.0 || iHead.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uHaze;
varying vec3 vAlb; varying vec3 vFront; varying vec3 vBack; varying vec4 vPet; varying vec2 vLens;
${PACK}
void main() {
  float u = vPet.x; float v = vPet.y; float part = vPet.z; float sp = vPet.w;
  vec3 alb = vAlb; float thin = 1.0; float throat = 1.0;
  if (part < 0.5) {
    // veins fanning from the claw, a rim thin enough to glow, and the shade the petals throw into the throat
    float vein = smoothstep(0.62, 1.0, abs(fract(u * (sp < 0.5 ? 4.0 : 1.5) + 0.5) - 0.5) * 2.0) * smoothstep(0.1, 0.5, v);
    alb *= 1.0 - 0.2 * vein;
    thin = 0.75 + 0.6 * smoothstep(0.3, 1.0, abs(u)) * v;
    throat = mix(0.38, 1.0, smoothstep(0.0, 0.55, v));
  } else if (part < 1.5) {
    vec2 g = floor(vec2(u, v * 2.0 - 1.0) * 4.5);                    // florets, anthers: a centre is never one flat tone
    alb *= 0.72 + 0.56 * fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
  } else {
    alb *= 0.74 + 0.4 * step(0.5, fract(v * 3.0 + step(0.0, sin(u * 12.0)) * 0.5));   // overlapping scales
  }
  vec3 trn = mix(alb, alb * alb / max(max(alb.r, max(alb.g, alb.b)), 0.05), 0.6) * 1.15;   // a petal is a stained window: what comes through is more saturated
  vec3 col = (alb * vFront + trn * vBack * thin) * throat;
  col *= min(1.0, 2.6 / max(max(col.r, max(col.g, col.b)), 1e-3));                           // backlit petals glow; they are not lamps
  gl_FragColor = vec4(pack(mix(col, uHaze, vLens.y)), vLens.x);
}`;

export function createFlowers(shared) {
  // one petal: a 4 × 4 grid, x = −1..1 across, y = 0..1 from claw to tip
  const pg = new THREE.InstancedBufferGeometry(); const pos = []; const idx = []; const NX = 4; const NY = 4;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) pos.push(i / NX * 2 - 1, j / NY, 0);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1); }
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx);
  const mk = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const NP = MAX * HEADS * SLOTS; const NS = MAX * HEADS;
  const pRoot = mk(NP, 3); const pStem = mk(NP, 4); const pHead = mk(NP, 4); const pLife = mk(NP, 3);
  pg.setAttribute('iRoot', pRoot); pg.setAttribute('iStem', pStem); pg.setAttribute('iHead', pHead); pg.setAttribute('iLife', pLife); pg.instanceCount = 0;
  const uNow = { value: 0 };
  const pmat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uNow }, side: THREE.DoubleSide });
  const heads = new THREE.Mesh(pg, pmat); heads.frustumCulled = false; heads.renderOrder = 3;

  // stems: the grass's own blade, grown and faded by the flower's clock
  const sg = bladeGeometry(7); const sRoot = mk(NS, 3); const sA = mk(NS, 4); const sB = mk(NS, 4); const sLife = mk(NS, 4);
  sg.setAttribute('iRoot', sRoot); sg.setAttribute('iA', sA); sg.setAttribute('iB', sB); sg.setAttribute('iLife', sLife); sg.instanceCount = 0;
  const smat = bladeMaterial(shared, { FLOWER: 1 }, { uniforms: { uNow } });
  const stems = new THREE.Mesh(sg, smat); stems.frustumCulled = false; stems.renderOrder = 3;

  return {
    meshes: [heads, stems], uNow,
    // list: { n, x, y, z, h, ph, species, size, born, gone, seed }
    sync(list) {
      const n = Math.min(list.length, MAX);
      for (let i = 0; i < n; i++) {
        const f = list[i]; const yaw = f.ph * 6.2832; const poppy = f.species === 0;
        for (let hd = 0; hd < HEADS; hd++) {
          // the bloom that was planted; a bud on a shorter stalk (a poppy's hangs its head); one or two lower blooms, a hand's width off
          const r = rnd(f.n * 31 + hd * 7); const has = hd === 0 || rnd(f.n * 31 + hd * 7 + 1) < [1, 0.8, 0.85, 0.45][hd];
          const sh = !has ? 0 : f.h * [1, 0.5 + 0.25 * r, 0.66 + 0.2 * r, 0.5 + 0.22 * r][hd];
          const syaw = yaw + hd * 2.2 + r; const rest = hd === 0 ? 0.08 : hd === 1 ? (poppy ? 0.85 : 0.32) : 0.2 + 0.14 * r;
          const size = !has ? 0 : f.size * [1, 0.9, 0.88, 0.8][hd]; const seed = (f.seed + hd * 0.37) % 1; const ph = (f.ph + hd * 0.13) % 1;
          const off = hd === 0 ? 0 : (0.03 + 0.05 * r) * Math.max(1, -f.z / 5) ** 0.75; const x = f.x + Math.cos(syaw) * off; const z = f.z + Math.sin(syaw) * off;
          const j = i * HEADS + hd;
          sRoot.array.set([x, f.y, z], j * 3); sA.array.set([sh, hd === 0 ? 0.004 : 0.003, syaw, rest], j * 4); sB.array.set([ph, 0.5, 0, 0], j * 4); sLife.array.set([f.born, f.gone || 0, 0, 0], j * 4);
          for (let k = 0; k < SLOTS; k++) {
            const q = j * SLOTS + k;
            pRoot.array.set([x, f.y, z], q * 3); pStem.array.set([sh, syaw, rest, ph], q * 4); pHead.array.set([f.species, size, hd === 1 ? 1 : 0, seed], q * 4); pLife.array.set([f.born, f.gone || 0, k], q * 3);
          }
        }
      }
      for (const a of [sRoot, sA, sB, sLife]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * HEADS * a.itemSize); a.needsUpdate = true; }
      for (const a of [pRoot, pStem, pHead, pLife]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * HEADS * SLOTS * a.itemSize); a.needsUpdate = true; }
      sg.instanceCount = n * HEADS; pg.instanceCount = n * HEADS * SLOTS;
    },
    dispose() { pg.dispose(); sg.dispose(); pmat.dispose(); smat.dispose(); },
  };
}
