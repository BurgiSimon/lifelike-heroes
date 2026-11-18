// GLSL for the scene. Everything is lit in linear light into a half-float target; `film` is the lens and the film.
// Screen space in the shaders is CSS pixels with y down, the same space index.js lays the page out in; z points at
// the lens. Lengths are written for a frame 900 px tall and scaled by S, so the picture is the same on any screen.
//
// STARTER SUBJECT: damp sand under a low sun, seen from straight above. It is a stand-in, here so that the light and
// the film have something to show and every wire is live (time, pointer, marks, the quiet under the type). Replace
// `subject` with the real scene; keep `noise`, the bloom passes and `filmFrag`, and retune them to the new picture.

export const MARKS = 8;   // marks kept (index.js drops the oldest); the size of uMarks

const head = /* glsl */`precision highp float;
precision highp sampler2D;
uniform vec2 uRes;    // hero box, CSS px
uniform float uPx;    // device px per CSS px, for edges that stay crisp at any ratio
uniform float uTime;  // the scene's own clock, s
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

// The stand-in subject. One key light and one sky: every surface is lit by these two and by nothing else, and what
// stands up throws its shadow the same way everywhere.
const subject = /* glsl */`
uniform vec3 uPtr;               // the pointer: x, y, and how much it is there (0..1, eased)
uniform float uReach;            // the reach option, CSS px
uniform vec4 uMarks[${MARKS}];   // x, y, age in s, 1 while kept

const vec3 SUN = vec3(-0.722, -0.602, 0.341);   // toward the sun: upper left, 20° above the sand, so it rakes every ripple
const vec3 SUNCOL = vec3(3.5, 3.0, 2.3);        // scene light is not clamped: sunlit sand is several times paper white
const vec3 SKYCOL = vec3(0.30, 0.42, 0.60);     // what the open sky gives the shade

// The surface's height above its bed at p, px. Wind ripples (a long windward slope and a short lee face, their
// crests wandering and forking), the dent that follows the pointer, and what the visitor's marks have left.
float heightAt(vec2 p) {
  vec2 q = p / S;
  float r = fract(dot(q, vec2(0.80, 0.60)) / 64.0 + 2.4 * fbm(q / 230.0 + 3.0));   // no crest is a straight line
  float h = 6.0 * smoothstep(0.0, 0.72, r) * (1.0 - smoothstep(0.72, 1.0, r)) * (0.5 + vnoise(q / 170.0 + 7.0));
  vec2 d = (p - uPtr.xy) / uReach; float dd = dot(d, d);
  h += uPtr.z * (2.2 * exp(-pow(sqrt(dd) * 2.6 - 1.0, 2.0) * 7.0) - 8.0 * exp(-dd * 6.5));   // pressed in, and pushed up round the rim
  for (int i = 0; i < ${MARKS}; i++) {
    vec4 m = uMarks[i]; if (m.w < 0.5) continue;
    float l = length(p - m.xy) / S;
    float front = 15.0 + 110.0 * (1.0 - exp(-m.z * 1.3));   // the ring of thrown grains runs out and comes to rest
    h += 2.4 * exp(-pow((l - 15.0) / 5.0, 2.0)) - 7.0 * exp(-l * l / 150.0) + 1.8 * exp(-m.z * 0.8) * exp(-pow((l - front) / 8.0, 2.0));
  }
  return h * S;
}

vec3 shade(vec2 p) {
  vec2 q = p / S;
  float h = heightAt(p);
  vec3 n = normalize(vec3(h - heightAt(p + vec2(1.0, 0.0)), h - heightAt(p + vec2(0.0, 1.0)), 1.0));
  n = normalize(n + vec3(0.16 * (vec2(vnoise(q / 2.3), vnoise(q / 2.3 + 40.0)) - 0.5), 0.0));   // the grain of it
  // The sun is low, so every ripple throws a shadow: walk toward the sun and see whether the sand rises above the ray.
  float lit = 1.0; vec2 toSun = normalize(SUN.xy); float climb = SUN.z / length(SUN.xy);
  #ifdef LOW
  const int STEPS = 3;
  #else
  const int STEPS = 6;
  #endif
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) * (24.0 / float(STEPS)) * S;
    lit = min(lit, smoothstep(-0.8 * S, 0.6 * S, h + climb * t - heightAt(p + toSun * t)));
  }
  // Clouds cross the sun: broad soft shadows that drift over the sand, so the picture is never quite the same.
  float sun = mix(0.34, 1.0, smoothstep(0.38, 0.6, fbm(q / 520.0 + vec2(uTime * 0.021, uTime * 0.008))));
  // Sand: paler on the crests where it has dried, darker and a little redder where it lies damp in the hollows.
  float damp = smoothstep(4.5 * S, 0.5 * S, h);
  vec3 alb = mix(vec3(0.43, 0.36, 0.27), vec3(0.25, 0.20, 0.145), 0.75 * damp) * (0.86 + 0.28 * fbm(q / 60.0 + 23.0));
  vec3 col = alb * (SUNCOL * sun * lit * max(dot(n, SUN), 0.0) + SKYCOL * (0.55 + 0.45 * n.z) * mix(0.7, 1.0, 1.0 - damp));
  // A few grains of quartz mirror the sun straight into the lens and burn out: this is what the bloom is for.
  float facet = hash(floor(p * uPx) + 91.0);
  col += SUNCOL * 5.0 * sun * lit * step(0.9988, facet) * smoothstep(0.2, 0.5, dot(n, normalize(SUN + vec3(0.0, 0.0, 1.0))) - 0.45);
  return col;
}
`;

export const sceneFrag = head + noise + subject + /* glsl */`
uniform sampler2D uMask; uniform vec4 uMaskMap;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec3 col = shade(p);
  // The quiet under the type: a soft dip in exposure that takes most from the brightest light, so the headline
  // never has to compete with a highlight. 0 behind the type, 1 away from it.
  float quiet = 1.0 - texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r;
  col *= (1.0 - 0.3 * quiet) / (1.0 + 1.6 * quiet * dot(col, vec3(0.3, 0.6, 0.1)));
  o = vec4(col, 1.0);
}
`;

// Bright-pass and blur for a restrained bloom: only light that really is brighter than paper white glows.
export const brightFrag = /* glsl */`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec3 c = 0.25 * (texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  float l = max(c.r, max(c.g, c.b));
  o = vec4(min(c, vec3(40.0)) * smoothstep(2.4, 5.0, l), 1.0);
}
`;
export const blurFrag = /* glsl */`precision highp float;
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
export const filmFrag = (toneChunk) => /* glsl */`precision highp float;
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
  // lens: light falls off gently toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.42);
  c = AgXToneMapping(c);
  // grade, on display light: a touch more contrast and colour than the flat transform, cool shadows under warm lights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.25);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.4);
  c *= mix(vec3(0.94, 1.0, 1.05), vec3(1.05, 1.0, 0.94), smoothstep(0.0, 0.6, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // fine grain, strongest in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.019 * (0.35 + 0.65 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
