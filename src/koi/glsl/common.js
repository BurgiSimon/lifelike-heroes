// GLSL shared by every pass: the scene's one light, the pond's depth, the water's colour, small noise helpers.
// World space is the hero box in CSS px: x right, y down, z up toward the camera, which looks straight down.

export const fullscreenVert = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const common = /* glsl */ `
precision highp float;
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
const vec3 SUNCOL = vec3(3.25, 3.0, 2.62);
const vec3 SKYCOL = vec3(0.34, 0.47, 0.62);
// Water: what a unit of depth (DREF px at scale 1) takes out of the light on its way down and back, and the
// green-teal haze it puts in.
const float DREF = 100.0;
const vec3 SIGMA = vec3(1.75, 0.82, 1.02);
const vec3 HAZE = vec3(0.01, 0.05, 0.043);

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

// The basin: a shallow shelf where the pads grow, dropping to a pool under the headline. Px, like everything else.
float depthAt(vec2 p) {
  vec2 q = (p / uRes - vec2(0.5, 0.47)) * vec2(1.9, 2.15);
  float lump = vnoise(p / (uS * 260.0) + 3.7) - 0.5;
  float bowl = 1.0 - smoothstep(0.05, 0.95, dot(q, q) + lump * 0.34);
  return (30.0 + 100.0 * bowl * bowl * (3.0 - 2.0 * bowl) + 7.0 * lump) * uS;
}
// Koi keep to the upper half of the water: near the surface over the shelf, deeper over the pool.
float koiDepth(float d) { return clamp(0.45 * d, 13.0 * uS, 52.0 * uS); }
// What a path of d px through the water does to light that started as c.
vec3 throughWater(vec3 c, float d, float lit) {
  float k = d / (DREF * uS);
  return c * exp(-SIGMA * k) + HAZE * (1.0 - exp(-1.5 * k)) * lit;
}
`;

// The canopy overhead doubles as the gobo: where the photograph shows sky, the sun gets through.
export const gobo = /* glsl */ `
uniform sampler2D uSky;
float goboAt(vec2 p) {
  vec2 sway = vec2(sin(uTime * 0.21), cos(uTime * 0.17)) * 0.004 + vec2(sin(uTime * 0.53 + p.y * 0.004), cos(uTime * 0.47 + p.x * 0.004)) * 0.0015;
  vec2 uv = vec2(0.47, 0.44) + (p - uRes * 0.5) / (uS * 2300.0) + sway;
  float l = dot(textureLod(uSky, uv, 3.6).rgb, vec3(0.3, 0.5, 0.2));
  return mix(0.2, 1.0, smoothstep(0.22, 0.5, l));
}
`;
