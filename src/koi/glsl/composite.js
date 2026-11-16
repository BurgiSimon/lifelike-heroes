// The photograph's main pass: for every pixel look down through the rippled surface, shade the floor it lands
// on (pebbles, sun through canopy and caustics, the shadows of koi, pads and letters), lay the koi over it,
// take the water's toll, then add what the surface itself reflects.
import { common, gobo } from './common.js';

export const compositeFrag = /* glsl */ `
${common}
${gobo}
in vec2 vUv; out vec4 o;
uniform sampler2D uSurf; uniform sampler2D uCaust; uniform sampler2D uShadow; uniform sampler2D uKoi; uniform sampler2D uText;
uniform sampler2D uDiff; uniform sampler2D uNor; uniform sampler2D uAux;
uniform float uTile;     // px one repeat of the floor covers

const float REFR = 0.34;  // how far a slope shifts what lies a px below it

vec3 skyAt(vec2 rf, float lod) {
  vec3 c = textureLod(uSky, vec2(0.5) + rf * 0.42 + vec2(0.02, -0.03), lod).rgb;
  return c * c * (1.0 + 2.2 * smoothstep(0.55, 1.0, dot(c, vec3(0.333))));   // the 8-bit sky, opened back up a little
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 sf = texture(uSurf, vUv);
  vec2 g = sf.xy;
  float d = sf.z;                       // depth here; the floor point a few px away is as deep, near enough
  vec2 off = g * REFR * d;
  vec2 pf = p + off;
  float dk = koiDepth(d);

  // ---- floor
  vec2 ft = pf / uTile;
  float soft = 0.55 + 0.9 * smoothstep(40.0, 120.0, d / uS);  // the lens is focused on the surface, and deep water blurs what it shows
  vec3 alb = texture(uDiff, ft, soft).rgb;
  vec3 nt = texture(uNor, ft, soft).xyz * 2.0 - 1.0;
  vec2 aux = texture(uAux, ft, soft).rg;
#ifdef TWO_LAYERS
  // a second, turned copy of the same stones takes over in patches, so the floor never repeats on screen
  const mat2 RB = mat2(0.454, 0.891, -0.891, 0.454);
  vec2 fb = RB * pf / (uTile * 1.23) + vec2(0.37, 0.11);
  vec2 auxB = texture(uAux, fb, soft).rg;
  float mb = smoothstep(0.42, 0.58, textureLod(uAux, pf / (uTile * 2.9) + 0.31, 3.0).g * 1.6 - 0.2 + (auxB.g - aux.g) * 0.3);
  alb = mix(alb, texture(uDiff, fb, soft).rgb, mb);
  nt.xy = mix(nt.xy, (texture(uNor, fb, soft).xy * 2.0 - 1.0) * RB, mb);
  aux = mix(aux, auxB, mb);
#endif
  vec3 n = normalize(vec3(nt.xy * 1.9, nt.z));
  // algae and silt: a green-brown film, thicker in the gaps between stones and in the deep
  float film = clamp(0.8 - aux.g * 1.5 + 1.2 * (textureLod(uAux, pf / (uTile * 1.7) + 0.6, 3.5).g - 0.42) + 0.5 * smoothstep(30.0, 110.0, d / uS), 0.0, 1.0);
  alb = mix(alb, alb * vec3(0.48, 0.5, 0.24) + vec3(0.004, 0.009, 0.003), film * 0.75);
  alb *= 0.74;
  float gate = goboAt(pf);
  float ca = texture(uCaust, uvOf(pf)).r;
  vec2 wob = g * 30.0 * uS;                                  // the same ripples that focus the light bend the shadows
  vec2 sdir = SHDIR * TANW;
  vec2 sh = texture(uShadow, uvOf(pf - sdir * d + wob)).rg;
  float shKoi = smoothstep(0.0, 0.62, texture(uShadow, uvOf(pf - sdir * (d - dk) + wob)).r);
  // the letters hang just above the water: on the deep floor their shadow is only a soft pool, down-sun of the type
  float shText = texture(uText, uvOf(pf - SHDIR * 26.0 * uS + wob)).g;
  float lit = (1.0 - 0.9 * shKoi) * (1.0 - 0.94 * sh.g) * (1.0 - 0.6 * shText);
  vec3 sun = SUNCOL * gate * mix(1.0, ca, 0.85) * lit;
  float ndl = max(dot(n, SUN_W), 0.0);
  vec3 amb = SKYCOL * (0.62 + 0.38 * gate) * mix(0.3, 1.0, aux.r) * (1.0 - 0.35 * sh.g) * (1.0 - 0.3 * shKoi);
  vec3 col = alb * (sun * ndl + amb);
  col = throughWater(col, d, (0.35 + 0.65 * gate) * (1.0 - 0.45 * shText) * (1.0 - 0.3 * sh.g));

  // ---- koi, a little less displaced than the floor because they are nearer the surface
  vec4 k = texture(uKoi, uvOf(p + off * (dk / d)));
  col = col * (1.0 - k.a) + k.rgb;

  // ---- the headline's quiet: a soft dip in exposure under the letters
  col *= 1.0 - 0.34 * texture(uText, vUv).g;

  // ---- the surface: sky and canopy by Fresnel, and the sun where a ripple tilts just right
  vec3 ns = normalize(vec3(-g * 1.4, 1.0));
  float fres = 0.02 + 0.98 * pow(1.0 - ns.z, 5.0);
  vec3 sky = skyAt(2.0 * ns.z * ns.xy, 4.6);
  col = col * (1.0 - fres) + sky * fres * 1.15;
  // a ring's sunward slope mirrors the bright sky around the sun, its far slope the dark trees: that is what
  // makes rings and wakes read from straight above
  float lean = 1.0 - exp(-24.0 * abs(sf.w)); lean *= 0.35 + 0.65 * lean;
  col = sf.w > 0.0 ? col + vec3(0.44, 0.6, 0.6) * (0.35 + 0.65 * gate) * lean * 0.42 : col * (1.0 - 0.22 * lean);
  // the sun itself shows only where a ring or a wake stands steep enough to face it; wind alone never does
  vec3 hv = normalize(SUN_A + vec3(0.0, 0.0, 1.0));
  float gl = smoothstep(0.9975, 0.9997, dot(normalize(vec3(-g * 1.15, 1.0)), hv)) * smoothstep(0.04, 0.12, sf.w);
  col += SUNCOL * gate * gl * 4.0;
  o = vec4(col, 1.0);
}
`;

// Bright-pass and blur for a restrained bloom, then the lens and the grade.
export const brightFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform vec2 uTexel;
void main() {
  vec3 c = 0.25 * (texture(uScene, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture(uScene, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uScene, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture(uScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(1.6, 4.0, l), 1.0);
}
`;
export const blurFrag = /* glsl */ `
precision highp float;
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

export const postFrag = (toneChunk) => /* glsl */ `
precision highp float;
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
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.62);
  c = AgXToneMapping(c);
  // grade: a touch more contrast and colour than the flat transform, shadows leaning green-teal, lights warm
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.17);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  c *= mix(vec3(0.95, 1.01, 1.0), vec3(1.03, 1.0, 0.96), smoothstep(0.0, 0.6, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // fine grain, stronger in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.028 * (0.35 + 0.65 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
