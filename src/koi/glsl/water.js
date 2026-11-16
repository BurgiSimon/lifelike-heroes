// The water surface: wind ripples (a tileable sum of travelling waves), the interactive heightfield, the pass
// that adds them into one slope map, and the caustics those slopes focus onto the floor.
import { common } from './common.js';

export const WAVES = 22;
export const DROPS = 20;

// One tile of wind ripples: xy = height gradient per unit of tile uv, z = height. Whole wave numbers, so it tiles.
export const windFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform vec4 uWave[${WAVES}];  // kx, ky (cycles per tile), amplitude, angular speed
uniform float uPhase[${WAVES}];
uniform float uTime;
void main() {
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < ${WAVES}; i++) {
    vec4 w = uWave[i];
    float ph = 6.2831853 * dot(w.xy, vUv) - w.w * uTime + uPhase[i];
    h += w.z * sin(ph); g += w.z * 6.2831853 * w.xy * cos(ph);
  }
  o = vec4(g, h, 1.0);
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
// passes read it instead of working it out again, w = the sunward lean of rings and wakes. Half resolution is plenty.
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
  float face = dot(g, -SUN_A.xy) * 1.46;   // how far a ring or a wake leans toward the sun, apart from the wind
  // two copies of the wind tile at different scales and angles hide its period
  float t1 = 470.0 * uS; float t2 = 790.0 * uS;
  const mat2 R = mat2(0.829, 0.559, -0.559, 0.829);
  vec4 a = texture(uWind, p / t1);
  vec4 b = texture(uWind, R * p / t2 + vec2(0.31, 0.67));
  float calm = 1.0;
  for (int i = 0; i < 8; i++) { if (i >= uPads) break; calm *= 1.0 - 0.8 * smoothstep(uPad[i].z * 1.12, uPad[i].z * 0.8, distance(p, uPad[i].xy)); }
  float wa = uWindAmp * uS * calm;   // slopes, so the tiles' size must not change them
  g += wa * (a.xy / t1 + 1.25 * (b.xy * R) / t2);
  o = vec4(g, depthAt(p), face);
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
  float k = uFocus * (52.0 * uS + 0.62 * depthAt(p));   // deeper floor, longer throw; flattened so the deep end does not over-fold
  vec2 g = slope(p);
  vec2 gx = (slope(p + vec2(uCell.x, 0.0)) - slope(p - vec2(uCell.x, 0.0))) / (2.0 * uCell.x);
  vec2 gy = (slope(p + vec2(0.0, uCell.y)) - slope(p - vec2(0.0, uCell.y))) / (2.0 * uCell.y);
  // Jacobian of landing point by starting point: its determinant is the area the light now covers
  float det = (1.0 + k * gx.x) * (1.0 + k * gy.y) - k * k * gx.y * gy.x;
  vI = 1.0 / max(abs(det), 0.17);
  vec2 q = p + g * k;
  gl_Position = vec4(q.x / uRes.x * 2.0 - 1.0, 1.0 - q.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
export const causticFrag = /* glsl */ `
precision highp float;
in float vI; out vec4 o;
void main() { o = vec4(vI, vI, vI, 1.0); }
`;
