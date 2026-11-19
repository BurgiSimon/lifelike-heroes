// GLSL for the sky. Everything is lit in linear light into a half-float target; `post` is the lens and the film.
// Screen space in the shaders is CSS pixels with y down (the same space index.js lays the chart out in).
// Two frames meet here: the stars and the chart live on the chart plane (turning about the pole); the air, the
// aurora and the land live in the ground frame (altitude grows up the screen from uHorizonY, north under the pole).

export const SKY_SPAN = 150; // degrees from the pole at the edge of sky.webp (tools/build-assets.mjs holds the same)

// highp int as well as float: three adds no precision to a raw shader, and a mediump uint hash is 16 bits on many
// phone GPUs (Mali; Adreno under Mesa), where it returns 0: no aurora rays, no grain.
const head = /* glsl */`precision highp float; precision highp int;
#define TAU 6.28318530718
// The chart ends where the sky stops rising at 69° north: its stars thin out from 100° to 118° from the pole.
float chartEdge(float deg) { return smoothstep(118.0, 100.0, deg); }
`;

const noise = /* glsl */`
float hf(float n) { uint x = uint(int(n)); x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return float(x) * (1.0 / 4294967296.0); }
// 1D value noise and its slope.
vec2 n1(float x) { float i = floor(x); float f = x - i; float a = hf(i); float b = hf(i + 1.0); return vec2(mix(a, b, f * f * f * (f * (f * 6.0 - 15.0) + 10.0)), (b - a) * 30.0 * f * f * (f * (f - 2.0) + 1.0)); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = p - i; f = f * f * (3.0 - 2.0 * f); float a = hf(i.x + i.y * 157.0); float b = hf(i.x + 1.0 + i.y * 157.0); float c = hf(i.x + (i.y + 1.0) * 157.0); float d = hf(i.x + 1.0 + (i.y + 1.0) * 157.0); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
`;

// What the air does to light arriving from an altitude (degrees): more air low down, and it takes the blue first.
const air = /* glsl */`
uniform float uHorizonY, uAltScale;
float altOf(float y) { return (uHorizonY - y) / uAltScale; }
vec3 extinction(float alt) {
  float s = sin(radians(clamp(alt, 0.0, 90.0)));
  float mass = 1.0 / (s + 0.025 * exp(-11.0 * s));
  return exp(-vec3(0.14, 0.18, 0.27) * (mass - 1.0));
}
`;

export const fullscreenVert = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The night itself: the deep star map turned about the pole, the air in front of it, the aurora, the chart's hairlines.
export const skyFrag = head + air + /* glsl */`
uniform sampler2D uSky, uMask, uAurora;
uniform vec2 uRes, uPole, uRot;
uniform vec4 uMaskMap;
uniform float uScale, uRing, uRatio, uSkyGain, uGrid, uAuroraGain;
in vec2 vUv;
out vec4 o;

// Coverage of a hairline w CSS px wide, d px from its centre: a box filter, so it stays crisp at any ratio.
float hair(float d, float w) { return clamp((0.5 * w - d) * uRatio + 0.5, 0.0, 1.0); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 d = p - uPole;
  vec2 q = vec2(d.x * uRot.x + d.y * uRot.y, d.y * uRot.x - d.x * uRot.y); // chart plane, px
  float r = length(d);
  float quiet = texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r; // 0 behind the headline
  float alt = altOf(p.y);
  vec3 ext = extinction(alt);

  // Far from the pole the map is stretched along its circles; a coarser mip keeps its stars from turning to dashes.
  float far = smoothstep(100.0, 140.0, r / uScale);
  vec3 deep = pow(texture(uSky, 0.5 + q / (uScale * ${(2 * SKY_SPAN).toFixed(1)}), far * 2.5).rgb, vec3(2.2)) * uSkyGain;
  // A long exposure's contrast: the sky between the stars stays dark, the Milky Way lifts out of it.
  deep = max(deep - 0.0035, 0.0) * 1.7;
  deep = max(mix(vec3(dot(deep, vec3(0.2126, 0.7152, 0.0722))), deep, 1.15), 0.0) * chartEdge(r / uScale);

  // The sky's own light: blue-black overhead. Low down there is more air to look through, and it glows: a band of
  // green airglow that warms into the haze on the horizon.
  float up = clamp(alt / 75.0, 0.0, 1.0); float low = max(alt, 0.0);
  vec3 glow = mix(vec3(0.0068, 0.0118, 0.0165), vec3(0.0021, 0.0038, 0.0090), pow(up, 0.6));
  vec3 haze = vec3(0.022, 0.040, 0.027) * exp(-low / 8.0) + vec3(0.040, 0.024, 0.008) * exp(-low / 3.0);

  // The curtains, and the veil of their light that the air and the lens spread around them (the target's coarse mips).
  vec3 aurora = textureLod(uAurora, vUv, 0.0).rgb + 0.35 * textureLod(uAurora, vUv, 3.0).rgb + 0.3 * textureLod(uAurora, vUv, 5.0).rgb;
  aurora *= uAuroraGain * pow(ext, vec3(0.6));
  aurora = mix(aurora, vec3(aurora.g), 0.3 * smoothstep(0.4, 3.0, aurora.g)); // a sensor's green clips first: the brightest border pales
  vec3 col = (deep * vec3(0.90, 0.97, 1.12) * ext + glow) * mix(0.5, 1.0, quiet) + haze * mix(0.8, 1.0, quiet) + aurora * mix(0.45, 1.0, quiet);

  // The chart: rings every 15°, 24 hour lines turning with the sky, the meridian and its ticks standing still.
  float rings = hair(abs(mod(r + 0.5 * uRing, uRing) - 0.5 * uRing), 1.0) * step(0.5 * uRing, r);
  float h = atan(q.y, q.x) * (24.0 / TAU); float hn = round(h); float hi = mod(hn + 24.0, 24.0);
  float r0 = (mod(hi, 6.0) < 0.5 ? 0.3 : mod(hi, 2.0) > 0.5 ? 2.0 : 1.0) * uRing;
  float hours = hair(abs(sin((h - hn) * (TAU / 24.0))) * r, 1.0) * clamp((r - r0) * uRatio + 0.5, 0.0, 1.0);
  float mx = abs(d.x - 0.5);
  float ty = abs(mod(abs(d.y - 0.5) + 0.5 * uRing, uRing) - 0.5 * uRing);
  float ticks = hair(ty, 1.0) * hair(mx, 9.0) * step(0.5 * uRing, abs(d.y));
  ticks = max(ticks, hair(abs(d.y - 0.5), 1.0) * hair(mx, 11.0));
  float lines = max(rings, hours) * 0.7 + ticks * 1.5 + hair(mx, 1.0) * 1.25;
  lines += 0.10 * exp(-mx * 0.5); // the meridian is the instrument's own line: a breath of glow about it
  col += vec3(0.78, 0.86, 1.0) * lines * uGrid * mix(0.25, 1.0, quiet);

  o = vec4(col, 1.0);
}
`;

// Catalogue stars as points: a Moffat profile (what seeing and a lens do to a point), flux true to magnitude,
// colour from B–V. aMark carries what the visitor did to a star: x inked (it takes the pin colour), y pencilled.
export const starVert = head + air + /* glsl */`
in vec3 position, aCol; // position: chart-plane x, y (degrees from the pole) and magnitude
in vec2 aMark;
in float aSeed;
uniform sampler2D uMask;
uniform vec2 uRes, uPole, uRot;
uniform vec4 uMaskMap;
uniform vec3 uTone;
uniform float uScale, uRatio, uTime, uGain, uTwinkle, uAlpha, uMagLimit, uPad;
out vec3 vCol;
out float vAmp, vHalf, vHalo, vWide;
void main() {
  float aMag = position.z;
  vec2 p = uPole + vec2(position.x * uRot.x - position.y * uRot.y, position.x * uRot.y + position.y * uRot.x) * uScale;
  vec2 uv = p / uRes;
  float alt = altOf(p.y);
  vec3 ext = extinction(alt);
  float quiet = mix(0.1, 1.0, textureLod(uMask, p * uMaskMap.xy + uMaskMap.zw, 0.0).r); // behind the headline
  float amp = uGain * pow(10.0, -0.4 * (aMag - 3.5));
  amp *= smoothstep(uMagLimit, uMagLimit - 0.8, aMag); // the faintest fade into the photographed field under them
  amp *= ext.g * quiet * chartEdge(length(position.xy));
  // Scintillation: two slow beats per star, deeper toward the horizon where there is more air to look through.
  float tw = sin(uTime * (1.3 + aSeed * 2.9) + aSeed * 40.0) * 0.6 + sin(uTime * (3.1 + aSeed * 4.7) + aSeed * 91.0) * 0.4;
  amp *= 1.0 + uTwinkle * tw * mix(0.55, 0.08, smoothstep(3.0, 40.0, alt));
  amp = max(amp * (1.0 + 0.45 * aMark.y), 0.22 * aMark.y);
  vec3 col = aCol * ext / max(ext.g, 1e-4);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.55 + 0.45 * smoothstep(0.03, 0.8, amp)); // a faint star has little colour left over the noise
  // An inked star burns in the pin colour, bright enough to hold it and no brighter (4 is the film's white).
  amp = mix(amp, clamp(amp * 1.4, 2.2, 4.0) * mix(0.3, 1.0, quiet), aMark.x);
  col = mix(col, uTone * 0.25, aMark.x);
  // What a lens scatters grows with what it is given: the bright stars wear a skirt, the field stays points.
  float halo = mix(0.012 + 0.168 * smoothstep(0.25, 4.0, amp), 0.11, aMark.x);
  // The few brightest wear it wide and soft, as through a diffusion filter; that is where a star shows its colour.
  // (never wider than the sprite can hold: the very brightest keep a tighter skirt)
  float wide = mix(12.0, clamp(1800.0 / max(pow(amp * halo / 0.003, 0.6667) - 1.0, 1.0), 12.0, 40.0), smoothstep(1.5, 8.0, amp) * (1.0 - aMark.x));
  // Radius where both terms of the profile sink under 0.003: the sprite never shows its square.
  float rad = uAlpha * max(sqrt(max(pow(amp / 0.003, 0.4) - 1.0, 0.0)), sqrt(wide * max(pow(amp * halo / 0.003, 0.6667) - 1.0, 0.0))) + 1.0;
  rad = min(rad, 72.0);
  vCol = col; vAmp = amp; vHalf = rad; vHalo = halo; vWide = wide;
  gl_PointSize = 2.0 * rad * uRatio;
  // Drawn into a viewport uPad px larger all round, so a bright star's skirt slides in over the edge instead of popping.
  vec2 ndc = (p + uPad) / (uRes + 2.0 * uPad) * 2.0 - 1.0;
  gl_Position = amp > 2e-4 ? vec4(ndc.x, -ndc.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0); // nothing to draw: off the clip volume
}
`;

export const starFrag = head + /* glsl */`
uniform float uAlpha;
in vec3 vCol;
in float vAmp, vHalf, vHalo, vWide;
out vec4 o;
void main() {
  vec2 d = (gl_PointCoord - 0.5) * 2.0;
  float r = length(d) * vHalf / uAlpha; float r2 = r * r;
  // Core (Moffat, β 2.5) and the wide skirt a lens scatters around anything bright (β 1.5). The core burns to white
  // on the film; the skirt is where the star's own colour is left to see.
  float a = inversesqrt(1.0 + r2); float b = inversesqrt(1.0 + r2 / vWide);
  vec3 hue = max(mix(vec3(dot(vCol, vec3(0.2126, 0.7152, 0.0722))), vCol, 1.6), 0.0);
  o = vec4(vAmp * (vCol * (a * a * a * a * a) + hue * (vHalo * b * b * b)) * smoothstep(1.0, 0.5, length(d)), 0.0); // a long fade: no rim where the sprite ends
}
`;

// Pencilled and inked lines: one instanced quad per segment, a capsule with (for ink) a glow that is light.
export const lineVert = head + /* glsl */`
in vec3 position;
in vec4 aSeg, aInk;
in float aGlow;
uniform vec2 uRes;
out vec2 vP;
out vec4 vSeg, vInk;
out float vGlow;
void main() {
  vec2 d = aSeg.zw - aSeg.xy; float len = length(d);
  vec2 t = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  float pad = 0.5 * aInk.w + 1.5 + 16.0 * step(0.001, aGlow);
  vec2 p = mix(aSeg.xy, aSeg.zw, position.x * 0.5 + 0.5) + (t * position.x + vec2(-t.y, t.x) * position.y) * pad;
  vP = p; vSeg = aSeg; vInk = aInk; vGlow = aGlow;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

export const lineFrag = head + /* glsl */`
uniform sampler2D uMask;
uniform vec4 uMaskMap;
uniform float uRatio;
in vec2 vP;
in vec4 vSeg, vInk;
in float vGlow;
out vec4 o;
void main() {
  vec2 pa = vP - vSeg.xy; vec2 ba = vSeg.zw - vSeg.xy;
  float d = length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
  float core = clamp((0.5 * vInk.w - d) * uRatio + 0.5, 0.0, 1.0);
  float glow = vGlow * (0.04 * exp(-d * d / 4.0) + 0.012 * exp(-d * d / 52.0)); // gone well inside the quad's edge
  float quiet = mix(0.3, 1.0, texture(uMask, vP * uMaskMap.xy + uMaskMap.zw).r); // the headline keeps the stage
  o = vec4(vInk.rgb * (core + glow) * quiet, 0.0);
}
`;

// A meteor: the head runs the path in the first 0.6 s and flares before it dies; the train it leaves cools
// behind it, last of all the green of excited oxygen.
export const meteorVert = head + /* glsl */`
in vec3 position;
uniform vec2 uRes;
uniform vec4 uShoot;
out vec2 vQ;
out float vLen;
void main() {
  float len = length(uShoot.zw); vec2 t = uShoot.zw / max(len, 1e-4);
  vec2 q = vec2((position.x * 0.5 + 0.5) * (len + 36.0) - 18.0, position.y * 18.0); // along, across (px)
  vec2 p = uShoot.xy + t * q.x + vec2(-t.y, t.x) * q.y;
  vQ = q; vLen = len;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

export const meteorFrag = head + noise + /* glsl */`
uniform float uShootP;
in vec2 vQ;
in float vLen;
out vec4 o;
const float RUN = 0.6;
// Brightness of the head when it is a share u along its path: it kindles, flares late, burns out.
float burn(float u) { return smoothstep(0.0, 0.25, u) * (0.55 + 1.6 * exp(-pow((u - 0.8) / 0.09, 2.0))) * smoothstep(1.0, 0.93, u); }
void main() {
  float u = clamp(vQ.x / vLen, 0.0, 1.0);
  float uh = clamp(uShootP / RUN, 0.0, 1.0);                 // the head moves at a steady rate, as meteors do
  vec2 dh = vec2(vQ.x - uh * vLen, vQ.y);
  float headOn = step(uShootP, RUN);
  // It covers a dozen pixels a frame: the head is a streak, not a ball.
  float head = burn(uh) * headOn * (exp(-dh.x * dh.x / 90.0 - dh.y * dh.y / 2.0) * 9.0 + exp(-dot(dh, dh) / 60.0) * 0.15);
  float age = uShootP - u * RUN;                             // seconds since the head passed this point
  float knots = 0.65 + 0.7 * n1(u * 46.0 + 3.0).x;           // a train is lumpy: the body sheds unevenly
  float behind = step(0.0, age) * step(vQ.x, vLen) * step(0.0, vQ.x) * burn(u) * knots;
  float across = exp(-vQ.y * vQ.y / mix(1.3, 0.3, clamp(age / 0.25, 0.0, 1.0)));
  float wake = behind * across * exp(-age / 0.07) * 1.6;      // the incandescent train
  float after = behind * exp(-vQ.y * vQ.y / 2.4) * exp(-age / 0.22) * 0.12; // the afterglow
  vec2 de = vec2(vQ.x - 0.86 * vLen, vQ.y);                  // where it flared: an ember for a moment after
  float ember = exp(-dot(de, de) / 5.0) * exp(-max(uShootP - RUN, 0.0) / 0.06) * step(RUN, uShootP) * 2.2;
  // Green while it is high and fast (oxygen), warm where it flares.
  vec3 col = mix(vec3(0.55, 1.0, 0.7), vec3(1.0, 0.85, 0.6), smoothstep(0.5, 0.9, uh)) * (head + ember) + vec3(0.85, 0.92, 1.0) * wake + vec3(0.45, 1.0, 0.6) * after;
  o = vec4(col, 0.0);
}
`;

// The aurora, into a small target. Curtains are thin sheets of rays standing on arcs north of the observatory, their
// feet meandering and here and there folding back on themselves. Each pixel's line of sight is walked along each arc
// and lit wherever it passes through the sheet (so folds overlap and add, as drapery does); the height at which it
// passes picks the light: a crisp green lower border near 100 km fading upward through the rays, a pink fringe under
// the stretches that are driven hard, red and violet toward the tops.
export const auroraFrag = head + noise + air + /* glsl */`
uniform vec2 uRes;
uniform float uTime, uNorthX, uTexel, uSurge;
in vec2 vUv;
out vec4 o;

const int STEPS = 14;
const float FOLD = 1.25;   // where the meander runs steeper than 1 / FOLD the curtain doubles back: a fold
const float LIMB = 2.4;    // how much brighter than face-on a fold is where it turns away from the eye
const vec3 SWAY = vec3(70.0, 30.0, 10.0);   // km: three meanders, the long one slow and the short one quick
const vec3 WAVE = vec3(190.0, 71.0, 26.0);  // km per radian of each

// How far north (km) a curtain's foot has strayed from its arc l km along it, and how fast it is straying.
vec3 phase(float l, float k) { return l / WAVE + k * vec3(2.4, -4.1, 7.7) + uTime * vec3(0.012, -0.03, 0.07); }
float stray(float l, float k) { return dot(SWAY, sin(phase(l, k))); }
float slope(float l, float k) { return dot(SWAY / WAVE, cos(phase(l, k))); }

// What a curtain gives off where the line of sight passes through it: l km along it, s km away, z km up.
vec3 emission(float l, float s, float z, float k) {
  float foot = s * uTexel;                                         // km across one texel at that distance
  // How hard this stretch is driven: bright stretches travel along the arc, and each breathes.
  float drive = smoothstep(0.2, 0.8, mix(n1(l / 210.0 - uTime * 0.04 + k * 3.3).x, n1(l / 62.0 - uTime * 0.11 + k * 8.1).x, 0.3));
  drive = min(drive * (0.8 + 0.3 * sin(uTime * 0.21 + k * 2.1 + l / 420.0)) + uSurge * 0.35, 1.2);
  // Rays: each brightens and dies on its own while the lot drifts along the curtain; none finer than this target holds.
  float rays = n2(vec2(l / 28.0 + uTime * 0.05, uTime * 0.09 + k * 5.0));
  rays = mix(rays, n2(vec2(l / 8.5 - uTime * 0.11, uTime * 0.19 + k * 9.0)), 0.5 * smoothstep(1.2, 3.0, 8.5 / foot));
  rays = mix(rays, n2(vec2(l / 3.1 + uTime * 0.17, uTime * 0.37 + k * 2.0)), 0.35 * smoothstep(1.2, 3.0, 3.1 / foot));
  float tall = n1(l / 120.0 - uTime * 0.03 + k * 17.0).x;
  float reach = (0.1 + 0.9 * tall * tall) * (0.3 + 0.7 * rays) * (1.0 + 0.25 * uSurge);  // how high this ray stands
  float h = z - mix(105.0, 96.0, drive) + 5.0 * (0.5 - rays);      // the harder it is driven, the deeper its lower border: ray by ray
  float up = max(h, 0.0);
  float soft = 2.0 + s / 90.0;                                     // a far border is seen through more air: less crisp
  float green = smoothstep(-soft, 0.5, h) * exp(-up / mix(16.0, 110.0, min(reach, 1.0))) * (1.0 + 1.5 * exp(-up / 8.0));
  // The border is one band; above it the rays part into filaments.
  float streak = mix(0.35 + 0.65 * rays, 0.05 + 0.95 * smoothstep(0.32, 0.8, rays), smoothstep(0.0, 60.0, h));
  float tops = smoothstep(140.0, 240.0, z) * exp(-max(z - 240.0, 0.0) / 80.0) * reach * (0.3 + 0.7 * rays);    // only the tall rays wear them
  // Nitrogen's pink, just under the green: only where the arc is driven hard, and too fine to see on a far one.
  float fringe = exp(-pow((h + 0.6 * soft + 1.0) / 3.5, 2.0)) * smoothstep(0.55, 1.0, drive) * (0.15 + 0.85 * rays) * smoothstep(750.0, 350.0, s);
  vec3 c = vec3(0.24, 1.0, 0.38) * green * streak + vec3(0.80, 0.12, 0.60) * 0.45 * tops + vec3(1.0, 0.22, 0.70) * 0.9 * fringe;
  return c * (0.05 + 0.95 * drive);
}

// One curtain: its arc lies base km north on the meridian and runs east–west, tilt km further north per km east.
// The foot at l lies at east = l − FOLD m, north = base + tilt east + m, with m = stray(l).
vec3 curtain(float sa, float ca, float tanAlt, float k, float base, float tilt) {
  float den = ca - tilt * sa;
  if (den < 0.05) return vec3(0.0);                                // looking along the arc or away from it
  // The line of sight meets the arc itself at l0, so every place it passes through the curtain lies within span of that.
  float l0 = base / den * sa; float span = min((SWAY.x + SWAY.y + SWAY.z) * (FOLD + abs(sa) / den) + 4.0, 700.0); float dl = 2.0 * span / float(STEPS);
  vec3 col = vec3(0.0);
  // g: how far (km) the foot at l lies to the side of the line of sight.
  float la = l0 - span; float m = stray(la, k); float ga = (la - FOLD * m) * den - (base + m) * sa; float gp = ga;
  for (int i = 1; i <= STEPS; i++) {
    float lb = la + dl; m = stray(lb, k); float gb = (lb - FOLD * m) * den - (base + m) * sa;
    float l = la; float miss = -1.0; float bend = gb - 2.0 * ga + gp;
    bool cross = ga * gb < 0.0;                                    // the foot crosses the line of sight
    if (cross) l = mix(la, lb, ga / (ga - gb));
    else if (ga * gp > 0.0 && ga * bend > 0.0 && (ga - gp) * (gb - ga) < 0.0) {
      // A fold turns back just short of the line of sight, by this many km.
      miss = ga - 0.125 * (gb - gp) * (gb - gp) / bend; miss = miss * ga > 0.0 ? abs(miss) : 0.0;
      l = la - 0.5 * dl * (gb - gp) / bend;
    }
    if (cross || miss >= 0.0) {
      m = stray(l, k);
      float x = l - FOLD * m; float s = x * sa + (base + tilt * x + m) * ca;
      float z = s * tanAlt + s * s / 12742.0;                      // km up, on a round Earth
      if (s > 40.0 && z > 88.0 && z < 640.0) {
        // Seen obliquely a sheet is deep, which is what lights the folds. And it has thickness, so its light does
        // not end on the knife edge where the crossings do: it tails off over a few km (more, seen from far away).
        vec2 t = vec2(1.0 - FOLD * slope(l, k), 0.0); t.y = tilt * t.x + slope(l, k);
        float thick = 4.0 + s / 60.0;
        float w = miss < 0.0 ? min(length(t) / max(abs(t.x * ca - t.y * sa), 0.01), 0.5 * LIMB) : LIMB * exp(-miss * miss / (thick * thick));
        col += emission(l, s, z, k) * w;
      }
    }
    gp = ga; la = lb; ga = gb;
  }
  return col;
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float alt = altOf(p.y);
  if (alt < -1.5 || alt > 76.0) { o = vec4(0.0); return; }
  // Rays stand along the field lines, which meet far overhead: through a wide lens they lean together.
  float az = radians((p.x - uNorthX) / uAltScale) / (1.0 - alt / 240.0);
  float sa = sin(az); float ca = cos(az); float tanAlt = tan(radians(clamp(alt, 0.05, 80.0)));
  // The active stretch of the arcs is to the north-east (right of the meridian); toward the west they thin out.
  float east = mix(0.06, 1.0, smoothstep(-1.05, 0.0, az));
  // Three arcs at three distances and on three bearings, so their borders cross in perspective instead of stacking.
  vec3 col = curtain(sa, ca, tanAlt, 0.0, 300.0, -0.22) + 0.6 * curtain(sa, ca, tanAlt, 1.0, 450.0, 0.10) + 0.5 * curtain(sa, ca, tanAlt, 2.0, 800.0, -0.04);
  o = vec4(col * 2.5 * east * (1.0 + 0.45 * uSurge) * smoothstep(-1.5, 1.0, alt) * smoothstep(76.0, 48.0, alt), 1.0);
}
`;

// The land: a photographed horizon (luminance and a matte), relit. Its only light is the sky's — starlight, airglow
// and whatever aurora stands over it — so the snow breathes green with the curtains and the spruce stay near black.
export const groundFrag = head + /* glsl */`
uniform sampler2D uLand, uAurora;
uniform vec2 uRes;
uniform vec4 uLandMap;        // the band on screen: left edge, width, height (px)
uniform vec3 uDome;           // the observatory: x of the dome's axis, y of its foot, the dome's radius (px)
uniform float uRatio, uAuroraGain;
in vec2 vUv;
out vec4 o;

const vec3 LAMP = vec3(1.0, 0.50, 0.15);   // a tungsten bulb behind a window

float box(vec2 d, vec2 b) { vec2 q = abs(d) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float yb = uRes.y - p.y;
  vec4 t = texture(uLand, vec2((p.x - uLandMap.x) / uLandMap.y, 1.0 - yb / uLandMap.z)); // premultiplied
  float cov = t.a * step(yb, uLandMap.z - 1.0);
  float lin = pow(t.r / max(t.a, 0.004), 2.2);              // how much of the light on it the land returns
  lin *= mix(0.5, 1.0, smoothstep(0.10, 0.55, lin));         // under the trees there is less sky to light anything

  // The aurora over this stretch of land, gathered very wide (its coarse mips): snow is lit by the whole sky above
  // it, so no single ray may print itself on the ground. Snow hands it back whiter than it came.
  vec3 aur = textureLod(uAurora, vec2(vUv.x, 0.18), 5.5).rgb + textureLod(uAurora, vec2(vUv.x, 0.32), 6.0).rgb + textureLod(uAurora, vec2(vUv.x, 0.48), 6.5).rgb;
  aur = mix(aur, vec3(dot(aur, vec3(0.3333))), 0.35);
  vec3 light = vec3(0.030, 0.040, 0.052) + aur * uAuroraGain;
  vec3 col = lin * light * mix(0.3, 1.0, smoothstep(2.0, 46.0, yb)); // the nearest snow lies in the rise's own shadow

  // The observatory stands just behind the crest of the rise, so the snow's own edge buries its foot: a dome with its
  // shutter open and the keeper's hut beside it, one window lit. Units: dome radii, y up from the foot.
  vec2 d = (p - uDome.xy) / uDome.z; d.y = -d.y;
  float px = 1.5 / (uDome.z * uRatio);                       // edges as soft as the lens makes a star
  vec2 w = d - vec2(-1.95, 0.42);                            // from the middle of the window
  float pane = box(w, vec2(0.17, 0.13));
  vec4 hut = vec4(0.0);                                       // premultiplied
  if (abs(d.x + 0.95) < 2.3 && d.y < 2.0) {
    float cap = max(length(d - vec2(0.0, 0.8)) - 1.0, 0.8 - d.y);
    float drum = max(abs(d.x) - 0.94, d.y - 0.8);
    float wall = max(abs(d.x + 1.95) - 0.95, d.y - 0.72);
    float roof = box(d - vec2(-1.95, 0.86), vec2(1.02 - 0.5 * (d.y - 0.72), 0.14)) - 0.03; // a snow-laden slope, seen from its eaves
    float flue = box(d - vec2(-2.5, 1.14), vec2(0.09, 0.16));
    vec3 snow = light * 0.8;
    // The dome: white paint under a sky whose light comes from above and behind, so its crown and its limb are the
    // bright of it and its face is in shade; snow keeps to the crown.
    vec3 n = vec3(d.x, d.y - 0.8, 0.0); n.z = sqrt(max(1.0 - dot(n.xy, n.xy), 0.0));
    float top = max(n.y, 0.0);
    float sky = cap < drum ? 0.14 + 0.42 * pow(top, 1.3) + 0.55 * (1.0 - n.z) * (1.0 - n.z) * (0.25 + top)
      : 0.10 + 0.16 * pow(abs(d.x), 3.0) - 0.05 * smoothstep(0.62, 0.8, d.y);          // the drum, under the dome's lip
    vec3 body = light * 0.7 * sky;
    body = mix(body, snow * (0.5 + 0.5 * top), smoothstep(0.74, 0.90, n.y + 0.07 * sin(d.x * 8.0 + 1.0)) * step(cap, drum));
    float slit = (1.0 - smoothstep(0.10, 0.10 + px, abs(d.x + 0.24))) * step(0.84, d.y) * step(cap, drum);
    body = mix(body, vec3(0.9, 0.06, 0.02) * 0.004 * (1.9 - d.y), slit);   // the red light they work by, deep inside
    float a = clamp(0.5 - min(cap, drum) / px, 0.0, 1.0);
    hut = vec4(body * a, a);
    // The hut: dark timber, lit only by what its own window throws back off the snow; a white roof; a flue.
    vec3 timber = light * 0.035 * (1.0 - 0.6 * smoothstep(0.55, 0.72, d.y)) + LAMP * 0.03 * exp(-max(pane, 0.0) / 0.3);
    a = clamp(0.5 - min(wall, flue) / px, 0.0, 1.0); hut = mix(hut, vec4(timber, 1.0), a);
    a = clamp(0.5 - roof / px, 0.0, 1.0); hut = mix(hut, vec4(snow * (0.45 + 0.55 * smoothstep(0.72, 0.98, d.y)), 1.0), a);
    // The window: a bulb somewhere inside, glazing bars across it.
    a = clamp(0.5 - pane / px, 0.0, 1.0);
    float bars = (0.4 + 0.6 * smoothstep(0.0, px, abs(w.x))) * (0.6 + 0.4 * smoothstep(0.0, px, abs(w.y - 0.02)));
    hut = mix(hut, vec4(LAMP * (2.0 + 2.5 * exp(-dot(w - vec2(0.05, 0.03), w - vec2(0.05, 0.03)) / 0.02)) * bars, 1.0), a);
    // Snow has drifted against the walls.
    hut.rgb = mix(hut.rgb, snow * 0.85 * hut.a, smoothstep(0.17, 0.03, d.y + 0.05 * sin(d.x * 5.0 + 2.0)));
  }
  // What the window throws: a pool on the snow in front of it, and a little glow in the lens.
  float fall = length(vec2(w.x, min(w.y + 0.45, 0.0) * 1.6));
  col += LAMP * lin * 0.55 * exp(-fall / 0.75) * smoothstep(0.1, -0.5, w.y);
  vec3 halo = LAMP * (0.35 * exp(-max(pane, 0.0) / 0.10) + 0.035 * exp(-max(pane, 0.0) / 0.7));
  o = vec4(col * cov + hut.rgb * (1.0 - cov) + halo, cov + hut.a * (1.0 - cov));
  if (o.a + halo.r < 0.002) discard;
}
`;

// Lens and film: vignette, a filmic curve on the brightest channel (hue held, cores bleach to white), grade, grain.
export const postFrag = head + /* glsl */`
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime, uGrain;
in vec2 vUv;
out vec4 o;

float hash(uvec2 x) {
  x = x * uvec2(1664525u, 1013904223u) + x.yx * 747796405u;
  uint h = (x.x ^ (x.y >> 15u)) * 2246822519u; h ^= h >> 13u; h *= 3266489917u; h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec2 v = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 2.0;
  c *= 1.0 - 0.34 * smoothstep(0.35, 1.25, length(v));

  float l = max(max(c.r, c.g), c.b);
  float t = l * (1.0 + l * 0.0625) / (1.0 + l);                // white at 4
  c *= min(t, 1.0) / max(l, 1e-5);
  c = mix(c, vec3(1.0), 1.0 - exp(-max(l - 4.0, 0.0) * 0.12)); // past white a core bleaches, as on a sensor

  c = pow(c, vec3(1.0 / 2.2));
  // Grade: cool, slightly lifted shadows; nothing touches the top.
  c += vec3(0.004, 0.007, 0.014) * (1.0 - c);

  uvec2 px = uvec2(gl_FragCoord.xy); uint f = uint(uTime * 24.0);
  float n = hash(px + uvec2(f * 131u, f * 71u)) + hash(px.yx + uvec2(f * 37u + 17u, f * 113u)) - 1.0; // triangular
  c += n * uGrain * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.6, max(max(c.r, c.g), c.b))));

  o = vec4(c, 1.0);
}
`;
