// GLSL for the pane. Everything is lit in linear light into a half-float target; `film` is the lens and the film.
// Screen space in the shaders is CSS pixels with y down, the same space index.js and pane.js work in. Lengths are
// written for a frame 900 px tall and scaled by S, so the picture is the same on any screen.
//
// The light: the city is the only light behind the glass (a photographed panorama, see tools/build-assets.mjs),
// and one warm lamp stands in the room behind the camera, up and to the left. Water is lit by nothing else: a drop
// shows the city through itself and the lamp on its skin; the mist glows with the city behind it.
import { TX, TY, GLOW, WIDE, LON, LAT } from './optics.js';

export const CAPS = 16;   // strokes wiped out of the mist in one pass (a pointer's path, a running drop's track)
const f = (v) => v.toFixed(4);

// highp int as well as float: three adds no precision to a raw shader, and a mediump uint hash is 16 bits on many
// phone GPUs (Mali; Adreno under Mesa), where it returns 0.
const head = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
uniform vec2 uRes;    // hero box, CSS px
uniform float uPx;    // device px per CSS px
#define S (uRes.y / 900.0)
`;

const noise = /* glsl */`
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

export const fullscreenVert = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---- the city, decoded once into linear light (with mips: the mist reads it blurred, a drop reads it small)
// ponytail: the city is one exposure and stands still. Headlights crawling along the quay would be a few instanced
// discs added to the lens target each frame; and a fast lens squeezes its discs to cat's eyes toward the corners,
// which the bake (one disc for the whole frame) does not do.
export const lensFrag = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uBase; uniform sampler2D uGlow; uniform float uExposure;
void main() { vec3 g = texture(uGlow, vUv).rgb; o = vec4((texture(uBase, vUv).rgb + g * g * ${f(GLOW)}) * uExposure, 1.0); }
`;
export const wideFrag = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uExposure;
void main() { o = vec4(pow(texture(uTex, vUv).rgb, vec3(2.2)) * ${f(WIDE)} * uExposure, 1.0); }
`;

// ---- the mist on the room side: r is how far it has come back at each point (0 wiped, 1 as thick as it gets
// there), g is the wet a finger leaves behind. It creeps back by itself and is wiped along strokes.
export const mistFrag = head + noise + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev;
uniform float uDt;           // s since the last pass (0: only wipe)
uniform float uRet;          // s of return owed to the mist since it last came back (render.js banks it, see RETURN)
uniform float uBack;         // share of the mist that returns per second
uniform int uCaps;
uniform vec4 uCap[${CAPS}];  // a stroke from xy to zw, CSS px
uniform vec4 uCapK[${CAPS}]; // its half-width, what is left of the mist in it (0: wiped clean), 1 for a finger and 0 for a drop
uniform sampler2D uMask; uniform vec4 uMaskMap; uniform float uLetters;   // the patch of breath round the headline
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 m = texture(uPrev, vUv).rg;
  // The headline is read against the mist round it, so a hand must not be able to rub it out: where the breath
  // lies, a wipe only thins the mist, and it is back in a few seconds. (A choice for the page, not for the physics.)
  float breath = (1.0 - texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r) * uLetters;
  // It comes back as fine droplets that seed sooner in some places than others, so a wiped patch closes unevenly.
  m.r = min(1.0, m.r + uRet * uBack * (0.5 + 1.1 * fbm(p / (70.0 * S) + 3.0)) * (1.0 + 9.0 * breath));
  m.g *= exp(-uDt / 7.0);
  for (int i = 0; i < ${CAPS}; i++) {
    if (i >= uCaps) break;
    vec2 a = uCap[i].xy; vec2 ba = uCap[i].zw - a; vec2 pa = p - a; vec3 k = uCapK[i].xyz;
    float len = length(ba); vec2 dir = len > 0.5 ? ba / len : vec2(0.0, 1.0);
    float d = length(pa - ba * clamp(dot(pa, ba) / max(len * len, 1e-4), 0.0, 1.0));
    // A fingertip does not wipe evenly: it leaves streaks that run the way it went, and a ragged edge.
    float across = dot(pa, vec2(-dir.y, dir.x)) / S + float(i) * 13.0;
    float streak = vnoise(vec2(across * 0.55, dot(a, vec2(0.013, 0.007))));
    float fine = vnoise(vec2(across * 1.9, 4.2));
    float edge = smoothstep(k.x * (1.0 - 0.42 * k.z) - 1.0, k.x + 1.0, d + k.z * k.x * 0.34 * (streak - 0.5));
    float left = k.y + k.z * 0.3 * smoothstep(0.62, 0.9, fine);
    m.r = min(m.r, mix(max(left, 0.5 * breath), 1.0, edge));
    m.g = max(m.g, k.z * (1.0 - edge));
  }
  o = vec4(m, 0.0, 1.0);
}
`;

// ---- the drops, as heights: each one a small cap of water, written into r (rain side) or g (room side), with
// the radius in b. Blended with MAX, so drops that touch are one body of water.
// ponytail: MAX leaves a crease where two drops meet; a smooth union of the caps would round it as surface tension does.
export const dropVert = /* glsl */`precision highp float; precision highp int;
in vec3 position;
in vec4 aDrop;   // x, y, radius, length of the tail it draws out behind it (CSS px)
in vec4 aKind;   // seed 0..1, side (0 rain, 1 room), how far from round
uniform vec2 uRes;
out vec2 vQ; out vec4 vDrop; out vec4 vKind;
void main() {
  float r = aDrop.z;
  // the quad: a margin round the head, and room above it for the tail
  vec2 q = mix(vec2(-1.3 * r, -1.3 * r - aDrop.w), vec2(1.3 * r, 1.45 * r), position.xy * 0.5 + 0.5);
  vQ = q; vDrop = aDrop; vKind = aKind;
  vec2 p = aDrop.xy + q;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
export const dropFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vQ; in vec4 vDrop; in vec4 vKind;
out vec4 o;
const float K = 1.5557;   // a cap that meets the glass at 40 degrees, as water does on a window nobody polished: 1 / sin(40°), in radii
float cap(float d) { return d < 1.0 ? sqrt(K * K - d * d) - sqrt(K * K - 1.0) : 0.0; }
void main() {
  float r = vDrop.z; float tail = vDrop.w; float seed = vKind.x;
  vec2 q = vQ / r;
  float a = atan(q.y, q.x);
  // No drop is a circle: its edge is pinned wherever the glass happened to hold it.
  float wob = 1.0 + vKind.z * (0.075 * sin(2.0 * a + seed * 6.28) + 0.05 * sin(3.0 * a + seed * 17.0) + 0.02 * sin(5.0 * a + seed * 41.0));
  q.y *= q.y < 0.0 ? 1.07 : 0.95;   // and the water hangs low in it
  float h = cap(length(q) / wob) * (1.0 + 0.24 * q.y);
  if (tail > 0.5 && vQ.y < 0.0) {
    // A running drop draws water out behind it, narrowing toward where it came from, never evenly.
    float t = clamp(-vQ.y / tail, 0.0, 1.0);
    float w = mix(0.9, 0.14, pow(t, 0.6)) * (1.0 + 0.14 * sin(t * 11.0 + seed * 30.0));
    h = max(h, 0.8 * w * cap(abs(vQ.x / r) / w) * step(-vQ.y, tail));
  }
  if (h <= 0.0) discard;
  o = vec4(h * r * (1.0 - vKind.y), h * r * vKind.y, r, 1.0);
}
`;

// ---- the photograph: the city through the glass, the rain on its far side, the mist on the near side, and the
// drops that run through the mist. One pass.
export const sceneFrag = head + noise + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D uWater;   // r: rain-side height, g: room-side height, b: radius of the drop (CSS px)
uniform sampler2D uMist;    // r: how far the mist has come back, g: a finger's wet
uniform sampler2D uText;    // b: the letters, r: the same, soft
uniform sampler2D uMask;    // 0 round the headline's lines, 1 away from them
uniform vec4 uMaskMap;
uniform sampler2D uLens;    // the city as the lens draws it, focused on the glass: every lamp a disc
uniform sampler2D uWide;    // the city in focus, 2*LON by 2*LAT degrees
uniform vec2 uTexel;        // one texel of uWater
uniform vec3 uCam;          // xy: where the lens's axis meets the frame; z: its focal length (CSS px)
uniform float uLodLens;     // texels of uLens per CSS px
uniform float uThick;       // the mist option
uniform float uLetters;     // 1 while the headline is written on the glass

const vec2 WIDE = vec2(${f(LON * Math.PI / 180)}, ${f(LAT * Math.PI / 180)});
const vec3 LAMP = vec3(1.0, 0.66, 0.36);                   // the room's lamp: tungsten against the city's blue
const vec3 TO_LAMP = vec3(-0.222, -0.278, 0.935);          // the way a drop's skin must face to mirror it into the lens

vec3 lensAt(vec2 p, float lod) {
  vec2 t = (p - uCam.xy) / uCam.z;
  return textureLod(uLens, vec2(0.5 + t.x / ${f(2 * TX)}, 0.5 - t.y / ${f(2 * TY)}), lod).rgb;
}
// The city spread by size px of scatter: four taps on a turned square hide the blocks of a coarse mip.
vec3 spread(vec2 p, float size) {
  float lod = log2(max(size * uLodLens, 1.0)); float r = size * 0.55;
  return 0.25 * (lensAt(p + r * vec2(0.38, 0.92), lod) + lensAt(p + r * vec2(-0.92, 0.38), lod) + lensAt(p + r * vec2(-0.38, -0.92), lod) + lensAt(p + r * vec2(0.92, -0.38), lod));
}

// What is seen through water whose skin slopes by g (rise over run, pointing to where it is thickest). A drop is a
// small strong lens: each point of it turns the lens's whole cone of sight aside, toward the thick of the drop, so
// it holds the city upside down and very small. The cone is as wide as ever, so what the drop holds is the same
// defocused city, not a sharp one. Its middle looks straight on; its rim looks nearly 20 degrees away.
vec3 through(vec2 p, vec2 g, float r) {
  float sl = length(g); float th = atan(sl); float s = 1.333 * sin(th);
  float turn = asin(min(s, 1.0)) - th;
  vec2 dir = g / max(sl, 1e-4);
  vec2 t = (p - uCam.xy) / uCam.z;
  vec2 ang = clamp(atan(t) + turn * dir, -1.2, 1.2);        // the direction looked in, radians right and down of the axis
  vec2 tt = tan(ang);
  float size = max(r * uPx, 1.0);                             // the drop's radius in device px: it sets how small its picture is
  vec2 uvL = vec2(0.5 + tt.x / ${f(2 * TX)}, 0.5 - tt.y / ${f(2 * TY)});
  vec3 c = textureLod(uLens, uvL, clamp(log2(0.21 * uLodLens * uCam.z / size) + 0.4, 0.0, 8.0)).rgb;
  // Further off axis than the lens's own picture reaches: the wide panorama, blurred by about the same cone.
  vec2 off = abs(uvL - 0.5) * 2.0; float beyond = max(smoothstep(0.78, 1.0, off.x), smoothstep(0.78, 1.0, off.y));
  if (beyond > 0.0) c = mix(c, textureLod(uWide, clamp(0.5 + vec2(ang.x, -ang.y) / (2.0 * WIDE), 0.004, 0.996), clamp(log2(99.0 / size), 4.6, 8.0)).rgb, beyond);
  // Toward its rim the skin is steep and mirrors more of the dark room than it lets through: a thin dark edge.
  c *= 1.0 - 0.7 * smoothstep(0.62, 0.9, s);
  // The lamp, mirrored small on every drop in the same place: the one thing in the picture lit from this side.
  vec3 n = normalize(vec3(-g, 1.0));
  float glint = smoothstep(0.9982, 0.9996, dot(n, TO_LAMP));
  return c + LAMP * 4.0 * glint * smoothstep(3.0, 6.0, size);
}

// How thick the mist lies, 0..1: most low on the pane and toward its frame, where the glass is coldest, in uneven
// patches; least high in the middle.
float lies(vec2 p) {
  vec2 u = p / uRes;
  float low = smoothstep(0.1, 0.95, u.y); float side = smoothstep(0.3, 0.5, abs(u.x - 0.5));
  return clamp(0.68 + 0.24 * low + 0.1 * side + 0.42 * (fbm(p / (250.0 * S) + 5.0) - 0.5), 0.0, 1.0);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  // the water: both sides' heights here and one texel to each side, for the slope of each
  vec3 w = texture(uWater, vUv).rgb;
  vec2 wl = texture(uWater, vUv - vec2(uTexel.x, 0.0)).rg; vec2 wr = texture(uWater, vUv + vec2(uTexel.x, 0.0)).rg;
  vec2 wu = texture(uWater, vUv + vec2(0.0, uTexel.y)).rg; vec2 wd = texture(uWater, vUv - vec2(0.0, uTexel.y)).rg;
  float e = 2.0 / uPx;
  vec2 gFar = vec2(wr.r - wl.r, wd.r - wu.r) / e; vec2 gNear = vec2(wr.g - wl.g, wd.g - wu.g) / e;

  // the far side: the city, and the rain standing on the glass in front of it
  vec3 col = lensAt(p, 0.0);
  if (w.r > 0.0) col = mix(col, through(p, gFar, w.b), smoothstep(0.0, 0.3, w.r));

  // the mist. The letters are where it is not: sampled with a small wander, so no stroke has a ruled edge.
  vec2 mist = texture(uMist, vUv).rg;
  vec2 wander = (vec2(vnoise(p / (6.0 * S)), vnoise(p / (6.0 * S) + 31.7)) - 0.5) * 2.2 * S;
  vec3 ink = texture(uText, vec2(p.x + wander.x, uRes.y - p.y - wander.y) / uRes).rgb * uLetters;
  float breath = (1.0 - texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r) * uLetters;   // someone breathed on the glass to write on it
  // It returns as specks before it is a film again: the grain only shows while a patch is closing.
  float back = clamp(mist.r + (vnoise(p * uPx / 1.3) - 0.5) * 0.36 * sin(3.14159 * mist.r), 0.0, 1.0);
  float fog = back * clamp(lies(p) * uThick + 0.7 * breath, 0.0, 0.96) * (1.0 - ink.b);
  // Beside each stroke the water that was pushed aside stands in a row of fine beads, each a clear spot in the mist.
  vec2 cell = p / (3.3 * S); vec2 id = floor(cell);
  float bead = smoothstep(0.4, 0.2, length(fract(cell) - 0.5 - 0.28 * (vec2(hash(id), hash(id + 9.0)) - 0.5))) * step(0.42, hash(id + 3.0));
  float rim = ink.r * (1.0 - ink.b);
  fog *= 1.0 - 0.8 * bead * smoothstep(0.08, 0.5, rim);
  // a finger leaves its own wet behind: finer beads, for a few seconds
  fog *= 1.0 - 0.5 * bead * mist.g * (1.0 - back);
  // Mist is a diffuser: it hands on the light behind it, spread wide (most of it nearby, some of it very far) and
  // dimmer, because much of what it scatters never reaches the lens; and it catches a little of the room's lamp.
  // The lamp stands to the left, so its share falls off across the pane; and where the breath lies the mist is at
  // its thickest and whitest, which is what the writing is read against.
  vec3 room = mix(LAMP, vec3(0.8), 0.3) * (mix(0.024, 0.006, smoothstep(0.0, 0.8, p.x / uRes.x)) + 0.17 * breath);
  vec3 glow = (0.6 * spread(p, 44.0 * S) + 0.4 * spread(p, 190.0 * S)) * vec3(0.56, 0.58, 0.63) + room;
  // It is droplets, too small to see singly but not evenly small: a grain the lens only just resolves, which stays put.
  float grit = 0.5 * vnoise(p * uPx / 1.2 + 11.0) + 0.5 * vnoise(p / (3.4 * S) + 5.0);
  col = mix(col, glow * (0.94 + 0.12 * grit), clamp(fog * (0.97 + 0.06 * grit), 0.0, 1.0));

  // the near side: water in front of the mist, so nothing softens it
  float near = smoothstep(0.0, 0.3, w.g);
  if (near > 0.0) col = mix(col, through(p, gNear, w.b), near);
  o = vec4(col, 1.0);
}
`;

// Bright-pass and blur for a restrained bloom: only light that really is brighter than paper white glows.
export const brightFrag = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec3 c = 0.25 * (texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  float l = max(c.r, max(c.g, c.b));
  o = vec4(min(c, vec3(24.0)) * smoothstep(1.6, 4.0, l), 1.0);
}
`;
export const blurFrag = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uStep;
void main() {
  vec4 c = texture(uTex, vUv) * 0.2270;
  c += (texture(uTex, vUv + uStep * 1.3846) + texture(uTex, vUv - uStep * 1.3846)) * 0.3162;
  c += (texture(uTex, vUv + uStep * 3.2308) + texture(uTex, vUv - uStep * 3.2308)) * 0.0703;
  o = c;
}
`;

// The lens and the film, in the order a camera does them: glow round what burns out, falloff toward the corners,
// the tone curve that folds scene light into the display's range, a grade, the display's own encoding, grain.
export const filmFrag = (toneChunk) => /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uFrame; uniform float uBloomK;
${toneChunk}
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
  // lens: a fast 50 mm wide open loses a good stop toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.9); c *= mix(1.0, fall * fall, 0.5);
  c = AgXToneMapping(c);
  // grade, on display light: the flat transform given back some contrast and colour; night stays cool in the shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.3);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
  c *= mix(vec3(0.93, 0.98, 1.07), vec3(1.03, 1.0, 0.97), smoothstep(0.0, 0.5, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // grain: a night exposure is a noisy one. Strongest in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.024 * (0.4 + 0.6 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
