// The water surface: wind ripples (a tileable sum of travelling waves), the interactive heightfield, the pass
// that adds them into one slope map, and the caustics those slopes focus onto the floor.
import { common } from './common.js';

export const WAVES = 30;
export const DROPS = 20;

// One tile of wind ripples: the height's gradient per unit of tile uv. Whole wave numbers, so it tiles.
export const windFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform vec4 uWave[${WAVES}];  // kx, ky (cycles per tile), amplitude, angular speed
uniform float uPhase[${WAVES}];
uniform float uTime;
void main() {
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${WAVES}; i++) {
    vec4 w = uWave[i];
    g += w.z * 6.2831853 * w.xy * cos(6.2831853 * dot(w.xy, vUv) - w.w * uTime + uPhase[i]);
  }
  o = vec4(g, 0.0, 1.0);
}
`;

// One step of the wave equation on the heightfield: r = height, g = velocity. Drops are added to the height.
export const simFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uTexel;     // 1 / sim size
uniform vec2 uDomain;    // sim domain in CSS px (the hero box plus a margin all round)
uniform float uMargin;
uniform float uStiff;    // c² dt² / dx²
uniform float uDamp;
uniform vec4 uDrop[${DROPS}];  // x, y (CSS px), radius, strength
uniform int uDrops;
void main() {
  vec4 s = texture(uPrev, vUv);
  float h = s.r; float v = s.g;
  float e = texture(uPrev, vUv + vec2(uTexel.x, 0.0)).r + texture(uPrev, vUv - vec2(uTexel.x, 0.0)).r + texture(uPrev, vUv + vec2(0.0, uTexel.y)).r + texture(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float c = texture(uPrev, vUv + uTexel).r + texture(uPrev, vUv - uTexel).r + texture(uPrev, vUv + vec2(uTexel.x, -uTexel.y)).r + texture(uPrev, vUv + vec2(-uTexel.x, uTexel.y)).r;
  float avg = (4.0 * e + c) / 20.0;       // nine-point stencil: rings stay round on a coarse grid
  v += (avg - h) * uStiff * 3.3333;        // (4e + c - 20h) / 6, written around the neighbourhood mean
  v *= uDamp; h += v;
  // the margin soaks waves up, so nothing bounces off the frame
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uDomain - uMargin;
  vec2 in2 = min(vUv, 1.0 - vUv) * uDomain;
  float soak = smoothstep(0.0, uMargin, min(in2.x, in2.y));
  h *= mix(0.9, 1.0, soak); v *= mix(0.9, 1.0, soak);
  for (int i = 0; i < ${DROPS}; i++) {
    if (i >= uDrops) break;
    vec4 d = uDrop[i]; vec2 q = (p - d.xy) / d.z;
    h += d.w * exp(-dot(q, q));
  }
  o = vec4(h, v, 0.0, 1.0);
}
`;

// Wind plus simulation → xy = slope (px of height per px), z = the basin's depth here, so the full-resolution
// passes read it instead of working it out again, w = how much pollen lies on the surface film. Half resolution is plenty.
export const surfaceFrag = /* glsl */ `
${common}
in vec2 vUv; out vec4 o;
uniform sampler2D uSim; uniform sampler2D uWind;
uniform vec2 uSimTexel; uniform vec2 uDomain; uniform float uMargin;
uniform float uWindAmp;
uniform vec4 uPad[8];   // x, y, radius of each lily pad: the water lies calm beneath them
uniform int uPads;
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 su = vec2((p.x + uMargin) / uDomain.x, 1.0 - (p.y + uMargin) / uDomain.y);
  float hl = texture(uSim, su - vec2(uSimTexel.x, 0.0)).r; float hr = texture(uSim, su + vec2(uSimTexel.x, 0.0)).r;
  float hu = texture(uSim, su + vec2(0.0, uSimTexel.y)).r; float hd = texture(uSim, su - vec2(0.0, uSimTexel.y)).r;
  vec2 cell = uSimTexel * uDomain;
  vec2 g = vec2(hr - hl, hd - hu) / (2.0 * cell);
  g *= 1.8;                                 // a ring is a few px tall in a pond a hundred deep: drawn a little steeper, it reads
  // two copies of the wind tile at different scales and angles hide its period
  float t1 = 470.0 * uS; float t2 = 790.0 * uS;
  const mat2 R = mat2(0.829, 0.559, -0.559, 0.829);
  vec4 a = texture(uWind, p / t1);
  vec4 b = texture(uWind, R * p / t2 + vec2(0.31, 0.67));
  // a pad calms the water beneath it, and the surface climbs its rim: that meniscus bends the floor at the
  // leaf's edge and throws the bright and dark line round its shadow
  float calm = 1.0; vec2 rimg = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uPads) break;
    vec2 dp = p - uPad[i].xy; float dl = length(dp);
    calm *= 1.0 - 0.8 * smoothstep(uPad[i].z * 1.12, uPad[i].z * 0.8, dl);
    rimg += dp / max(dl, 1.0) * 0.15 * smoothstep(3.5 * uS, 0.0, abs(dl - uPad[i].z));
  }
  // the breeze comes in gusts: lanes of ruffled water drift across, with glassy water between them
  float gust = mix(0.3, 1.0, smoothstep(0.3, 0.7, vnoise(p / (uS * 520.0) + uTime * vec2(0.035, 0.02))));
  float wa = uWindAmp * uS * calm * gust;   // slopes, so the tiles' size must not change them
  g += wa * (a.xy / t1 + 1.25 * (b.xy * R) / t2) + rimg;
  // pollen: the breeze draws it out into long streaks, crisp on the windward side and feathered behind, and
  // they drift across with the rest of the litter
  vec2 fp = p / uS - uTime * vec2(2.6, 1.1);
  vec2 fq = vec2(fp.x * 0.9 + fp.y * 0.43, fp.y * 0.9 - fp.x * 0.43) / vec2(640.0, 170.0);
  fq.y += 0.7 * vnoise(fq * 1.7 + 4.0);
  float n = vnoise(fq + 9.0);
  float film = smoothstep(0.5, 0.515, n) * (1.0 - smoothstep(0.52, 0.6, n)) * smoothstep(0.42, 0.62, vnoise(fq * 0.55 + 21.0));
  o = vec4(g, depthAt(p), film * calm);
}
`;

// Caustics: a sheet of sunlight laid on the surface, each vertex carried to where its ray lands on the floor.
// Brightness is how much the sheet was squeezed there; folds add up.
export const causticVert = /* glsl */ `
${common}
in vec3 position; in vec2 uv;
uniform sampler2D uSurf;
uniform float uFocus; uniform float uOver; uniform vec2 uCell;
out float vI;
vec2 slope(vec2 p) { return textureLod(uSurf, uvOf(p), 0.0).xy; }
void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y) * (uRes + 2.0 * uOver) - uOver;
  float k = uFocus * (52.0 * uS + 0.43 * depthAt(p));   // deeper floor, longer throw; flattened so the deep end does not over-fold
  vec2 g = slope(p);
  vec2 gx = (slope(p + vec2(uCell.x, 0.0)) - slope(p - vec2(uCell.x, 0.0))) / (2.0 * uCell.x);
  vec2 gy = (slope(p + vec2(0.0, uCell.y)) - slope(p - vec2(0.0, uCell.y))) / (2.0 * uCell.y);
  // Jacobian of landing point by starting point: its determinant is the area the light now covers
  float det = (1.0 + k * gx.x) * (1.0 + k * gy.y) - k * k * gx.y * gy.x;
  vI = 1.0 / max(abs(det), 0.06);
  vec2 q = p + g * k;
  gl_Position = vec4(q.x / uRes.x * 2.0 - 1.0, 1.0 - q.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
export const causticFrag = /* glsl */ `
precision highp float;
in float vI; out vec4 o;
void main() { o = vec4(vI, vI, vI, 1.0); }
`;
