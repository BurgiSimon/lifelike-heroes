// The photograph's main pass: for every pixel look down through the rippled surface, shade the floor it lands
// on (pebbles and the headline's stone letters, sun through the pavilion's roof and the caustics, the shadows of koi and pads), lay the koi over it,
// take the water's toll, then add what the surface itself reflects.
import { common, gobo } from './common.js';

export const compositeFrag = /* glsl */ `
${common}
${gobo}
in vec2 vUv; out vec4 o;
uniform sampler2D uSurf; uniform sampler2D uCaust; uniform sampler2D uShadow; uniform sampler2D uKoi; uniform sampler2D uText;
uniform sampler2D uDiff; uniform sampler2D uNor; uniform sampler2D uAux; uniform sampler2D uSky;
uniform float uTile;     // px one repeat of the floor covers
uniform float uLod;      // the mip level at which one texel of the floor is one device px

const float REFR = 0.22;  // how far a slope shifts what lies a px below it
const vec2 GLINT = vec2(0.216, 0.332);   // the slope that mirrors the sun straight up

// The water mirrors what is overhead: leaves, branches and the bright sky between them (8-bit, so the sky is
// opened back up). The sky's big opening lies toward the sun.
vec3 skyAt(vec2 rf, float lod) {
  vec3 c = textureLod(uSky, vec2(0.5 + rf.x * 0.42, 0.5 - rf.y * 0.42), lod).rgb;
  return c * c * (1.0 + 6.0 * smoothstep(0.35, 0.95, dot(c, vec3(0.333))));
}
vec2 turn(vec2 v, float r) { return r < 0.5 ? v : r < 1.5 ? vec2(-v.y, v.x) : r < 2.5 ? -v : vec2(v.y, -v.x); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 sf = textureLod(uSurf, vUv, 0.0);
  float d = sf.z;                       // depth here; the floor point a few px away is as deep, near enough
  float deep = smoothstep(65.0, 180.0, d / uS);
  // The finest ripples only blur what lies far below them, and mirror the sky as a soft sheen, not as lines:
  // the deep floor and the reflection read a smoothed surface.
  vec2 gs = textureLod(uSurf, vUv, 2.0).xy;
  vec2 g = mix(sf.xy, textureLod(uSurf, vUv, 3.0).xy, deep);
  vec2 off = g * REFR * d;
  vec2 pf = p + off;
  float dk = koiDepth(d, 0.5, 4.5);   // about where a koi would be: the layer of koi is not told how deep each one swims

  // ---- floor. The scanned stones are laid as overlapping patches on a triangle grid, each patch its own turn
  // and offset of the scan, joined along the gaps between stones: nothing on screen repeats.
  vec2 ft = pf / uTile;
  float lod = uLod + 0.2 + 0.55 * deep;  // the lens is focused near the surface: the deep floor is a little soft
  vec2 sk = vec2(ft.x - 0.57735 * ft.y, 1.1547 * ft.y) * 2.3;
  vec2 ic = floor(sk); vec2 fc = sk - ic;
  float lo = step(fc.x + fc.y, 1.0);
  vec2 c0 = ic + (1.0 - lo); vec2 c1 = ic + vec2(lo, 1.0 - lo); vec2 c2 = ic + vec2(1.0 - lo, lo);
  float w1 = mix(1.0 - fc.x, fc.x, lo); float w2 = mix(1.0 - fc.y, fc.y, lo);
  float r0 = floor(hash(c0 + 3.0) * 4.0); float r1 = floor(hash(c1 + 3.0) * 4.0); float r2 = floor(hash(c2 + 3.0) * 4.0);
  vec2 u0 = turn(ft, r0) + vec2(hash(c0 + 17.0), hash(c0 + 41.0));
  vec2 u1 = turn(ft, r1) + vec2(hash(c1 + 17.0), hash(c1 + 41.0));
  vec2 u2 = turn(ft, r2) + vec2(hash(c2 + 17.0), hash(c2 + 41.0));
  vec2 a0 = textureLod(uAux, u0, lod).rg; vec2 a1 = textureLod(uAux, u1, lod).rg; vec2 a2 = textureLod(uAux, u2, lod).rg;
  vec3 bw = vec3(1.0 - w1 - w2, w1, w2) + 0.7 * vec3(a0.g, a1.g, a2.g);   // the higher stone wins the seam
  bw = max(bw - (max(bw.x, max(bw.y, bw.z)) - 0.3), 0.0); bw /= bw.x + bw.y + bw.z;
  vec3 alb = vec3(0.0); vec2 aux = a0 * bw.x + a1 * bw.y + a2 * bw.z;
  if (bw.x > 0.0) alb += textureLod(uDiff, u0, lod).rgb * bw.x;
  if (bw.y > 0.0) alb += textureLod(uDiff, u1, lod).rgb * bw.y;
  if (bw.z > 0.0) alb += textureLod(uDiff, u2, lod).rgb * bw.z;
  vec2 un = u0; float rn = r0;
  if (bw.y > bw.x && bw.y >= bw.z) { un = u1; rn = r1; } else if (bw.z > bw.x) { un = u2; rn = r2; }
  vec3 nt = textureLod(uNor, un, lod).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(turn(nt.xy, mod(4.0 - rn, 4.0)) * 1.9, nt.z));
  // algae and silt: a green-brown film, thicker in the gaps between stones and in the deep
  float film = clamp(0.75 - aux.g * 1.5 + 1.1 * (vnoise(pf / (uS * 170.0) + 5.0) - 0.45), 0.0, 1.0);
  alb = mix(alb, alb * vec3(0.5, 0.5, 0.26) + vec3(0.004, 0.009, 0.003), film * 0.32);
  alb *= 0.9;
  // ---- the headline lies on the bed: letters cut from pale stone, a finger thick. Being floor, they bend with the
  // ripples, the roof's shade and the caustics fall across them, and the koi swim over them.
  vec4 tx = textureLod(uText, uvOf(pf), 0.0);   // b: the letters, r: the same but soft
  float stone = tx.b;
  if (tx.r > 0.003) {
    float te = 1.5 * uS;
    vec2 tg = vec2(textureLod(uText, uvOf(pf + vec2(te, 0.0)), 0.0).r - textureLod(uText, uvOf(pf - vec2(te, 0.0)), 0.0).r,
                   textureLod(uText, uvOf(pf + vec2(0.0, te)), 0.0).r - textureLod(uText, uvOf(pf - vec2(0.0, te)), 0.0).r);
    vec3 sa = vec3(0.8, 0.78, 0.71) * (0.9 + 0.14 * vnoise(pf / (uS * 22.0) + 9.0) + 0.08 * (vnoise(pf / (uS * 1.6)) - 0.5));
    sa = mix(sa, sa * vec3(0.62, 0.68, 0.42), 0.3 * smoothstep(0.45, 0.8, vnoise(pf / (uS * 46.0) + 31.0)));   // a little of the pond's film has begun on them, in patches of its own
    alb = mix(alb, sa, stone);
    n = normalize(mix(n, vec3(-tg * 3.4, 1.0), stone));       // a worn bevel round every edge
    aux.r = mix(aux.r, 1.0, stone);
  }
  vec2 wob = g * 30.0 * uS;                                  // the same ripples that focus the light bend the shadows
  vec2 sdir = SHDIR * TANW;
  float gate = goboAt(pf - sdir * 30.0 * uS + wob * 0.15, 0.03 * d);   // the floor's unevenness would bend the beams' shadows out of recognition: they are laid as on a level bed
  float ca = textureLod(uCaust, uvOf(pf), 2.6 * deep).r;   // light that has further to fall has spread further: broad soft pools in the deep
  // what floats throws its shadow from the surface: crisp on the shelf, softer through deep water, and ringed
  // by the bright line its meniscus focuses (the blurred shadow less the sharp one is just outside its edge)
  vec2 su = uvOf(pf - sdir * d + wob);
  vec2 sh = vec2(0.0, textureLod(uShadow, su, 1.6 * deep).g);
  float rim = smoothstep(0.1, 0.4, textureLod(uShadow, su, 2.6).g - sh.g) * (1.0 - deep);
  float shKoi = texture(uShadow, uvOf(pf + wob)).r;   // koi shadows are drawn where they land; a pad's (green) lies at the surface
  // the letters' own shadow on the pebbles down-sun of them, and the dim seam where stone meets pebble
  float shText = textureLod(uText, uvOf(pf - sdir * 9.0 * uS), 0.0).r * (1.0 - stone);
  float lit = (1.0 - 0.9 * shKoi) * (1.0 - 0.94 * sh.g) * (1.0 - 0.75 * shText);
  vec3 sun = SUNCOL * gate * mix(1.0, ca, 0.86 - 0.2 * deep) * lit * (1.0 + 1.3 * rim);
  float ndl = max(dot(n, SUN_W), 0.0);
  vec3 amb = SKYCOL * (0.5 + 0.5 * gate) * mix(0.3, 1.0, aux.r) * (1.0 - 0.35 * sh.g) * (1.0 - 0.3 * shKoi) * (1.0 - 0.5 * tx.r * (1.0 - stone));   // the roof hides some of the sky too
  vec3 col = alb * (sun * ndl + amb);
  col = throughWater(col, d * (1.0 - 0.72 * stone), (0.3 + 0.7 * gate) * (1.0 - 0.3 * sh.g));   // the letters stand well clear of the bed: less water lies over them

  // ---- koi, a little less displaced than the floor because they are nearer the surface
  vec4 k = texture(uKoi, uvOf(p + off * (dk / d)));
  col = col * (1.0 - k.a) + k.rgb;

  // ---- the surface: by Fresnel it mirrors the canopy and the sky, a little further off the zenith toward the
  // frame's edges as any lens sees it; a ripple's slope swings that mirror across leaves and sky
  vec3 ns = normalize(vec3(-gs * 1.4, 1.0));
  float fres = 0.02 + 0.98 * pow(1.0 - ns.z, 5.0);
  vec2 view = (p - 0.5 * uRes) / uRes.x;
  col = col * (1.0 - fres) + skyAt(2.4 * ns.xy + 0.85 * view, 3.6 + 2.4 * smoothstep(0.03, 0.22, length(gs))) * fres;   // a steep face mirrors a wide sweep of sky
  // ---- sun glitter: a facet of the surface that leans far enough toward the sun mirrors it into the lens as one
  // burnt-out point. Wind ripples manage it on a crest here and there, more toward the sun's side of the frame
  // where less lean is needed; a ring or a wake carries a whole line of points. None in the roof's shade.
  float tm = smoothstep(0.0, 0.6, texture(uText, vUv).g);   // full under the button, fading out round it
  float open = goboAt(p, 0.0);
  vec2 lean = (sf.xy + 0.6 * (sf.xy - gs)) - (GLINT + 0.5 * (p - 0.5 * uRes) / max(uRes.x, uRes.y));
  float glint = exp(-dot(lean, lean) * 120.0) * open * (1.0 - tm);
  col += SUNCOL * 4.0 * smoothstep(0.45, 0.7, glint * (0.7 + 0.6 * hash(gl_FragCoord.xy)));   // a solid facet, ragged at its edge; no brighter than burns out, or the lens blooms it into a fog

  // ---- pollen on the surface film: a thin milky veil in streaks, clotted a little. The ripples do not move it
  // as they move the floor, which is how the eye finds the surface.
  if (sf.w > 0.004) {
    vec2 fp = p / uS - uTime * vec2(2.6, 1.1);
    float veil = sf.w * clamp(0.55 + 1.1 * (vnoise(fp / 7.0) - 0.5) + 0.7 * (vnoise(fp / 2.1) - 0.5), 0.0, 1.0);
    col = mix(col, vec3(0.56, 0.52, 0.3) * (SUNCOL * open * 0.3 + SKYCOL * 0.7), 0.36 * veil);
  }

  // ---- the button's quiet: a soft dip in exposure under it, which takes most from the brightest lines of light,
  // so its label never has to compete with a caustic
  col *= (1.0 - 0.5 * tm) / (1.0 + 3.4 * tm * dot(col, vec3(0.3, 0.6, 0.1)));
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
  o = vec4(c * smoothstep(2.4, 5.0, l), 1.0);
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

// One small tent over a texel's neighbourhood: the sun is a disc, not a point, and it hides the caustic sheet's facets.
export const softFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uStep;
void main() {
  o = texture(uTex, vUv) * 0.36 + 0.16 * (texture(uTex, vUv + uStep) + texture(uTex, vUv - uStep) + texture(uTex, vUv + uStep * vec2(1.0, -1.0)) + texture(uTex, vUv + uStep * vec2(-1.0, 1.0)));
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
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.42);
  c = AgXToneMapping(c);
  // grade: a touch more contrast and colour than the flat transform, shadows leaning green-teal, lights warm
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.3);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.42);
  c *= mix(vec3(0.9, 1.0, 1.03), vec3(1.06, 1.0, 0.93), smoothstep(0.0, 0.6, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // fine grain, stronger in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.019 * (0.35 + 0.65 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
