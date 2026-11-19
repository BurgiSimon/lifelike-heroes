// GLSL shared by every pass: the scene's one light, the pond's depth, the water's colour, small noise helpers.
// World space is the hero box in CSS px: x right, y down, z up toward the camera, which looks straight down.

export const fullscreenVert = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const common = /* glsl */ `
precision highp float; precision highp int;   // int too: three adds no precision to a raw shader, and a mediump uint hash is 16 bits on many phone GPUs (it returns 0)
precision highp sampler2D;
uniform vec2 uRes;   // hero box, CSS px
uniform float uS;    // scene scale (the original's S)
uniform float uPx;   // device px per CSS px, for analytic edges
uniform float uTime;

// One key light: a mid-morning sun from the upper left. SUN_A is its direction above the water, SUN_W after it
// has refracted into the water; shadows on the floor fall along SHDIR, TANW px per px of depth.
const vec3 SUN_A = vec3(-0.373, -0.574, 0.729);
const vec3 SUN_W = vec3(-0.280, -0.431, 0.857);
const vec2 SHDIR = vec2(0.545, 0.838);
const float TANW = 0.6;
const vec3 SUNCOL = vec3(3.4, 3.0, 2.5);
const vec3 SKYCOL = vec3(0.34, 0.47, 0.62);
// Water: what a unit of depth (DREF px at scale 1) takes out of the light on its way down and back, and the
// green-teal haze that sunlight scatters into it.
const float DREF = 145.0;
const vec3 SIGMA = vec3(0.78, 0.36, 0.5);
const vec3 HAZE = vec3(0.006, 0.024, 0.021);

vec2 uvOf(vec2 p) { return vec2(p.x / uRes.x, 1.0 - p.y / uRes.y); }

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
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

// The basin: a shallow shelf where the pads grow, falling in one long uneven slope to a pool that lies under
// the headline and runs out of frame toward the lower right. Px, like everything else.
float depthAt(vec2 p) {
  vec2 q = (p / uRes - vec2(0.47, 0.5)) * vec2(1.62, 1.9);
  float lump = vnoise(p / (uS * 260.0) + 3.7) - 0.5;
  float fine = vnoise(p / (uS * 105.0) + 11.3) - 0.5;
  float lobe = 1.0 - 0.5 * smoothstep(-0.3, 0.9, dot(q, vec2(0.74, 0.67)) / (length(q) + 0.05));
  float bowl = 1.0 - smoothstep(-0.1, 1.15, dot(q, q) * lobe + lump * 0.44 + fine * 0.2);
  return (44.0 + 186.0 * bowl + 10.0 * lump) * uS;
}
// How far below the surface a koi of size z lies where the water is d deep: its back just under the surface
// at dive 0, as low as it goes at dive 1, and never in the stones.
float koiDepth(float d, float dive, float z) {
  float top = (8.0 + 2.5 * z) * uS;
  return mix(top, max(top, min(d - (6.0 + 3.0 * z) * uS, 125.0 * uS)), dive);
}
// What a path of d px through the water does to light that started as c.
vec3 throughWater(vec3 c, float d, float lit) {
  float k = d / (DREF * uS);
  return c * exp(-SIGMA * k) + HAZE * (1.0 - exp(-1.5 * k)) * lit;
}
`;

// What stands between the sun and the water, as seen from the point p on the surface where a ray enters: the
// pavilion's roof of timber beams, running a little off the frame's long side and ending at an eave, beyond
// which the court lies in open sun. soft is the penumbra in px: wider the deeper the light lands.
export const gobo = /* glsl */ `
const vec2 BEAM = vec2(-0.41, 0.912);    // across the beams
float goboAt(vec2 p, float soft) {
  float a = dot(p - uRes * 0.5, BEAM) / uS;
  float e = 3.5 + soft / uS;
  float bar = abs(fract(a / 150.0 + 0.26) - 0.5) * 150.0;            // px from the middle of the nearest gap
  float gaps = 1.0 - smoothstep(46.0 - e, 46.0 + e, bar);             // the beams take two fifths of the light
  float court = smoothstep(260.0 - e, 260.0 + e, a);                  // past the eave nothing is overhead
  return mix(0.05, 1.0, max(gaps, court));
}
`;
