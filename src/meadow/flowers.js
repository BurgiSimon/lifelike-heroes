// The flowers: real meadow species standing in for the original's four petal colours — a field poppy (accent),
// a pale blue flax (sky), a scabious (plum) and a coral avens (clay). Each is a stem that sways with the grass and a
// head of thin petals built in the vertex shader from one small grid; a centre is one more "petal". Growth (the
// stem rises, then the head opens) and the fade of the oldest run in the shader from each flower's birth time.
import * as THREE from 'three';
import { GROW, FADE } from './config.js';
import { shared, LIGHT, WIND_GLSL } from './glsl.js';
import { bladeGeometry, bladeMaterial } from './grass.js';

const MAX = 168;            // the cap tops out at 120; the rest is room for the ones fading out
const SLOTS = 13;           // twelve petals and a centre

const VERT = /* glsl */`
${LIGHT}
${WIND_GLSL}
attribute vec3 iRoot;
attribute vec4 iF;        // stem height, phase, species, size
attribute vec4 iLife;     // born, gone, petal slot, tilt seed
uniform float uNow;
varying vec3 vCol; varying float vCoc; varying vec3 vPet;

void main() {
  float u = position.x; float v = position.y;
  float sp = iF.z; float slot = iLife.z; float seed = iLife.w;
  float age = clamp((uNow - iLife.x) / ${GROW.toFixed(2)}, 0.0, 1.0);
  float up0 = 1.0 - pow(1.0 - min(1.0, age / 0.7), 3.0);
  float open = 1.0 - pow(1.0 - max(0.0, (age - 0.6) / 0.4), 2.0);
  float fade = iLife.y > 0.0 ? clamp(1.0 - (uNow - iLife.y) / ${FADE.toFixed(2)}, 0.0, 1.0) : 1.0;
  float h = iF.x * max(up0, 0.001) * mix(0.2, 1.0, fade);
  // the same lean as its stem
  float ph = iF.y * 6.2831853;
  vec4 rclip = projectionMatrix * viewMatrix * vec4(iRoot, 1.0);
  float wl = weather(iRoot.xz, ph); float push = pushAt(rclip) * 0.6;
  vec2 lean = vec2(cos(ph), sin(ph)) * 0.08 + WDIR * wl * 0.6 + vec2(push, 0.0);
  vec3 T; vec3 tip = iRoot + stemAt(1.0, h, lean, T);
  vec3 toCam = normalize(cameraPosition - tip);
  // The head looks up and a little toward the light and the lens, each flower its own way.
  vec3 A = normalize(T + vec3(uSun.x, 0.0, uSun.z) * 0.15 + vec3(toCam.x, 0.0, toCam.z) * 0.95 + vec3(cos(seed * 40.0), 0.0, sin(seed * 40.0)) * 0.35);
  vec3 X = normalize(cross(A, vec3(0.31, 0.0, 0.95))); vec3 Y = cross(A, X);

  // species: petals n, length, width, cup at base and tip (rad above the head's plane), centre size
  float n = sp < 0.5 ? 5.0 : sp < 1.5 ? 9.0 : sp < 2.5 ? 12.0 : 5.0;
  float len = iF.w * (sp < 0.5 ? 0.105 : sp < 1.5 ? 0.07 : sp < 2.5 ? 0.066 : 0.062);
  float wid = sp < 0.5 ? 1.25 : sp < 1.5 ? 0.46 : sp < 2.5 ? 0.5 : 0.95;
  float cup0 = sp < 0.5 ? 1.15 : sp < 1.5 ? 0.75 : sp < 2.5 ? 0.3 : 0.5;
  float cup1 = sp < 0.5 ? 0.35 : sp < 1.5 ? 0.05 : sp < 2.5 ? -0.1 : 0.12;
  float core = sp < 0.5 ? 0.2 : sp < 1.5 ? 0.16 : sp < 2.5 ? 0.42 : 0.24;
  // ponytail: far heads are drawn larger than life (×2.2 at the word) so a flower planted there is still seen; true scale would be 7 px
  float size = len * open * fade * pow(max(1.0, rclip.w / 6.0), 0.55);

  vec3 P; vec3 nrm; vec3 alb; float thin = 1.0;
  vec3 hue = sp < 0.5 ? vec3(0.80, 0.085, 0.03) : sp < 1.5 ? vec3(0.15, 0.25, 0.66) : sp < 2.5 ? vec3(0.34, 0.165, 0.31) : vec3(0.66, 0.235, 0.105);
  if (slot > 11.5) {
    // centre: a low dome
    float a = u * 3.14159; float r = v;
    P = tip + (X * cos(a) + Y * sin(a)) * r * core * size + A * (1.0 - r * r) * core * size * (sp > 1.5 && sp < 2.5 ? 0.9 : 0.5);
    nrm = normalize(A + (X * cos(a) + Y * sin(a)) * r * 1.4);
    alb = sp < 0.5 ? mix(vec3(0.02, 0.02, 0.015), vec3(0.20, 0.22, 0.05), smoothstep(0.5, 0.0, r))
        : sp < 1.5 ? vec3(0.07, 0.08, 0.30)
        : sp < 2.5 ? hue * (0.75 + 0.5 * fract(sin(a * 7.0 + r * 31.0) * 43.7))
        : mix(vec3(0.55, 0.36, 0.03), vec3(0.30, 0.16, 0.02), r);
    thin = 0.0;
  } else {
    if (slot >= n) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float inner = (sp > 1.5 && sp < 2.5 && slot > 5.5) ? 1.0 : 0.0;            // scabious: a second, shorter ring
    float turn = (sp > 1.5 && sp < 2.5) ? 6.0 : n;
    float a = (slot + inner * 0.5) / turn * 6.2831853 + seed * 6.0;
    float jit = fract(sin((slot + 1.0) * 12.9898 + seed * 78.233) * 43758.5453);
    float L = size * (1.0 - 0.38 * inner) * (0.88 + 0.24 * jit);
    // a bud holds its petals up along the stem; they fall open to the species' cup
    float cup = mix(1.45, mix(cup0, cup1, v) + (jit - 0.5) * 0.25, open);
    vec3 Rd = X * cos(a) + Y * sin(a); vec3 Td = Y * cos(a) - X * sin(a);
    float prof = sp < 0.5 ? sin(3.14159 * pow(v, 0.55)) * 0.5 + 0.5 * v * (1.0 - smoothstep(0.85, 1.0, v))
               : sp < 1.5 ? (0.25 + 0.75 * v * v) * (1.0 - 0.35 * smoothstep(0.9, 1.0, v) * (1.0 - abs(u)))
               : sin(3.14159 * pow(v, 0.7)) * 0.8 + 0.2 * v * (1.0 - smoothstep(0.8, 1.0, v));
    float crinkle = sp < 0.5 ? 0.12 * sin(u * 5.0 + jit * 9.0) * sin(v * 7.0 + jit * 5.0) * v : 0.0;
    vec3 along = Rd * cos(cup) + A * sin(cup); vec3 out_n = A * cos(cup) - Rd * sin(cup);
    P = tip + along * L * v + Td * u * prof * wid * L * 0.5 + out_n * L * (u * u * 0.22 * v + crinkle);
    nrm = normalize(out_n - Td * u * 0.5 + along * crinkle * 3.0);
    // poppies carry a dark blotch at the claw; the others pale toward it
    float tint = 0.85 + 0.3 * jit;
    alb = sp < 0.5 ? mix(vec3(0.03, 0.012, 0.02), hue * tint, smoothstep(0.08, 0.3, v))
        : sp < 1.5 ? mix(vec3(0.55, 0.62, 0.78), hue * tint, smoothstep(0.0, 0.45, v)) * (0.9 + 0.2 * abs(u))
        : sp < 2.5 ? hue * tint * mix(1.0, 1.45, v)
        : mix(vec3(0.75, 0.42, 0.10), hue * tint, smoothstep(0.05, 0.4, v));
  }

  vec3 V = normalize(cameraPosition - P);
  if (dot(nrm, V) < 0.0) nrm = -nrm;
  float sunVis = wordShadow(tip) * swardSun(tip, h + 0.05);
  float ndl = dot(nrm, uSun);
  // lit from behind: a petal square to the sun glows through, one edge-on to it stays dull, so a head has light and dark petals
  float lit = max(ndl, 0.0) * 0.9 + 0.08; float through = pow(max(-ndl, 0.0), 0.8) * 0.85 * thin;
  // a petal is a stained window: what comes through is more saturated than what bounces off
  vec3 trn = alb * alb / max(max(alb.r, max(alb.g, alb.b)), 0.05) * 1.25;
  float base = thin > 0.5 ? mix(0.45, 1.0, v) : 0.7;                                  // petals shade each other at the throat
  vec3 col = alb * (skyLight(nrm) * 0.6 + skyLight(-nrm) * 0.3 * thin) * base;
  col += uSunCol * sunVis * (alb * lit + trn * through) * base;
  float dist = length(cameraPosition - P);
  vPet = vec3(u, v, thin);
  vCol = haze(col, dist); vCoc = cocAt(-(viewMatrix * vec4(P, 1.0)).z);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  if (fade <= 0.0 || open <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
vec3 pack(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
varying vec3 vCol; varying float vCoc; varying vec3 vPet;
void main() {
  // veins along the petal and a thinner, brighter edge
  float vein = smoothstep(0.55, 1.0, abs(fract(vPet.x * 3.0 + 0.5) - 0.5) * 2.0) * vPet.y;
  vec3 c = vCol * (1.0 - vPet.z * (0.2 * vein - 0.22 * smoothstep(0.45, 1.0, abs(vPet.x)) * vPet.y));
  gl_FragColor = vec4(pack(c), vCoc);
}`;

export function createFlowers() {
  // petal: a 4 × 6 grid, x = −1..1 across, y = 0..1 from claw to tip
  const pg = new THREE.InstancedBufferGeometry(); const pos = []; const idx = []; const NX = 4; const NY = 6;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) pos.push(i / NX * 2 - 1, j / NY, 0);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1); }
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx);
  const mk = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const pRoot = mk(MAX * SLOTS, 3); const pF = mk(MAX * SLOTS, 4); const pLife = mk(MAX * SLOTS, 4);
  pg.setAttribute('iRoot', pRoot); pg.setAttribute('iF', pF); pg.setAttribute('iLife', pLife); pg.instanceCount = 0;
  const uNow = { value: 0 };
  const pmat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uNow }, side: THREE.DoubleSide });
  const heads = new THREE.Mesh(pg, pmat); heads.frustumCulled = false; heads.renderOrder = 3;

  // stems: the grass's own blade, grown and faded by the flower's clock
  const sg = bladeGeometry(7); const sRoot = mk(MAX, 3); const sA = mk(MAX, 4); const sB = mk(MAX, 4); const sLife = mk(MAX, 4);
  sg.setAttribute('iRoot', sRoot); sg.setAttribute('iA', sA); sg.setAttribute('iB', sB); sg.setAttribute('iLife', sLife); sg.instanceCount = 0;
  const smat = bladeMaterial({ FLOWER: 1 }, { uniforms: { uNow } });
  const stems = new THREE.Mesh(sg, smat); stems.frustumCulled = false; stems.renderOrder = 3;

  return {
    meshes: [heads, stems], uNow,
    // list: { x, y, z, h, ph, species, size, born, gone, seed }
    sync(list) {
      const n = Math.min(list.length, MAX);
      for (let i = 0; i < n; i++) {
        const f = list[i];
        sRoot.array.set([f.x, f.y, f.z], i * 3); sA.array.set([f.h, 0.0045, f.ph * 6.2832, 0.08], i * 4); sB.array.set([f.ph, 0.5, 0, 0], i * 4); sLife.array.set([f.born, f.gone || 0, 0, 0], i * 4);
        for (let k = 0; k < SLOTS; k++) {
          const j = i * SLOTS + k;
          pRoot.array.set([f.x, f.y, f.z], j * 3); pF.array.set([f.h, f.ph, f.species, f.size], j * 4); pLife.array.set([f.born, f.gone || 0, k, f.seed], j * 4);
        }
      }
      for (const a of [sRoot, sA, sB, sLife, pRoot, pF, pLife]) a.needsUpdate = true;
      sg.instanceCount = n; pg.instanceCount = n * SLOTS;
    },
    dispose() { pg.dispose(); sg.dispose(); pmat.dispose(); smat.dispose(); },
  };
}
