// Koi: ribbons built on the simulated spine, shaded as round bodies and thin fins seen from straight above.
// aA = (u along the part, signed px from the midline, half-width px, taper slope | fin length px),
// aT = (direction toward the tail, how deep the koi swims 0..1),
// aC = (variety, atlas strip, size, part: 0 body, 1 tail fin, 2 pectoral, 3 pelvic).
import { common, gobo } from './common.js';
import { CELL_W, CELL_H, GUT, ATLAS_H } from '../skins.js';
import { LEN } from '../fish.js';

export const koiVert = /* glsl */ `
${common}
in vec2 aPos; in vec4 aA; in vec3 aT; in vec4 aC;
out vec4 vA; out vec3 vT; flat out vec4 vC; out vec2 vP; out float vD;
void main() {
  vA = aA; vT = aT; vC = aC; vP = aPos; vD = depthAt(aPos);   // the basin is smooth: its depth is worked out per vertex
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// The shadow a koi throws on the floor, drawn where it lands: down-sun by its height above the stones, and
// wider and softer the higher it swims. vA.w becomes the penumbra's half-width in px.
export const koiMaskVert = /* glsl */ `
${common}
in vec2 aPos; in vec4 aA; in vec3 aT; in vec4 aC;
out vec4 vA; flat out vec4 vC; out float vEnd;
void main() {
  float d = depthAt(aPos);
  float h = d - koiDepth(d, aT.z, aC.z);
  float soft = 2.0 * uS + 0.1 * h;
  float side = sign(aA.y);
  vec2 p = aPos + vec2(-aT.y, aT.x) * side * soft + SHDIR * TANW * h;
  vA = vec4(aA.x, aA.y + side * soft, aA.z, soft); vC = aC;
  // px from the part's two ends, for parts that end in a point
  float len = aC.w < 0.5 ? ${LEN.toFixed(2)} * uS * aC.z : aA.w;
  vEnd = min(aA.x, aC.w < 0.5 ? 1.0 : 1.0 - aA.x) * len;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
// Bodies solid, fins letting some light through.
export const koiMaskFrag = /* glsl */ `
precision highp float;
in vec4 vA; flat in vec4 vC; in float vEnd; out vec4 o;
void main() {
  float a = smoothstep(-vA.w, vA.w, vA.z - abs(vA.y)) * smoothstep(0.0, vA.w, vEnd);
  if (vC.w > 0.5) a *= vC.w < 1.5 ? 0.55 * (1.0 - 0.6 * vA.x) : 0.4;
  o = vec4(a, 0.0, 0.0, a);
}
`;

export const koiFrag = /* glsl */ `
${common}
${gobo}
in vec4 vA; in vec3 vT; flat in vec4 vC; in vec2 vP; in float vD;
out vec4 o;
uniform sampler2D uCaust; uniform sampler2D uShadow;
uniform sampler2D uSkin;   // one painted strip per koi (skins.js)

const vec3 WHITE = vec3(0.62, 0.6, 0.55);
const vec3 HI = vec3(0.56, 0.07, 0.016);     // koi red sits toward orange
const vec3 SUMI = vec3(0.02, 0.021, 0.027);
const vec2 CELL = vec2(${CELL_W}.0, ${CELL_H}.0);

// What colour the fins take: mostly the pale ground of the variety, some with colour at the root.
vec3 finColour(float kind, float u) {
  vec3 c = WHITE;
  if (kind > 1.5 && kind < 2.5 || kind > 6.5) c = mix(SUMI * 2.0, WHITE, smoothstep(0.2, 0.7, u));   // motoguro: black at the root
  else if (kind > 2.5 && kind < 3.5) c = vec3(0.64, 0.46, 0.14);
  else if (kind > 3.5 && kind < 4.5) c = mix(HI * vec3(1.0, 1.9, 1.8), vec3(0.6, 0.6, 0.58), smoothstep(0.15, 0.75, u));
  else if (kind > 5.5 && kind < 6.5) c = vec3(0.3, 0.2, 0.09);
  return c;
}

void main() {
  float u = vA.x; float l = vA.y; float w = max(vA.z, 1e-3);
  float kind = vC.x; float z = vC.z; float part = vC.w;
  float v = clamp(l / w, -1.0, 1.0);
  vec2 tb = normalize(vT.xy); vec2 lat = vec2(-tb.y, tb.x);
  float d = vD;
  float dk = koiDepth(d, vT.z, z);       // how deep this koi swims here
  float sunk = dk / (125.0 * uS);
  // seen through more water an outline is softer
  float edge = smoothstep(0.0, 1.0 + 3.5 * sunk, (w - abs(l)) * uPx + 0.5);

  // light arriving at this koi: sun through the roof and the ripples, less under a pad. The ripples
  // have not finished focusing it this far above the floor: broad bands that slide over the back.
  vec2 ps = vP - SHDIR * TANW * dk;      // where that light came through the surface
  float sunGate = goboAt(ps, dk * 0.08);
  float ca = textureLod(uCaust, uvOf(vP + lat * l * 0.35), 1.0 + 1.6 * (1.0 - dk / d)).r;
  float shPad = texture(uShadow, uvOf(ps)).g;
  vec3 sun = SUNCOL * sunGate * mix(1.0, min(ca, 2.6), 0.85) * (1.0 - 0.92 * shPad);   // capped: a pale koi under a bright line must not burn out
  vec3 amb = SKYCOL * (0.5 + 0.35 * sunGate) * (1.0 - 0.5 * shPad);

  vec3 col; float alpha;
  if (part < 0.5) {
    // body: taller than it is wide, so the back is a narrow crown and the flanks fall away steeply; the skin
    // is read round the back and closes up toward the flanks as it does on a round fish
    float dome = sqrt(max(1.0 - v * v, 0.0));
    vec2 st = vec2(clamp(u, 0.004, 0.996) * CELL.x, vC.y * ${CELL_H + GUT}.0 + ${GUT / 2}.0 + (0.5 + asin(v) * 0.3) * CELL.y);
    vec2 gx = dFdx(st); vec2 gy = dFdy(st);
    float lod = clamp(0.5 * log2(max(dot(gx, gx), dot(gy, gy))) + 1.2 * sunk, 0.0, 4.0);   // capped, so one koi's strip never bleeds into the next
    vec3 alb = textureLod(uSkin, st / vec2(CELL.x, ${ATLAS_H}.0), lod).rgb;
    float metal = kind > 2.5 && kind < 3.5 ? 1.0 : 0.0;
    vec3 n = normalize(vec3(lat * v * 1.35 - tb * vA.w, dome + 0.04));
    float ndl = dot(n, SUN_W);
    // skin under water takes light softly: the sun wraps a little past the terminator, the sky reaches the
    // crown of the back and little of the flanks, and that is what makes the body round
    vec3 dif = sun * clamp(ndl * 0.8 + 0.2, 0.0, 1.0) * (0.3 + 0.7 * dome) + amb * (0.12 + 0.88 * dome * dome);
    col = alb * dif;
    // a soft sheen where the back faces the sun, broken by the scales; a metallic koi glows more broadly
    vec3 hv = normalize(SUN_W + vec3(0.0, 0.0, 1.0));
    float ndh = max(dot(n, hv), 0.0);
    float tex = dot(alb, vec3(0.5, 0.9, 0.4));
    col += sun * (pow(ndh, 60.0) * 0.12 * (0.3 + tex) + metal * pow(ndh, 14.0) * 0.4 * tex * alb);
    // flanks fall away from the camera: more water in front of them
    col = throughWater(col, dk + (1.0 - dome) * w * 1.6, 0.6 + 0.4 * sunGate);
    alpha = edge;
  } else {
    // fins: a thin membrane on fine rays. Most of what shows is the light that comes through it.
    float rays = part < 1.5 ? 17.0 : part < 2.5 ? 13.0 : 8.0;
    float fr = abs(fract(v * rays * 0.5) - 0.5) * 2.0;
    float keep = 1.0 - smoothstep(0.5, 1.2, fwidth(v * rays));
    float ray = mix(0.4, 1.0 - smoothstep(0.1, 0.8, fr), keep);
    vec3 alb = finColour(kind, u);
    float shape = edge * smoothstep(0.0, 1.0, (w - abs(l)) / (2.5 * uS));   // a fin thins to nothing at its edge
    float mem;                                                              // how much the membrane hides
    if (part < 1.5) {
      // the tail's trailing edge: a fork between two rounded lobes, a little ragged
      float av = abs(v);
      float end = 1.0 - 0.34 * pow(1.0 - av, 1.7) - 0.12 * pow(av, 6.0) - 0.04 * vnoise(vec2(v * 9.0, vC.y * 7.3));
      shape *= smoothstep(0.0, 1.0, (end - u) * vA.w / (4.0 * uS));
      mem = mix(0.5, 0.1, smoothstep(0.0, 0.85, u / end));
    } else {
      mem = mix(0.62, 0.1, smoothstep(0.0, 0.9, u)) * (0.75 + 0.25 * abs(v));   // the leading and trailing rays are the stout ones
    }
    alpha = (mem + 0.28 * ray * (1.0 - 0.5 * u)) * shape;
    col = alb * mix(0.85, 1.08, ray) * (sun * 0.7 + amb) + sun * alb * 0.3 * (1.0 - mem);
    col = throughWater(col, dk + 3.0 * uS, 0.6 + 0.4 * sunGate);
  }
  o = vec4(col * alpha, alpha);
}
`;
