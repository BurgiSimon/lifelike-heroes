// Koi: ribbons built on the simulated spine, shaded as round bodies and thin fins seen from straight above.
// aA = (u along the part, signed px from the midline, half-width px, taper slope | fin length px),
// aT = direction toward the tail, aC = (variety, seed, size, part: 0 body, 1 tail fin, 2 pectoral, 3 pelvic).
import { common, gobo } from './common.js';

export const koiVert = /* glsl */ `
${common}
in vec2 aPos; in vec4 aA; in vec2 aT; in vec4 aC;
out vec4 vA; out vec2 vT; flat out vec4 vC; out vec2 vP;
void main() {
  vA = aA; vT = aT; vC = aC; vP = aPos;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// Silhouettes for the floor shadows: bodies solid, fins letting some light through.
export const koiMaskFrag = /* glsl */ `
precision highp float;
uniform float uPx;
in vec4 vA; flat in vec4 vC; out vec4 o;
void main() {
  float a = clamp((vA.z - abs(vA.y)) * uPx * 0.34 + 0.5, 0.0, 1.0);
  if (vC.w > 0.5) a *= vC.w < 1.5 ? 0.6 * (1.0 - 0.6 * vA.x) : 0.45;
  o = vec4(a, 0.0, 0.0, a);
}
`;

export const koiFrag = /* glsl */ `
${common}
${gobo}
in vec4 vA; in vec2 vT; flat in vec4 vC; in vec2 vP;
out vec4 o;
uniform sampler2D uCaust; uniform sampler2D uShadow; uniform sampler2D uText;

const vec3 WHITE = vec3(0.6, 0.585, 0.54);
const vec3 HI = vec3(0.56, 0.06, 0.014);     // koi red sits toward orange
const vec3 SUMI = vec3(0.02, 0.021, 0.027);

float fbm2(vec2 p) { return 0.62 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 5.3) + 0.08 * vnoise(p * 4.7 + 1.9); }
// A patch with a crisp edge: only a hair of softness beyond the pixel footprint.
float blot(float n, float th) { float w = fwidth(n) * 0.8 + 0.01; return smoothstep(th - w, th + w, n); }

// Albedo of the skin at body coordinates. gloss and net (how strongly the scale reticulation shows) come back too.
vec3 skin(float u, float v, float kind, float seed, float jit, out float gloss, out float net) {
  vec2 b = vec2(u * 8.1, v * 1.25);
  vec2 s = vec2(seed * 37.0, seed * 91.0);
  float n1 = fbm2(b * vec2(0.52, 0.8) + s) + jit;      // jit: the edge of a patch steps along the scale rows
  float n2 = fbm2(b * vec2(0.6, 0.95) + s.yx + 9.0) + jit;
  float n3 = fbm2(b * vec2(1.7, 2.3) + s * 1.7 + 4.0);
  float back = 1.0 - smoothstep(0.6, 0.97, abs(v) + (n3 - 0.5) * 0.25);  // patterns ride the back and thin out down the flanks
  float behind = smoothstep(0.19, 0.24, u + (n3 - 0.5) * 0.05);
  vec2 hd = vec2((u - 0.128) * 8.1, v * 0.8);     // head-centred, in units of the body's half-width
  gloss = 0.3; net = 0.22;
  vec3 c = WHITE;
  if (kind < 0.5) {            // Kohaku: red on white
    float cap = 1.0 - smoothstep(0.42, 0.47, length(hd * vec2(0.8, 1.25) + (n3 - 0.5) * 0.2));
    c = mix(WHITE, HI, max(blot(n1, 0.415) * back * behind, cap));
  } else if (kind < 1.5) {     // Taisho Sanke: Kohaku with small sumi on the back
    float cap = 1.0 - smoothstep(0.4, 0.45, length(hd * vec2(0.9, 1.4) + vec2(-0.1, 0.12)));
    c = mix(WHITE, HI * vec3(1.05, 1.25, 1.2), max(blot(n2, 0.5) * back * behind, cap));
    c = mix(c, SUMI, blot(n3, 0.66) * back * smoothstep(0.26, 0.3, u));
  } else if (kind < 2.5) {     // Showa: black ground, red and white wrapped over it
    c = mix(SUMI, WHITE, blot(n1, 0.43));
    c = mix(c, HI, blot(n2, 0.5));
    c = mix(c, SUMI, blot(fbm2(b * vec2(0.9, 0.5) + s * 2.3), 0.6));
    net = 0.15;
  } else if (kind < 3.5) {     // Yamabuki Ogon: one metallic yellow
    c = mix(vec3(0.6, 0.36, 0.04), vec3(0.66, 0.47, 0.12), smoothstep(0.3, 0.0, u) * 0.6 + 0.3 * n1);
    gloss = 1.0; net = 0.34;
  } else if (kind < 4.5) {     // Asagi: a blue net on the back, red below the lateral line
    vec3 blue = mix(vec3(0.15, 0.22, 0.33), vec3(0.24, 0.32, 0.42), n1);
    c = mix(blue, HI * vec3(1.0, 1.5, 1.4), smoothstep(0.52, 0.74, abs(v) + (n3 - 0.5) * 0.2) * smoothstep(0.1, 0.2, u));
    c = mix(vec3(0.6, 0.63, 0.62), c, smoothstep(0.16, 0.25, u));
    net = 0.6;
  } else if (kind < 5.5) {     // Tancho: one red sun on the head
    c = mix(WHITE, HI, 1.0 - smoothstep(0.4, 0.44, length(hd + (n3 - 0.5) * 0.12)));
  } else if (kind < 6.5) {     // Chagoi: tea brown, finely netted
    c = mix(vec3(0.27, 0.165, 0.06), vec3(0.36, 0.25, 0.1), n1) * mix(1.0, 0.8, smoothstep(0.3, 0.9, abs(v)));
    net = 0.5; gloss = 0.4;
  } else {                     // Shiro Utsuri: black and white
    c = mix(SUMI, WHITE, blot(n1 + 0.08 * sin(b.x * 2.2 + seed * 20.0), 0.48));
    net = 0.15;
  }
  return c;
}
// What colour the fins take: mostly the pale ground of the variety, some with colour at the root.
vec3 finColour(float kind, float u, float part) {
  vec3 c = WHITE * 1.05;
  if (kind > 1.5 && kind < 2.5 || kind > 6.5) c = mix(SUMI * 3.0, WHITE, smoothstep(0.15, 0.6, u));   // motoguro: black at the root
  else if (kind > 2.5 && kind < 3.5) c = vec3(0.62, 0.43, 0.1);
  else if (kind > 3.5 && kind < 4.5) c = mix(HI * vec3(1.0, 1.6, 1.5), vec3(0.6, 0.6, 0.58), smoothstep(0.2, 0.9, u));
  else if (kind > 5.5 && kind < 6.5) c = vec3(0.34, 0.23, 0.11);
  return c;
}

void main() {
  float u = vA.x; float l = vA.y; float w = max(vA.z, 1e-3);
  float kind = vC.x; float seed = vC.y; float z = vC.z; float part = vC.w;
  float v = clamp(l / w, -1.0, 1.0);
  float edge = clamp((w - abs(l)) * uPx + 0.5, 0.0, 1.0);
  vec2 tb = normalize(vT); vec2 lat = vec2(-tb.y, tb.x);
  float dk = koiDepth(depthAt(vP)) + 2.0 * z * uS;   // how deep this koi swims here

  // light arriving at this koi: sun through the canopy and the ripples, less under a pad or a letter
  float sunGate = goboAt(vP);
  float ca = texture(uCaust, uvOf(vP)).r;
  float shPad = texture(uShadow, uvOf(vP - SHDIR * TANW * dk)).g;
  float shText = texture(uText, uvOf(vP - SHDIR * (TANW * dk + 10.0 * uS))).r;
  vec3 sun = SUNCOL * sunGate * mix(1.0, ca, 0.75) * (1.0 - 0.92 * shPad) * (1.0 - 0.7 * shText);
  vec3 amb = SKYCOL * (0.5 + 0.35 * sunGate) * (1.0 - 0.5 * shPad);

  vec3 col; float alpha;
  if (part < 0.5) {
    // body: a dome across, tilting with the taper along
    float dome = sqrt(max(1.0 - v * v, 0.0));
    vec3 n = normalize(vec3(lat * (1.1 * v) - tb * (1.1 * vA.w), dome + 0.06));
    // scales: an offset lattice of rounds, shown only where a scale is big enough to draw
    vec2 q = vec2(u * 23.0, v * 3.7); q.y += 0.5 * mod(floor(q.x), 2.0);
    vec2 f = fract(q) - 0.5; float sid = hash(floor(q) + seed * 100.0);
    float show = (1.0 - smoothstep(0.3, 0.62, fwidth(q.x) + fwidth(q.y))) * smoothstep(0.23, 0.29, u);
    float rim = smoothstep(0.26, 0.5, length(f)) * show;
    float gloss; float net;
    vec3 alb = skin(u, v, kind, seed, (sid - 0.5) * 0.05 * show, gloss, net);
    alb *= 1.0 - net * rim;
    alb *= 1.0 + (sid - 0.5) * 0.16 * show;                      // no two scales quite the same
    if (kind > 3.5 && kind < 4.5) alb = mix(alb, alb * 2.1, (1.0 - smoothstep(0.1, 0.34, length(f))) * show * (1.0 - smoothstep(0.5, 0.7, abs(v))));
    n = normalize(n + vec3((lat * f.y - tb * f.x) * 0.5 * show, 0.0));   // each scale a shallow dish
    // head: eyes at the sides, the gill cover's seam, nostrils
    float R = 7.0 * uS * z; float len = 56.65 * uS * z;
    vec2 e = vec2((u - 0.118) * len, abs(l) - 0.8 * w) / (0.115 * R);
    float ed = length(e);
    alb = mix(alb, alb * 0.55, (1.0 - smoothstep(1.0, 1.9, ed)) * 0.7);
    alb = mix(alb, vec3(0.5, 0.42, 0.2), 1.0 - smoothstep(0.85, 1.15, ed));
    alb = mix(alb, vec3(0.008), 1.0 - smoothstep(0.55, 0.8, ed));
    float seam = abs(u - (0.2 + 0.045 * abs(v))) * len;
    alb *= 1.0 - 0.3 * (1.0 - smoothstep(0.3, 1.3, seam)) * smoothstep(0.25, 0.5, abs(v));
    vec2 no = vec2((u - 0.04) * len, abs(l) - 0.34 * w) / (0.05 * R);
    alb *= 1.0 - 0.55 * (1.0 - smoothstep(0.6, 1.3, length(no)));
    // dorsal fin: from above a thin ridge down the middle of the back
    float dz = smoothstep(0.36, 0.42, u) * (1.0 - smoothstep(0.7, 0.78, u));
    float dl = abs(l + 0.06 * w) - 0.05 * R;
    float dors = (1.0 - smoothstep(-0.5, 0.7, dl * uPx)) * dz;
    alb = mix(alb, alb * 0.5 + 0.02, dors * 0.75);

    float ndl = max(dot(n, SUN_W), 0.0);
    // the back takes the sun; the flanks turn away from it and from the sky, which is what makes the body round
    col = alb * (sun * (ndl * 0.85 + 0.15) * mix(0.5, 1.0, dome) + amb * (0.22 + 0.78 * dome * dome));
    // the sheen along the back: faint on skin under water, tight and bright on a metallic koi
    vec3 hv = normalize(SUN_W + vec3(0.0, 0.0, 1.0));
    float ndh = max(dot(n, hv), 0.0);
    float sheen = pow(ndh, mix(34.0, 80.0, gloss)) * mix(0.2, 0.7, gloss) * (1.0 - 0.5 * rim);
    col += sun * sheen * mix(vec3(1.0), alb * 2.4, gloss * 0.7);
    // flanks fall away from the camera: more water in front of them
    col = throughWater(col, dk + (1.0 - dome) * w * 1.1, 0.6 + 0.4 * sunGate);
    alpha = edge;
  } else {
    // fins: thin membrane on rays, lit from above and glowing a little with the light that passes through
    float rays = part < 1.5 ? 17.0 : part < 2.5 ? 10.0 : 7.0;
    float fr = abs(fract(v * rays * 0.5) - 0.5) * 2.0;
    float keep = 1.0 - smoothstep(0.5, 1.0, fwidth(v * rays));
    float ray = mix(0.5, 1.0 - smoothstep(0.1, 0.6, fr), keep);
    vec3 alb = finColour(kind, u, part);
    float shape = edge * smoothstep(0.0, 1.0, (w - abs(l)) / (2.2 * uS));   // a fin thins to nothing at its edge
    float mem;                                                              // how much the membrane hides
    if (part < 1.5) {
      // the tail's trailing edge: a fork between two rounded lobes, a little ragged
      float av = abs(v);
      float end = 1.0 - 0.36 * pow(1.0 - av, 1.7) - 0.14 * pow(av, 6.0) - 0.04 * vnoise(vec2(v * 9.0, seed * 50.0));
      shape *= smoothstep(0.0, 1.0, (end - u) * vA.w / (2.5 * uS));
      mem = mix(0.62, 0.2, smoothstep(0.05, 0.9, u / end));
    } else {
      mem = mix(0.62, 0.16, smoothstep(0.1, 1.0, u));
    }
    alpha = (mem * 0.7 + 0.42 * ray * (1.0 - 0.45 * u)) * shape;
    col = alb * mix(0.8, 1.15, ray) * (sun * 0.8 + amb);
    col = throughWater(col, dk + 3.0 * uS, 0.6 + 0.4 * sunGate);
  }
  o = vec4(col * alpha, alpha);
}
`;
