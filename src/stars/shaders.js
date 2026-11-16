// GLSL for the sky. Everything is lit in linear light into a half-float target; `post` is the lens and the film.
// Screen space in the shaders is CSS pixels with y down (the same space index.js lays the chart out in).
// Two frames meet here: the stars and the chart live on the chart plane (turning about the pole); the air, the
// aurora and the land live in the ground frame (altitude grows up the screen from uHorizonY, north under the pole).

export const SKY_SPAN = 150; // degrees from the pole at the edge of sky.webp (tools/build-assets.mjs holds the same)

const head = /* glsl */`precision highp float;
#define TAU 6.28318530718
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
  return exp(-vec3(0.085, 0.11, 0.16) * (mass - 1.0));
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

  // The sky's own light: blue-black overhead, a little brighter and greener toward the horizon (airglow).
  float up = clamp(alt / 75.0, 0.0, 1.0);
  vec3 glow = mix(vec3(0.0068, 0.0118, 0.0165), vec3(0.0021, 0.0038, 0.0090), pow(up, 0.6));
  glow += vec3(0.0012, 0.0042, 0.0020) * exp(-pow((alt - 9.0) / 9.0, 2.0));

  vec3 aurora = texture(uAurora, vUv).rgb * uAuroraGain * pow(ext, vec3(0.6));
  vec3 col = (deep * vec3(0.90, 0.97, 1.12) * ext + glow) * mix(0.5, 1.0, quiet) + aurora * mix(0.45, 1.0, quiet);

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
out float vAmp, vHalf, vHalo;
void main() {
  float aMag = position.z;
  vec2 p = uPole + vec2(position.x * uRot.x - position.y * uRot.y, position.x * uRot.y + position.y * uRot.x) * uScale;
  vec2 uv = p / uRes;
  float alt = altOf(p.y);
  vec3 ext = extinction(alt);
  float amp = uGain * pow(10.0, -0.4 * (aMag - 3.5));
  amp *= smoothstep(uMagLimit, uMagLimit - 0.8, aMag); // the faintest fade into the photographed field under them
  amp *= ext.g * mix(0.1, 1.0, textureLod(uMask, p * uMaskMap.xy + uMaskMap.zw, 0.0).r);
  // Scintillation: two slow beats per star, deeper toward the horizon where there is more air to look through.
  float tw = sin(uTime * (1.3 + aSeed * 2.9) + aSeed * 40.0) * 0.6 + sin(uTime * (3.1 + aSeed * 4.7) + aSeed * 91.0) * 0.4;
  amp *= 1.0 + uTwinkle * tw * mix(0.36, 0.09, smoothstep(4.0, 45.0, alt));
  amp = max(amp * (1.0 + 0.45 * aMark.y), 0.22 * aMark.y);
  vec3 col = aCol * ext / max(ext.g, 1e-4);
  // An inked star burns in the pin colour, bright enough to hold it and no brighter (4 is the film's white).
  amp = mix(amp, clamp(amp * 1.4, 2.2, 4.0), aMark.x);
  col = mix(col, uTone * 0.25, aMark.x);
  float halo = 0.065 * smoothstep(0.25, 2.5, amp) + 0.07 * aMark.x; // only the bright ones wear a skirt worth drawing
  // Radius where both terms of the profile sink under 0.002: the sprite never shows its square.
  float rad = uAlpha * max(sqrt(max(pow(amp / 0.002, 0.4) - 1.0, 0.0)), 3.46 * sqrt(max(pow(amp * halo / 0.002, 0.6667) - 1.0, 0.0))) + 1.0;
  rad = min(rad, 56.0);
  vCol = col; vAmp = amp; vHalf = rad; vHalo = halo;
  gl_PointSize = 2.0 * rad * uRatio;
  // Drawn into a viewport uPad px larger all round, so a bright star's skirt slides in over the edge instead of popping.
  vec2 ndc = (p + uPad) / (uRes + 2.0 * uPad) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

export const starFrag = head + /* glsl */`
uniform float uAlpha;
in vec3 vCol;
in float vAmp, vHalf, vHalo;
out vec4 o;
void main() {
  vec2 d = (gl_PointCoord - 0.5) * 2.0;
  float r = length(d) * vHalf / uAlpha; float r2 = r * r;
  // Core, and the wide skirt a lens scatters around anything bright.
  float i = vAmp * (pow(1.0 + r2, -2.5) + vHalo * pow(1.0 + r2 / 12.0, -1.5)) * smoothstep(1.0, 0.8, length(d));
  o = vec4(vCol * i, 0.0);
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
  o = vec4(vInk.rgb * (core + glow), 0.0);
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

export const meteorFrag = head + /* glsl */`
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
  float head = burn(uh) * headOn * (exp(-dot(dh, dh) / 3.2) * 9.0 + exp(-dot(dh, dh) / 60.0) * 0.5);
  float age = uShootP - u * RUN;                             // seconds since the head passed this point
  float behind = step(0.0, age) * step(vQ.x, vLen) * step(0.0, vQ.x) * burn(u);
  float across = exp(-vQ.y * vQ.y / 1.1);
  float wake = behind * across * exp(-age / 0.07) * 1.6;      // the incandescent train
  float after = behind * exp(-vQ.y * vQ.y / 2.4) * exp(-age / 0.22) * 0.12; // the afterglow
  vec3 col = vec3(1.0, 0.96, 0.88) * head + vec3(0.85, 0.92, 1.0) * wake + vec3(0.45, 1.0, 0.6) * after;
  o = vec4(col, 0.0);
}
`;

// The aurora, into a small target. Curtains are thin vertical sheets standing on east–west arcs north of the
// observatory; each pixel's line of sight is met with each sheet analytically (no marching), and the height at
// which it meets it picks the colour: the sharp green lower border near 100 km, red and violet toward the top.
export const auroraFrag = head + noise + air + /* glsl */`
uniform vec2 uRes;
uniform float uTime, uNorthX, uTexel;
in vec2 vUv;
out vec4 o;

// North distance (km) of sheet k at east distance x, and its slope.
vec2 sheet(float x, float k, float base) {
  vec2 a = n1(x / 260.0 + k * 13.7 + uTime * 0.006);
  vec2 b = n1(x / 61.0 - k * 7.3 - uTime * 0.017);
  vec2 c = n1(x / 19.0 + k * 3.1 + uTime * 0.041);
  return vec2(base + (a.x - 0.5) * 190.0 + (b.x - 0.5) * 54.0 + (c.x - 0.5) * 11.0, a.y * (190.0 / 260.0) + b.y * (54.0 / 61.0) + c.y * (11.0 / 19.0));
}

vec3 curtain(float sa, float ca, float tanAlt, float k, float base, float gain) {
  float s = base / ca;
  for (int i = 0; i < 3; i++) s = sheet(s * sa, k, base).x / ca;   // where the line of sight meets the sheet
  if (s < 30.0) return vec3(0.0);
  float x = s * sa;
  vec2 y = sheet(x, k, base);
  // Seen edge-on a sheet is deep: that is what lights the folds.
  float depth = min(sqrt(1.0 + y.y * y.y) / max(abs(ca - y.y * sa), 0.22), 4.0);
  float z = s * tanAlt + s * s / 12742.0;                         // km up, on a round Earth
  // Rays: striations along the sheet, drifting; none finer than this target can hold.
  float foot = s * uTexel;                                        // km across one texel at that distance
  float l = x + y.x * 0.35;
  float rays = n1(l / 34.0 + uTime * 0.05 + k * 5.0).x;
  rays = mix(rays, n1(l / 11.0 - uTime * 0.09 + k * 9.0).x, 0.45 * smoothstep(1.2, 3.5, 11.0 / foot));
  float tall = n1(l / 90.0 - uTime * 0.02 + k * 17.0).x;
  float along = smoothstep(0.25, 0.75, n1(x / 420.0 + k * 3.3 + uTime * 0.004).x);  // an arc is never evenly bright
  float green = smoothstep(94.0, 103.0, z) * exp(-max(z - 103.0, 0.0) / mix(15.0, 56.0, tall * tall * (0.4 + 0.6 * rays)));
  green *= 1.0 + 1.1 * exp(-max(z - 103.0, 0.0) / 7.0);              // emission peaks just above the border: its bright hem
  float red = smoothstep(140.0, 250.0, z) * exp(-max(z - 250.0, 0.0) / 120.0) * tall / depth;   // the tops are diffuse: folds do not sharpen them
  float fringe = exp(-pow((z - 97.0) / 5.0, 2.0));
  vec3 c = vec3(0.26, 1.0, 0.36) * green + vec3(0.95, 0.10, 0.16) * red * 0.10 + vec3(0.55, 0.22, 0.95) * (fringe * 0.16 + red * 0.07);
  float high = smoothstep(103.0, 170.0, z);                       // the border is one band; the rays show above it
  return c * depth * gain * (0.25 + 0.75 * along) * mix(0.55 + 0.45 * rays, 0.1 + 0.9 * smoothstep(0.2, 0.85, rays), high);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float alt = altOf(p.y);
  if (alt < -1.5) { o = vec4(0.0); return; }
  float az = radians((p.x - uNorthX) / uAltScale);
  float sa = sin(az); float ca = max(cos(az), 0.12); float tanAlt = tan(radians(clamp(alt, 0.05, 80.0)));
  // The active stretch of the arc is to the north-east (right of the meridian); toward the west it thins out.
  float east = mix(0.16, 1.0, smoothstep(-1.15, 0.05, az));
  vec3 col = curtain(sa, ca, tanAlt, 0.0, 520.0, 1.0) + curtain(sa, ca, tanAlt, 1.0, 820.0, 0.6) + curtain(sa, ca, tanAlt, 2.0, 330.0, 0.33);
  // The diffuse glow the curtains sit in.
  float s = 600.0 / ca; float z = s * tanAlt + s * s / 12742.0;
  col += vec3(0.20, 0.85, 0.36) * 0.11 * smoothstep(80.0, 115.0, z) * exp(-max(z - 115.0, 0.0) / 85.0);
  o = vec4(col * east * smoothstep(-1.5, 1.0, alt), 1.0);
}
`;

// The land: far ridge, near hill, what stands on the hill. Its only light is the sky's: the aurora to the
// north-east greens the snow that faces it. Edges are a touch soft, as a foreground is to a lens focused at infinity.
export const groundFrag = head + noise + /* glsl */`
uniform sampler2D uGround;
uniform vec2 uRes;
uniform vec3 uLamp, uDome;
uniform float uRatio, uGroundN;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float yb = uRes.y - p.y;
  vec3 g = texture(uGround, vec2((p.x / uRes.x * (uGroundN - 1.0) + 0.5) / uGroundN, 0.5)).rgb;
  vec3 slope = dFdx(g) * uRatio;
  vec3 sd = (g - yb) / sqrt(1.0 + slope * slope);              // px inside each skyline
  vec3 cov = smoothstep(vec3(-0.75, -0.9, -0.9), vec3(0.75, 0.9, 0.9), sd);
  if (max(cov.r, cov.b) <= 0.0) discard;
  const vec3 light = vec3(0.0042, 0.0092, 0.0086);             // what the sky and the aurora lay on snow

  // Far ridge: snow broken by rock; the faces turned to the aurora take more of its light. The facing comes from
  // the ridge's broad shape (a wide difference), never from the texel-to-texel slope, which would stripe it.
  float fall = g.r - yb;
  float tx = (p.x / uRes.x * (uGroundN - 1.0) + 0.5) / uGroundN; float wide = 9.0 / uRes.x * (uGroundN - 1.0) / uGroundN;
  float lean = (texture(uGround, vec2(tx + wide, 0.5)).r - texture(uGround, vec2(tx - wide, 0.5)).r) / 18.0;
  float rib = n2(vec2(p.x * 0.085 + fall * 0.05 * lean, fall * 0.04 + 3.0));
  float lie = n2(vec2(p.x * 0.021 + 7.0, fall * 0.06)) * 0.6 + rib * 0.4;
  float snow = smoothstep(0.3, 0.66, lie + 0.12 * smoothstep(0.0, 16.0, fall));
  float facing = clamp(0.6 - lean * 0.9, 0.2, 1.25);
  vec3 farCol = mix(vec3(0.0014, 0.0020, 0.0026), light * 1.7 * facing * (0.7 + 0.45 * rib), snow);
  farCol = mix(farCol, vec3(0.0052, 0.0088, 0.0098), smoothstep(g.r * 0.6, 0.0, yb) * 0.7);   // mist off the fjord at its foot
  // Near hill: wind-packed snow in soft drifts; the spruce and the dome on it are the darkest things in the frame.
  float drift = n2(vec2(p.x * 0.018 + yb * 0.05, yb * 0.11)) * 0.6 + n2(vec2(p.x * 0.07, yb * 0.3 + 5.0)) * 0.4;
  vec3 nearCol = light * (0.26 + 0.36 * drift) * smoothstep(-10.0, 30.0, yb);
  vec3 dark = vec3(0.00035, 0.00048, 0.0006);
  // The dome is metal: a dull highlight where it turns to the aurora.
  vec2 dd = (p - uDome.xy) / uDome.z; float inDome = step(dot(dd, dd), 1.0) * step(dd.y, 0.0);
  vec3 nrm = vec3(dd, sqrt(max(1.0 - dot(dd, dd), 0.0)));
  dark += inDome * light * (0.10 + 0.9 * pow(max(dot(nrm, normalize(vec3(0.55, -0.6, 0.58))), 0.0), 5.0)) * step(0.06, abs(dd.x + 0.09));
  vec3 col = mix(farCol, dark, cov.b);
  col = mix(col, nearCol, cov.g);
  // The red work light by the dome's door: a point, and what it throws on the snow.
  vec2 dl = p - uLamp.xy; float l2 = dot(dl, dl);
  col += vec3(1.0, 0.12, 0.03) * uLamp.z * (0.5 * exp(-l2 / 0.9) + 0.016 * exp(-sqrt(l2) / 7.0) * cov.g);
  o = vec4(col, max(cov.r, cov.b));
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
