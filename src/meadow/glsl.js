// GLSL shared by every material in the meadow: the light, the lens, the wind and the bend of a stem.
import * as THREE from 'three';
import { D, SUN, SUN_COL, SH, LENS, WIND, CURVE } from './config.js';

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

// One set of uniform objects per mounted hero, shared by reference between its materials, so a frame updates each
// value once and two heroes on a page do not write over each other.
export function createShared() {
  return {
    uSun: { value: new THREE.Vector3(...SUN).normalize() },
    uSunCol: { value: new THREE.Vector3(...SUN_COL) },
    uSH: { value: SH.map((c) => new THREE.Vector3(...c)) },
    uLens: { value: new THREE.Vector2(LENS.a / LENS.max, D) },
    uTime: { value: 0 },                                   // the wind's own clock, s
    uWind: { value: 1 },
    uBurst: { value: new THREE.Vector2(-1e4, 0) },         // the one-off gust: position along the wind axis, strength
    uPush: { value: null },                                // pointer spring field, (x share, depth) → lean in rad
    uHz: { value: new THREE.Vector2(0.53, 1.03) },         // horizon and foot of the field as shares of the height
    uMask: { value: null },                                // the word's silhouette, mipped: its shadow
    uMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },   // x0, y0, 1/w, 1/h in world metres
    uWordZ: { value: -D },
    uPx: { value: 0.001 },                                 // world size of one pixel at unit distance
    uFrame: { value: 0.8 },                                // world width of the frame at unit distance
    uHaze: { value: new THREE.Vector3(1.5, 1.0, 0.62) },
    uCloud: { value: new THREE.Vector3() },                // the clouds' drift: their shadows' offset in x and z (m), the sky's turn (share of the plate)
    uSunny: { value: 1 },                                  // how much of the sun reaches the lens through them, 0..1
  };
}

// Colour is stored tone-compressed, then square-rooted into 8 bits: the MSAA resolve averages close to what the eye
// will see, and the scene target is a quarter the memory of half-float (the frame's cost is mostly its bandwidth).
// The post chain inverts it.
export const PACK = /* glsl */`vec3 pack(vec3 c) { return sqrt(c / (1.0 + max(c.r, max(c.g, c.b)))); }`;

export const LIGHT = /* glsl */`
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSH[9]; uniform vec2 uLens; uniform vec3 uHaze;
uniform sampler2D uMask; uniform vec4 uMaskRect; uniform float uWordZ; uniform vec3 uCloud;

// Sky light on a surface facing n: irradiance / pi, from the HDRI.
vec3 skyLight(vec3 n) {
  return max(vec3(0.0), uSH[0] * 0.282095 + 0.488603 * (uSH[1] * n.y + uSH[2] * n.z + uSH[3] * n.x)
    + 1.092548 * (uSH[4] * n.x * n.y + uSH[5] * n.y * n.z + uSH[7] * n.x * n.z)
    + uSH[6] * 0.315392 * (3.0 * n.z * n.z - 1.0) + uSH[8] * 0.546274 * (n.x * n.x - n.y * n.y));
}
${PACK}
// Circle of confusion at a view depth, as a share of the largest radius the post blur handles.
float cocAt(float depth) { return clamp(uLens.x * abs(uLens.y / max(depth, 0.05) - 1.0), 0.0, 1.0); }
// The word's shadow: walk from p toward the sun to the plane the letters stand in and read their silhouette,
// blurrier the further the shadow has travelled (a penumbra).
float wordShadow(vec3 p) {
  float s = (uWordZ - p.z) / uSun.z;
  if (s <= 0.0) return 1.0;
  vec3 q = p + uSun * s;
  vec2 uv = (q.xy - uMaskRect.xy) * uMaskRect.zw;
  float lod = log2(max(1.0, s * 0.021 * 2048.0 * uMaskRect.z));   // blur in texels: the sun through thin cloud, about 1.2 degrees across
  return 1.0 - textureLod(uMask, uv, lod).r;
}
// The sun through the drifting clouds, 0.3..1: broad soft shadows that cross the field with the wind.
float cloudSun(vec2 xz) {
  vec2 q = (xz - uCloud.xy) * 0.06;
  float n = sin(q.x * 1.7 + 1.3 * sin(q.y * 1.1 + 0.5)) * sin(q.y * 1.3 + 1.1 * sin(q.x * 0.7)) + 0.3 * sin(q.x * 3.1 - q.y * 2.3);
  return mix(0.3, 1.0, smoothstep(-0.7, -0.1, n));
}
// A little air between the lens and the far field, lit from behind.
vec3 haze(vec3 c, float dist) { return mix(c, uHaze, 1.0 - exp(-dist * 0.003)); }
// Height of the sward at a spot, m: taller and shorter stands, the same function the planting uses.
float sward(vec2 p) {
  float a = sin(p.x * 1.3 + p.y * 0.55) * sin(p.x * 0.4 + p.y * 0.25 + 1.3);
  float b = sin(p.x * 0.31 + 1.7 * sin(p.y * 0.23 + 0.4)) * sin(p.y * 0.37 + 1.1 * sin(p.x * 0.19));
  return 0.42 + 0.11 * a + 0.17 * b;
}
// Worn spots where little grows and the thatch shows, 0..1.
float bare(vec2 p) { return smoothstep(0.80, 0.93, 0.5 + 0.5 * sin(p.x * 1.1 + 2.3 * sin(p.y * 0.7)) * sin(p.y * 0.95 + 1.9 * sin(p.x * 0.6) + 1.0)); }
// How much sun reaches a point at height up in the sward: at this low angle the grass toward the sun shades all
// but the tops, and tall stands throw their shade a long way.
float swardSun(vec3 p, float up) {
  vec2 s = normalize(uSun.xz); float rise = uSun.y / length(uSun.xz);
  float v = smoothstep(-0.10, 0.05, up + 0.3 * rise - 0.92 * sward(p.xz + s * 0.3));
  v *= smoothstep(-0.12, 0.06, up + 0.9 * rise - 0.92 * sward(p.xz + s * 0.9));
  v *= smoothstep(-0.14, 0.08, up + 2.0 * rise - 0.92 * sward(p.xz + s * 2.0));
  return v;
}
`;

export const WIND_GLSL = /* glsl */`
uniform float uTime; uniform float uWind; uniform vec2 uBurst; uniform sampler2D uPush; uniform vec2 uHz;
const vec2 WDIR = vec2(${f(WIND.dir[0])}, ${f(WIND.dir[1])});

// Lean from the weather, in rad along WDIR: a ripple, gusts whose fronts cross the field on a slant, a steady lean
// above a breeze, and the one-off gust.
float weather(vec2 xz, float ph) {
  float u = dot(xz, WDIR); float v = dot(xz, vec2(-WDIR.y, WDIR.x));
  float warp = 0.9 * sin(v * 0.31 + 1.3 * sin(u * 0.11)) + 0.5 * sin(v * 0.83 + u * 0.27);   // no front is a straight line
  float g = max(0.0, sin(u * ${f(WIND.gust.k)} - uTime * ${f(WIND.gust.w)} + warp));
  float a = uWind * (${f(WIND.ripple.amp)} * sin(u * ${f(WIND.ripple.k)} - uTime * ${f(WIND.ripple.w)} + ph) + ${f(WIND.gust.amp)} * g * g * g * (0.55 + 0.45 * sin(u * 0.05 - uTime * 0.11 + 2.0 * sin(v * 0.07))))   // no two fronts are as strong
    + ${f(WIND.lean)} * max(0.0, uWind - 1.0);
  float d = (u + warp * 0.6 - uBurst.x) / ${f(WIND.burst.width)};
  float b = max(0.0, 1.0 - d * d);
  return a + uBurst.y * ${f(WIND.burst.lean)} * b * b;
}
// Lean from the pointer, in rad along +x: the spring field is laid out as the original's field was, by the root's
// place across the frame and its depth down it.
float pushAt(vec4 rootClip) {
  vec2 s = rootClip.xy / rootClip.w;
  float p = pow(clamp((0.5 - 0.5 * s.y - uHz.x) / (uHz.y - uHz.x), 0.0, 1.0), ${f(1 / CURVE)});
  return texture2D(uPush, vec2(s.x * 0.5 + 0.5, p)).r;
}
// A stem of height h rooted at the origin, leaning by the vector lean (rad, in xz): the original's quadratic curve.
// nod bows its top over the way it leans, as a heavy seed head does. Returns the point at t and writes the tangent.
vec3 stemAt(float t, float h, vec2 lean, float nod, out vec3 tangent) {
  float a = length(lean); vec2 dir = a > 1e-4 ? lean / a : vec2(1.0, 0.0);
  a = 1.2 * (1.0 - exp(-a / 1.2));     // a stem resists the more it is bent: even a gale does not lay the field flat
  float sa = sin(a);
  vec3 p1 = vec3(dir.x * 0.15 * sa, 0.6, dir.y * 0.15 * sa) * h;
  vec3 p2 = vec3(dir.x * sa, cos(a), dir.y * sa) * h;
  float k = clamp((t - 0.55) / 0.45, 0.0, 1.0); vec3 bow = vec3(dir.x, -0.55, dir.y) * h * nod;
  tangent = normalize(2.0 * (1.0 - t) * p1 + 2.0 * t * (p2 - p1) + bow * k * 4.4);
  return 2.0 * t * (1.0 - t) * p1 + t * t * p2 + bow * k * k;
}
`;

export function sward(x, z) {
  const a = Math.sin(x * 1.3 + z * 0.55) * Math.sin(x * 0.4 + z * 0.25 + 1.3);
  const b = Math.sin(x * 0.31 + 1.7 * Math.sin(z * 0.23 + 0.4)) * Math.sin(z * 0.37 + 1.1 * Math.sin(x * 0.19));
  return 0.42 + 0.11 * a + 0.17 * b;
}

export function bare(x, z) {
  const t = Math.min(1, Math.max(0, (0.5 + 0.5 * Math.sin(x * 1.1 + 2.3 * Math.sin(z * 0.7)) * Math.sin(z * 0.95 + 1.9 * Math.sin(x * 0.6) + 1.0) - 0.80) / 0.13));
  return t * t * (3 - 2 * t);
}

// cloudSun() on the CPU, for what the lens itself sees of the sun.
export function cloudSun(x, z, cx, cz) {
  const qx = (x - cx) * 0.06; const qy = (z - cz) * 0.06;
  const n = Math.sin(qx * 1.7 + 1.3 * Math.sin(qy * 1.1 + 0.5)) * Math.sin(qy * 1.3 + 1.1 * Math.sin(qx * 0.7)) + 0.3 * Math.sin(qx * 3.1 - qy * 2.3);
  const t = Math.min(1, Math.max(0, (n + 0.7) / 0.6));
  return 0.3 + 0.7 * t * t * (3 - 2 * t);
}

// The same weather on the CPU, for the seeds.
export function weatherAt(x, z, ph, time, wind, burstX, burstK) {
  const u = x * WIND.dir[0] + z * WIND.dir[1]; const v = -x * WIND.dir[1] + z * WIND.dir[0];
  const warp = 0.9 * Math.sin(v * 0.31 + 1.3 * Math.sin(u * 0.11)) + 0.5 * Math.sin(v * 0.83 + u * 0.27);
  const g = Math.max(0, Math.sin(u * WIND.gust.k - time * WIND.gust.w + warp));
  let a = wind * (WIND.ripple.amp * Math.sin(u * WIND.ripple.k - time * WIND.ripple.w + ph) + WIND.gust.amp * g * g * g * (0.55 + 0.45 * Math.sin(u * 0.05 - time * 0.11 + 2 * Math.sin(v * 0.07)))) + WIND.lean * Math.max(0, wind - 1);
  const d = (u + warp * 0.6 - burstX) / WIND.burst.width; const b = Math.max(0, 1 - d * d);
  a += burstK * WIND.burst.lean * b * b;
  return a;
}
