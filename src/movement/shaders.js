// GLSL for the movement. Every part is a flat piece at its own height, drawn from the mainplate up: a quad whose
// fragment shader works out the part's outline (a signed distance, so edges are clean at any size), its finish and
// what it mirrors. Nothing is lit by a lamp of its own: metal shows the studio (optics.js, ENV) and nothing else.
// ponytail: a part is its top face, its chamfer and the shade it throws; it has no flanks. Under this lens and a
// tilt of ten degrees at most a flank would be a few pixels of shadow, which the shade already is. A wider tilt
// would need them drawn (a few more slices of each outline, stepped down through its thickness).
//
// Units: the movement's millimetres (caliber.js), x right, y up the picture, z toward the lens. `bench` space is
// the same after the hand's tilt, about the frame's centre on the plane of focus; the lens looks down its z.
import { ENV_K } from './optics.js';
import { PRIMS, BALANCE } from './caliber.js';

const f = (v) => v.toFixed(5);

// highp int as well as float: three adds no precision to a raw shader, and a mediump uint hash is 16 bits on many
// phone GPUs (Mali; Adreno under Mesa), where it returns 0.
const head = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
uniform vec2 uRes;      // hero box, CSS px
uniform float uPx;      // device px per CSS px
uniform float uPpm;     // CSS px per mm on the plane of focus
uniform float uCamD;    // mm from that plane to the lens
uniform mat3 uTilt;     // the hand's tilt: movement to bench
uniform vec3 uPivot;    // the point of the movement the tilt turns about
`;

export const fullscreenVert = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// One flat part. uBox places its quad in the movement; uPart is its height and how far it has turned. vC is the
// point measured from the part's centre, vL the same in the part's own frame (turned with it), vW the point on the bench.
export const partVert = head + /* glsl */`
in vec3 position;
uniform vec4 uBox;    // centre x, y; half width, half height (mm)
uniform vec4 uPart;   // z (mm), turn (rad)
out vec2 vP; out vec2 vC; out vec2 vL; out vec3 vW;
void main() {
  vec2 l = position.xy * uBox.zw; vec2 p = uBox.xy + l;
  float c = cos(uPart.y); float s = sin(uPart.y);
  vP = p; vC = l; vL = vec2(c * l.x + s * l.y, c * l.y - s * l.x);
  vW = uTilt * (vec3(p, uPart.x) - uPivot);
  // a long lens: what is nearer is a little larger. w carries it, so everything across the quad stays true
  gl_Position = vec4(vW.xy * uPpm * 2.0 / uRes, 0.0, (uCamD - vW.z) / uCamD);
}
`;

// The plates' outlines, baked once per layout into a field of signed distances (mm, negative inside): r the
// bridge, g the balance cock, b the pallet bridge. The list of bars is caliber.js's, read the same way as there.
export const bakeFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vUv; out vec4 o;
uniform vec4 uA[${PRIMS}]; uniform vec4 uB[${PRIMS}]; uniform int uCount;
uniform vec4 uMap;   // the field's corner (mm) and its size
float smin(float a, float b, float k) { if (k <= 0.0) return min(a, b); float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
void main() {
  vec2 p = uMap.xy + vUv * uMap.zw;
  vec4 d = vec4(-1e3, 1e3, 1e3, 1e3);
  for (int i = 0; i < ${PRIMS}; i++) {
    if (i >= uCount) break;
    vec4 a = uA[i]; vec4 b = uB[i];   // b: radius, plate, cut?, fillet
    vec2 ab = a.zw - a.xy; float l2 = dot(ab, ab); float t = l2 > 0.0 ? clamp(dot(p - a.xy, ab) / l2, 0.0, 1.0) : 0.0;
    float dp = length(p - a.xy - ab * t) - b.x;
    vec4 m = vec4(equal(ivec4(int(b.y)), ivec4(0, 1, 2, 3))); float cur = dot(d, m);
    cur = b.z > 0.5 ? -smin(-cur, dp, b.w) : smin(cur, dp, b.w);
    d = mix(d, vec4(cur), m);
  }
  o = d;
}
`;

// What every part's fragment shader shares: the studio, the two ways metal shows it, the finishes, the plates'
// field and the shade under them.
const lib = head + /* glsl */`
uniform sampler2D uEnv;      // the studio (optics.js, ENV): stereographic about the lens's axis, wider blurs in its mips
uniform sampler2D uSdf;      // the plates' field
uniform vec4 uSdfMap;        // movement mm to the field's uv: (p - xy) * zw
uniform float uSdfStep;      // one texel of it, mm
uniform vec4 uLevelZ;        // how high each plate's face is
uniform vec3 uKey;           // toward the broadest light, along the plates (unit x, y), and how far a shadow falls per mm of height
uniform float uFrame;
in vec2 vP; in vec2 vC; in vec2 vL; in vec3 vW;
uniform vec4 uPart;
layout(location = 0) out vec4 oCol;   // linear light, premultiplied by coverage
layout(location = 1) out vec4 oAux;   // r: height on the bench, for the lens

#ifdef LOW
const int TAPS = 5;
#else
const int TAPS = 9;
#endif
const vec3 RHODIUM = vec3(0.80, 0.79, 0.76);
const vec3 GOLD = vec3(1.0, 0.72, 0.3);
const vec3 STEEL = vec3(0.60, 0.61, 0.63);

float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Scratches: noise along one coordinate, -1..1, coarse ones the eye can follow and fine ones that fade out before
// they are smaller than a pixel (they would only shimmer).
float scratch(float x) {
  float w = fwidth(x);
  float a = mix(hash(vec2(floor(x), 3.0)), hash(vec2(floor(x) + 1.0, 3.0)), smoothstep(0.0, 1.0, fract(x)));
  float y = x * 3.7 + 11.0;
  float b = mix(hash(vec2(floor(y), 7.0)), hash(vec2(floor(y) + 1.0, 7.0)), smoothstep(0.0, 1.0, fract(y)));
  return (a - 0.5) * 1.3 * smoothstep(0.7, 0.25, w) + (b - 0.5) * 0.7 * smoothstep(0.24, 0.08, w);
}

vec3 envAt(vec3 d, float lod) {
  vec2 q = d.xy / (max(1.0 + d.z, 0.02) * ${f(ENV_K)});
  float r = length(q); if (r > 1.0) q /= r;   // past the map's edge: the edge
  return textureLod(uEnv, 0.5 + 0.5 * q, lod).rgb;
}
// Polished: the studio as a mirror shows it. lod 0 is sharp; each step up about doubles the blur.
vec3 mirror(vec3 N, vec3 V, float lod) { return envAt(reflect(-V, N), lod); }
// Grained: every scratch is a tiny cylinder lying along T, and mirrors a whole line of the studio across itself.
// spread is the tangent of how far a scratch's flanks lean.
vec3 grained(vec3 N, vec3 T, vec3 V, float spread, float lod) {
  vec3 B = normalize(cross(N, T)); vec3 c = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float a = (float(i) + 0.5) / float(TAPS) * 2.0 - 1.0; float w = exp(-2.4 * a * a);
    c += w * envAt(reflect(-V, normalize(N + B * (a * spread))), lod); ws += w;
  }
  return c / ws;
}
// A grained face in full: mostly the line of the studio its scratches mirror, a little of everything (no surface
// is only scratches), and each scratch a touch brighter or darker than the next.
vec3 satin(vec3 tint, vec3 n, vec2 t, float grain, vec3 V) {
  vec3 N = uTilt * n; vec3 T = uTilt * vec3(t, 0.0);
  N = normalize(N + normalize(cross(N, T)) * grain * 0.035);
  return tint * (0.9 * grained(N, T, V, 0.2, 2.5) + 0.1 * envAt(reflect(-V, N), 5.2)) * (1.0 + 0.06 * grain);
}

vec4 fieldAt(vec2 p) { return texture(uSdf, (p - uSdfMap.xy) * uSdfMap.zw); }
float pick(vec4 v, int c) { return c == 0 ? v.r : c == 1 ? v.g : c == 2 ? v.b : v.a; }
// How much of the studio a point at height z still sees past the plates above it: 1 in the open. The lamps are
// broad, so an edge h above shades a band about as wide as h, deepest right under the plate.
float open(vec2 p, float z) {
  float v = 1.0; vec4 over = fieldAt(p);
  for (int c = 0; c < 3; c++) {
    float h = uLevelZ[c] - z; if (h < 0.06) continue;
    float key = pick(fieldAt(p + uKey.xy * (h * uKey.z)), c);
    v *= mix(0.22, 1.0, smoothstep(-0.5 * h, 0.8 * h, pick(over, c))) * mix(0.35, 1.0, smoothstep(-0.25 * h, 0.45 * h, key));
  }
  return v;
}

// Geneva stripes. A turning abrasive disc, tipped so only its leading edge touches, is drawn across the plate in
// straight passes BAND apart: every pass leaves a band of fine scratches that are arcs of the disc's own circle.
// Across a band the scratches turn steadily, so the light slides across it; at the next pass they jump back.
const vec2 STRIPE = vec2(${f(Math.cos(0.5))}, ${f(Math.sin(0.5))});   // the way the passes run
const float BAND = 1.75; const float TOOL = 1.24;                      // mm: a band's width, the disc's radius
void stripes(vec2 p, out vec2 t, out float grain, out float across) {
  vec2 side = vec2(-STRIPE.y, STRIPE.x);
  float u = dot(p, STRIPE); float v = dot(p, side) / BAND; float band = floor(v);
  across = v - band - 0.5;
  float s = across * BAND / TOOL; float c = sqrt(1.0 - s * s);
  t = -s * STRIPE + c * side;
  grain = scratch((u - TOOL * c) * 13.0 + band * 37.3);
}
// Perlage: a spinning peg is touched down in rows, each spot over the edge of the last like fish scales. Every
// spot is a little disc of circular scratches.
const float PEARL = 0.74; const float SPOT = 0.56;   // mm: from spot to spot, a spot's radius
void perlage(vec2 p, out vec2 t, out float grain, out float rim) {
  vec2 q = p / PEARL; float best = -1e9; vec2 c0 = p;
  for (int j = -1; j <= 1; j++) {
    float row = floor(q.y) + float(j); float shift = 0.5 * mod(row, 2.0);
    for (int i = -1; i <= 1; i++) {
      float col = floor(q.x - shift) + float(i); vec2 c = vec2(col + 0.5 + shift, row + 0.5) * PEARL;
      float order = row * 256.0 + col;
      if (length(p - c) < SPOT && order > best) { best = order; c0 = c; }
    }
  }
  vec2 r = p - c0; float rho = length(r);
  t = vec2(-r.y, r.x) / max(rho, 1e-4);
  grain = scratch(rho * 34.0 + hash(c0 * 91.0) * 40.0);
  rim = rho / SPOT;
}
float cov(float d, float px) { return clamp(0.5 - d / px, 0.0, 1.0); }   // how much of a pixel an outline covers
// The shade a round part over this one throws: o is its centre, radius and height. Broad and soft, as the lamps are.
float under(vec2 p, float z, vec4 o, float deep) {
  float h = o.w - z; if (h < 0.05 || o.z <= 0.0) return 1.0;
  float d = length(p - o.xy) - o.z; float k = length(p - o.xy + uKey.xy * (h * uKey.z)) - o.z;
  return mix(1.0 - deep, 1.0, smoothstep(-0.5 * h, 0.75 * h, d)) * mix(1.0 - 0.6 * deep, 1.0, smoothstep(-0.25 * h, 0.45 * h, k));
}
uniform vec4 uRound[6];   // the round parts that can shade others: the train's wheels, the winding wheels
float rounds(vec2 p, float z) { float v = 1.0; for (int i = 0; i < 6; i++) v *= under(p, z, uRound[i], 0.5); return v; }
// A polished chamfer's normal on the bench, from the outline's own slope across the screen.
vec3 chamfer(float d) { vec2 g = vec2(dFdx(d), dFdy(d)); return normalize(uTilt * vec3(0.0, 0.0, 1.0) + vec3(normalize(g + 1e-7), 0.0)); }
// Shade is never black or grey here: what light reaches under a bridge has come off gilt wheels and brass on its way.
#define SHADE(v) mix(vec3(0.085, 0.07, 0.052), vec3(1.0), v)
void put(vec3 col, float a) { oCol = vec4(col * a, a); oAux = vec4(vW.z * a, 0.0, 0.0, a); }
#define VIEW normalize(vec3(0.0, 0.0, uCamD) - vW)
#define PXMM (length(vec2(dFdx(vP.x), dFdy(vP.x))) + length(vec2(dFdx(vP.y), dFdy(vP.y)))) * 0.5
`;

// The mainplate's floor, seen through the bridge's window: pearled, and in the shade of everything over it.
export const floorFrag = lib + /* glsl */`
void main() {
  if (fieldAt(vP).r < -0.9) discard;   // well under the bridge: the lens cannot see it
  vec2 t; float grain; float rim; perlage(vP, t, grain, rim);
  vec3 n = normalize(vec3(-t.y * 0.012 * rim, t.x * 0.012 * rim, 1.0));   // each spot is a very shallow dish
  vec3 V = VIEW; vec3 col = satin(RHODIUM * 0.92, n, t, grain, V);
  col = mix(col, RHODIUM * 0.92 * mirror(uTilt * n, V, 5.0), 0.3);   // pearling is cut light: more of a sheen than a groove
  col *= SHADE(open(vP, 0.0) * rounds(vP, 0.0));
  put(col, 1.0);
}
`;

// A plate (uCh: which outline of the field): striped on its face, with a polished chamfer round every edge.
export const plateFrag = lib + /* glsl */`
uniform int uCh;
uniform sampler2D uText;    // the headline as distances from its outlines (engrave.js): 0.5 on an outline, more inside a stroke
uniform vec4 uTextMap;      // the field's left and top edge in the movement (mm), and one over its width and height
uniform vec2 uTextK;        // mm that the field's whole range stands for; 1 when there are words to cut
const float BEVEL = 0.12;   // mm: the chamfer's width
void main() {
  float px = PXMM; float d = pick(fieldAt(vP), uCh);
  float a = clamp(0.5 - d / px, 0.0, 1.0); if (a < 0.004) discard;
  vec3 V = VIEW; float z = uLevelZ[uCh];
  vec2 t; float grain; float across; stripes(vP, t, grain, across);
  // each pass of the disc leaves a shallow scallop: across a band the face leans a few degrees one way, then the other
  vec3 col = satin(RHODIUM, normalize(vec3(-STRIPE.y, STRIPE.x, 0.0) * (across * -0.21) + vec3(0.0, 0.0, 1.0)), t, grain, V);
  float face = smoothstep(BEVEL - px, BEVEL + px, -d);
  if (face < 0.999) {
    // the chamfer leans 45° outward, and is polished: one clean line of the studio along every edge
    float e = uSdfStep * 1.5;
    vec2 g = vec2(pick(fieldAt(vP + vec2(e, 0.0)), uCh) - pick(fieldAt(vP - vec2(e, 0.0)), uCh), pick(fieldAt(vP + vec2(0.0, e)), uCh) - pick(fieldAt(vP - vec2(0.0, e)), uCh));
    vec3 n = uTilt * normalize(vec3(normalize(g + 1e-7), 1.0));
    col = mix(RHODIUM * mirror(n, V, 0.9), col, face);
  }
  // Dust: a speck here and there, as on anything that has been out of its case for a minute. Each is a point of the
  // studio's light, and the surest sign that this is an object and not a drawing of one.
  vec2 cell = floor(vP * 1.7); float lot = hash(cell + 17.0);
  if (lot > 0.955) {
    vec2 c = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.1), hash(cell + 9.7))) / 1.7; float rad = 0.01 + 0.022 * hash(cell + 5.5);
    col = mix(col, vec3(0.95, 0.92, 0.86) * envAt(uTilt * vec3(0.0, 0.0, 1.0), 5.5) * 1.5, smoothstep(rad + px, rad - 0.5 * px, length(vP - c)) * 0.75 * face);
  }
  if (uCh == 0 && uTextK.y > 0.5) {
    vec2 tuv = vec2(vP.x - uTextMap.x, uTextMap.y - vP.y) * uTextMap.zw;
    if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
      // The engraver's cut, filled to the brim with blue-black lacquer: dark and glossy, a little hollow toward
      // its edges, with the bright lip of bare metal the graver raised round every stroke.
      float dt = (texture(uText, tuv).r - 0.50196) * uTextK.x;   // mm inside a stroke
      vec2 gt = vec2(dFdx(dt), dFdy(dt)); vec3 lean = vec3(normalize(gt + 1e-7), 0.0);
      float in_ = smoothstep(-px, px, dt);
      vec3 Nl = normalize(uTilt * vec3(0.0, 0.0, 1.0) + lean * 0.35 * smoothstep(0.09, 0.0, dt));
      vec3 lacquer = vec3(0.006, 0.008, 0.017) + 0.03 * mirror(Nl, V, 1.2);
      vec3 lip = RHODIUM * mirror(normalize(uTilt * vec3(0.0, 0.0, 1.0) - lean * 0.9), V, 1.4);
      col = mix(col, lip, smoothstep(0.014 + px, 0.014, abs(dt + 0.01)) * 0.3);
      col = mix(col, lacquer, in_);
    }
  }
  col *= SHADE(open(vP, z) * rounds(vP, z));
  put(col, a);
}
`;

// The lens: only the plane it is focused on is sharp. A point off that plane is a disc, wider the further off;
// each pixel gathers the discs that reach it, so what is sharp is never smeared over what is not.
// ponytail: a pixel looks only as far as its own disc is wide, so a blurred edge in front of something sharp ends
// at its own outline instead of spreading over it. The proper version gathers over the widest disc nearby (a
// small tile-max pass), which costs every pixel the full set of taps.
export const lensFrag = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uAux; uniform vec2 uTexel;
uniform float uFocus;   // the height on the bench that is sharp, mm
uniform float uCoc;     // device px of blur radius per mm off it
uniform float uFrame;
#ifdef LOW
const int N = 10;
#else
const int N = 22;
#endif
const float RMAX = 14.0;
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 acc = texture(uScene, vUv).rgb; float z0 = texture(uAux, vUv).r;
  float r0 = min(abs(z0 - uFocus) * uCoc, RMAX); float n = 1.0;
  if (r0 > 0.6) {
    float turn = rnd(gl_FragCoord.xy + uFrame * vec2(13.0, 7.0)) * 6.2832;
    for (int i = 1; i <= N; i++) {
      float fr = sqrt(float(i) / float(N)); float th = float(i) * 2.39996 + turn;
      vec2 uv = vUv + fr * r0 * vec2(cos(th), sin(th)) * uTexel;
      float ri = min(abs(texture(uAux, uv).r - uFocus) * uCoc, RMAX);
      float w = clamp(ri - fr * r0 + 1.0, 0.0, 1.0);
      acc += texture(uScene, uv).rgb * w; n += w;
    }
  }
  o = vec4(acc / n, 1.0);
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
  o = vec4(min(c, vec3(40.0)) * smoothstep(3.0, 7.0, l), 1.0);
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

// The film, in the order a camera does it: glow round what burns out, falloff toward the corners, the tone curve
// that folds scene light into the display's range, a grade, the display's own encoding, grain.
export const filmFrag = (toneChunk) => /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uSharp; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uFrame; uniform float uBloomK;
${toneChunk}
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = texture(uSharp, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
  // lens: light falls off gently toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.42);
  c = AgXToneMapping(c);
  // grade, on display light: a touch more contrast and colour than the flat transform, cool shadows under warm lights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.25);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.6);
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

// A wheel of the going train: brass, gilt, its face turned on a lathe (fine circles), five spokes, a polished
// chamfer on every edge. uWheel: pitch radius, teeth, module (mm of pitch diameter per tooth), spokes.
export const wheelFrag = lib + /* glsl */`
uniform vec4 uWheel;
void main() {
  float px = PXMM; float r = length(vL); float th = atan(vL.y, vL.x);
  float R = uWheel.x; float m = uWheel.z; float Ra = R + 0.85 * m; float Rf = R - 1.15 * m;
  if (r > Ra + px || fieldAt(vP).r < -1.0) discard;   // outside it, or well under the bridge
  float pitch = 6.28318 / uWheel.y; float a = (fract(th / pitch) - 0.5) * pitch;
  float hw = 0.785 * m * (1.0 - 0.5 * (r - R) / m);   // half a tooth's thickness: full at the root, a rounded point at the tip
  float outer = min(r - Rf, max(abs(a) * r - hw, r - Ra));
  float Ri = Rf - 0.44; float Rh = 0.92;
  float sp = 6.28318 / uWheel.w; float b = (fract(th / sp) - 0.5) * sp;
  float w = mix(0.36, 0.21, clamp((r - Rh) / (Ri - Rh), 0.0, 1.0));
  float d = max(outer, min(min(r - Rh, Ri - r), abs(sin(b)) * r - w));   // the openings between the spokes are cut out
  float al = cov(d, px); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 tg = vec2(-vC.y, vC.x) / max(r, 1e-4);
  vec3 col = satin(GOLD, vec3(0.0, 0.0, 1.0), tg, scratch(r * 38.0), V);
  col = mix(GOLD * mirror(chamfer(d), V, 1.6), col, smoothstep(0.045 - px, 0.045 + px, -d));
  // the arbor: a steel pivot through the hub
  col = mix(col, STEEL * mirror(uTilt * normalize(vec3(vC * 1.6, 1.0)), V, 1.5), cov(r - 0.3, px));
  col *= SHADE(open(vP, uPart.x) * rounds(vP, uPart.x));
  put(col, al);
}
`;

// The escape wheel: steel, fifteen club-footed teeth leaning the way it turns, polished flat.
export const escapeFrag = lib + /* glsl */`
float tooth(vec2 p, float k) {
  float a = k * 0.418879; float c = cos(a); float s = sin(a); vec2 q = vec2(c * p.x + s * p.y, c * p.y - s * p.x);
  vec2 A = vec2(1.72, 0.0); vec2 B = vec2(2.68, -0.5); vec2 ab = B - A; float t = clamp(dot(q - A, ab) / dot(ab, ab), 0.0, 1.0);
  return length(q - A - ab * t) - mix(0.2, 0.085, t) - 0.085 * smoothstep(0.74, 1.0, t);   // a broad root, a narrow neck, the club at the end
}
void main() {
  float px = PXMM; float r = length(vL); if (r > 2.95) discard;
  float th = atan(vL.y, vL.x); float k = floor(th / 0.418879 + 0.5);
  float d = min(tooth(vL, k), min(tooth(vL, k + 1.0), tooth(vL, k - 1.0)));
  d = min(d, abs(r - 1.62) - 0.15);                                    // the rim
  float b = (fract(th / 1.5708) - 0.5) * 1.5708;
  d = min(d, max(abs(sin(b)) * r - 0.1, r - 1.66));                   // four spokes
  d = min(d, r - 0.46);                                               // the hub
  float al = cov(d, px); if (al < 0.004) discard;
  vec3 V = VIEW; vec3 N = uTilt * vec3(0.0, 0.0, 1.0);
  vec3 col = STEEL * (0.9 * mirror(N, V, 1.8) + 0.1 * envAt(N, 5.0));
  col = mix(STEEL * mirror(chamfer(d), V, 1.6), col, smoothstep(0.03 - px, 0.03 + px, -d));
  col = mix(col, GOLD * mirror(N, V, 2.0), cov(r - 0.2, px));        // its pivot's brass bush
  col *= SHADE(open(vP, uPart.x) * rounds(vP, uPart.x));
  put(col, al);
}
`;

// The pallet fork, in its own frame: x runs from its arbor toward the balance. A lever with two horns at the
// balance's end, two arms toward the escape wheel, a ruby pallet stone set in each.
export const forkFrag = lib + /* glsl */`
float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t) - r; }
float box(vec2 p, vec2 c, vec2 h, float turn) { float cs = cos(turn); float sn = sin(turn); vec2 q = p - c; q = abs(vec2(cs * q.x + sn * q.y, cs * q.y - sn * q.x)) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
void main() {
  float px = PXMM; vec2 p = vL;
  float d = seg(p, vec2(0.0), vec2(3.2, 0.0), 0.16);
  d = min(d, min(seg(p, vec2(3.2, 0.0), vec2(3.7, 0.3), 0.09), seg(p, vec2(3.2, 0.0), vec2(3.7, -0.3), 0.09)));
  d = min(d, min(seg(p, vec2(0.0), vec2(-0.72, 1.62), 0.2), seg(p, vec2(0.0), vec2(-0.72, -1.62), 0.2)));
  d = min(d, length(p) - 0.44);
  float stone = min(box(p, vec2(-1.12, 1.6), vec2(0.42, 0.13), 0.2), box(p, vec2(-1.12, -1.6), vec2(0.42, 0.13), -0.2));
  float al = cov(min(d, stone), px); if (al < 0.004) discard;
  vec3 V = VIEW; vec3 N = uTilt * vec3(0.0, 0.0, 1.0);
  vec3 col = STEEL * (0.9 * mirror(N, V, 1.8) + 0.1 * envAt(N, 5.0));
  col = mix(STEEL * mirror(chamfer(d), V, 1.6), col, smoothstep(0.03 - px, 0.03 + px, -d));
  vec3 ruby = vec3(0.62, 0.015, 0.06) * (0.5 * envAt(N, 5.0) + 0.5) + 0.08 * mirror(N, V, 1.0);
  col = mix(col, ruby, cov(stone, px));
  col *= SHADE(open(vP, uPart.x) * rounds(vP, uPart.x));
  put(col, al);
}
`;

// The balance: a rim, one arm across it, a hub, and screws round the rim to poise it. It never stops, so the
// shutter sees it over a sweep (uSwing: its angle as the shutter closes, and as it opened): the arm and the screws
// are smeared along their arcs, the rim is a circle wherever it stands and stays sharp.
export const balanceFrag = lib + /* glsl */`
uniform vec4 uSwing;
#ifdef LOW
const int SWEEP = 5;
#else
const int SWEEP = 9;
#endif
const float RIM = ${f(BALANCE.rim)}; const float IN = ${f(BALANCE.inner)}; const float ARM = ${f(BALANCE.arm)}; const float HEAD = ${f(BALANCE.head)}; const float HUB = ${f(BALANCE.hub)};
void main() {
  float px = PXMM; float r = length(vC); if (r > RIM + HEAD + px) discard;
  float pitch = 6.28318 / ${BALANCE.screws}.0;
  float arm = 0.0; float scr = 0.0; float lean = 0.0;
  for (int i = 0; i < SWEEP; i++) {
    float a = mix(uSwing.y, uSwing.x, (float(i) + 0.5) / float(SWEEP)); float c = cos(a); float s = sin(a);
    vec2 l = vec2(c * vC.x + s * vC.y, c * vC.y - s * vC.x);
    arm += cov(max(abs(l.y) - ARM * mix(1.25, 0.9, clamp(abs(l.x) / IN, 0.0, 1.0)), r - IN - 0.04), px);
    float b = (fract(atan(l.y, l.x) / pitch) - 0.5) * pitch * r;   // mm along the rim from the nearest screw's axis
    float k = cov(max(abs(b) - 0.25, max(r - RIM - HEAD, RIM - 0.03 - r)), px);
    scr += k; lean += k * b / 0.25;
  }
  arm /= float(SWEEP); lean /= max(scr, 1e-3); scr /= float(SWEEP);
  float rim = cov(max(r - RIM, IN - r), px); float hub = cov(r - HUB, px);
  float body = max(rim, max(arm, hub)); float al = max(body, scr); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 rad = vC / max(r, 1e-4); vec2 tg = vec2(-rad.y, rad.x);
  vec3 tint = vec3(0.96, 0.71, 0.36);   // the gold of a beryllium-bronze balance
  vec3 col = satin(tint, vec3(0.0, 0.0, 1.0), tg, scratch(r * 36.0), V);
  // the rim's two edges are chamfered and polished: two bright circles that do not turn
  float e = min(abs(r - RIM), abs(r - IN)); float side = abs(r - RIM) < abs(r - IN) ? 1.0 : -1.0;
  col = mix(col, tint * mirror(uTilt * normalize(vec3(rad * side, 1.0)), V, 1.6), rim * smoothstep(0.06 + px, 0.06 - px, e) * (1.0 - arm));
  // a screw's head is a little cylinder lying along the radius: one line of light down its length
  vec3 head = GOLD * mirror(uTilt * normalize(vec3(tg * clamp(lean, -1.0, 1.0) * 0.9, 1.0)), V, 1.8);
  col = mix(col, head, scr * (1.0 - rim));
  // the staff's pivot stands in the hub
  col = mix(col, STEEL * mirror(uTilt * normalize(vec3(vC * 2.2, 1.0)), V, 1.5), cov(r - 0.26, px));
  col *= SHADE(open(vP, uPart.x));
  put(col, al);
}
`;

// The hairspring: a blued strip coiled flat, pinned to the cock's stud at its outer end and to the staff at its
// inner one, so it winds tighter and opens again as the balance swings. Seen from above it is a hair-fine spiral.
export const springFrag = lib + /* glsl */`
uniform vec4 uSwing;
uniform float uStud;   // where round the staff the outer end is held, rad
#ifdef LOW
const int SWEEP = 5;
#else
const int SWEEP = 9;
#endif
const float IN = ${f(BALANCE.springIn)}; const float OUT = ${f(BALANCE.springOut)}; const float TURNS = ${f(BALANCE.turns)};
void main() {
  float px = PXMM; float r = length(vC); if (r > OUT + 0.3) discard;
  float th = atan(vC.y, vC.x); float u = (OUT - r) / (OUT - IN);
  float coil = 0.0;
  for (int i = 0; i < SWEEP; i++) {
    float turns = TURNS + mix(uSwing.y, uSwing.x, (float(i) + 0.5) / float(SWEEP)) / 6.28318;
    float ph = (th - uStud) / 6.28318 - u * turns;                          // a whole number where a coil passes
    coil += cov(abs(fract(ph + 0.5) - 0.5) * (OUT - IN) / turns - 0.02, px);
  }
  coil = coil / float(SWEEP) * step(0.0, u) * step(u, 1.0);
  float collet = cov(max(r - IN, 0.5 - r), px);                               // the brass ring it is pinned into
  float al = max(coil * 0.92, collet); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 tg = vec2(-vC.y, vC.x) / max(r, 1e-4);
  vec3 blue = vec3(0.2, 0.3, 0.78) * (grained(uTilt * vec3(0.0, 0.0, 1.0), uTilt * vec3(tg, 0.0), V, 0.6, 2.5) * 0.8 + 1.1 * envAt(uTilt * vec3(0.0, 0.0, 1.0), 5.5));
  vec3 col = mix(blue, GOLD * mirror(uTilt * vec3(0.0, 0.0, 1.0), V, 2.5), collet);
  col *= SHADE(open(vP, uPart.x));
  put(col, al);
}
`;

// The winding wheels on top of the bridge: steel, snailed on the face (spiral arms of fine scratches that wheel
// round as it turns), turned in plain circles round the middle, a polished chamfer, wolf's teeth that lean so the
// click can only let them pass one way. uWheel: pitch radius, teeth, module, 1 for the crown wheel.
export const windFrag = lib + /* glsl */`
uniform vec4 uWheel;
void main() {
  float px = PXMM; float r = length(vL); float R = uWheel.x; float m = uWheel.z; float Ra = R + 0.8 * m; float Rf = R - 1.0 * m;
  if (r > Ra + px) discard;
  float th = atan(vL.y, vL.x); float ph = fract(th * uWheel.y / 6.28318);
  // a wolf's tooth: a long back and a short steep face; the crown wheel's are plain and even
  float edge = uWheel.w > 0.5 ? mix(Rf, Ra, pow(0.5 + 0.5 * cos(6.28318 * ph), 0.7)) : mix(Ra, Rf, smoothstep(0.0, 0.8, ph) * (1.0 - smoothstep(0.92, 1.0, ph)));
  float d = r - edge; float al = cov(d * 0.8, px); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 rad = vC / max(r, 1e-4);
  float core = uWheel.w > 0.5 ? 0.5 * R : 0.3 * R;   // inside this the face is turned in circles, not snailed
  vec2 tg = vec2(-rad.y, rad.x); vec3 col;
  if (r > core) {
    // Snailing: the same tipped disc that stripes the bridges, drawn out from the middle while the wheel turns under
    // it, so its passes lie as spiral arms. Each arm is a shallow scallop, as a stripe is: light on one flank, dark
    // on the other, and the whole fan of them wheels round when the wheel does.
    float arms = uWheel.w > 0.5 ? 9.0 : 14.0; float wind_ = 0.62;                      // how many arms; how fast they wind outward (per mm)
    float v = th * arms / 6.28318 + r * wind_; float across = fract(v) - 0.5;
    vec2 over = normalize(tg * arms / (6.28318 * r) + rad * wind_);                    // across an arm, in the movement
    float lean = across * 1.1; vec2 along = vec2(-over.y, over.x);
    vec2 t = cos(lean) * over + sin(lean) * along;                                     // the scratches cross the arm, turning as they go
    col = satin(STEEL * 1.12, normalize(vec3(over * across * -0.2, 1.0)), t, scratch((dot(vL, vec2(0.7, 0.7)) + across * 3.0) * 11.0 + floor(v) * 17.0), V);
  } else col = satin(STEEL * 1.12, vec3(0.0, 0.0, 1.0), tg, scratch(r * 40.0), V);
  // a fine polished groove where the two finishes meet, and the chamfer at the foot of the teeth
  float groove = abs(r - core); vec3 N = uTilt * normalize(vec3(rad * sign(r - core) * 0.8, 1.0));
  col = mix(col, STEEL * mirror(N, V, 1.5), smoothstep(0.07 + px, 0.07 - px, groove));
  float foot = abs(r - (Rf - 0.16));
  col = mix(col, STEEL * mirror(uTilt * normalize(vec3(rad, 1.0)), V, 1.5), smoothstep(0.09 + px, 0.09 - px, foot));
  col = mix(col, STEEL * mirror(uTilt * normalize(vec3(rad * 0.7, 1.0)), V, 2.0) * 0.9, step(Rf - 0.07, r));   // the teeth themselves
  put(col, al);
}
`;

// The click: the steel pawl that lets the ratchet turn one way only. In its own frame its pivot is the origin and
// its beak points along x at the ratchet's teeth.
export const clickFrag = lib + /* glsl */`
float seg(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t) - mix(ra, rb, t); }
void main() {
  float px = PXMM; vec2 p = vL;
  float d = min(length(p) - 0.78, seg(p, vec2(0.0), vec2(1.52, 0.1), 0.6, 0.05));
  d = min(d, seg(p, vec2(0.0), vec2(-1.15, 0.95), 0.5, 0.26));
  float al = cov(d, px); if (al < 0.004) discard;
  vec3 V = VIEW;
  vec3 col = satin(STEEL * 1.1, vec3(0.0, 0.0, 1.0), normalize(vec2(1.0, 0.25)), scratch(dot(p, vec2(-0.25, 1.0)) * 34.0), V);
  col = mix(STEEL * mirror(chamfer(d), V, 1.5), col, smoothstep(0.07 - px, 0.07 + px, -d));
  put(col, al);
}
`;

// Screws and jewels: many small round things, one quad each. iPos: x, y, z, radius (mm). iLook: kind, turn (rad).
export const spriteVert = head + /* glsl */`
in vec3 position; in vec4 iPos; in vec4 iLook;
out vec2 vP; out vec2 vC; out vec2 vL; out vec3 vW; out vec4 vLook; out float vR;
void main() {
  vec2 l = position.xy * iPos.w * 2.2; vec2 p = iPos.xy + l;
  float c = cos(iLook.y); float s = sin(iLook.y);
  vP = p; vC = l; vL = vec2(c * l.x + s * l.y, c * l.y - s * l.x); vLook = iLook; vR = iPos.w;
  vW = uTilt * (vec3(p, iPos.z) - uPivot);
  gl_Position = vec4(vW.xy * uPpm * 2.0 / uRes, 0.0, (uCamD - vW.z) / uCamD);
}
`;
// A screw: a polished head, very slightly domed, with one slot; kind 0 is blued (heated until the steel's oxide
// film is the blue of a cornflower), kind 1 left white. It sits in a sink, so a dark ring shows round it.
export const screwFrag = lib + /* glsl */`
in vec4 vLook; in float vR;
void main() {
  float px = PXMM; float R = vR; float r = length(vL);
  float al = cov(r - 1.14 * R, px); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 rad = vL / max(r, 1e-4); vec2 radw = vC / max(r, 1e-4);
  float dome = 0.1 + 0.9 * smoothstep(0.82, 1.0, r / R);                 // nearly flat, then the rounded edge
  vec3 N = uTilt * normalize(vec3(radw * dome * 0.75, 1.0));
  vec3 lamp = mirror(N, V, 1.2) + 0.03 * envAt(N, 5.0);
  vec3 col = vLook.x < 0.5 ? mix(vec3(0.04, 0.075, 0.34), vec3(0.3, 0.33, 0.7), pow(1.0 - N.z * 0.98, 2.0)) * lamp * 1.2 : STEEL * 1.08 * lamp;
  // the slot: dark inside, with a line of light along the wall that faces the lamps
  float slot = abs(vL.y) - 0.15 * R; float inSlot = cov(slot, px);
  float c = cos(vLook.y); float s = sin(vLook.y); vec2 wall = vec2(-s, c) * sign(vL.y);   // the wall's normal, in the movement
  vec3 wallc = (vLook.x < 0.5 ? vec3(0.1, 0.15, 0.45) : STEEL) * mirror(uTilt * normalize(vec3(-wall, 0.9)), V, 2.0) * 0.55;
  col = mix(col, mix(vec3(0.012), wallc, smoothstep(-0.09 * R, 0.0, slot)), inSlot);
  // the sink round the head
  col = mix(col, vec3(0.01), smoothstep(R - px, R + px, r));
  put(col, al);
}
`;
// A jewel: a ruby bearing with its oil sink, pressed into the plate (kind 0, a polished sink round it) or set in a
// gold chaton (kind 1). Rubies are lit from inside: light goes in, comes back off the metal under the stone.
export const jewelFrag = lib + /* glsl */`
in vec4 vLook; in float vR;
void main() {
  float px = PXMM; float R = vR; float r = length(vL); float out_ = vLook.x > 0.5 ? 1.85 * R : 1.32 * R;
  float al = cov(r - out_, px); if (al < 0.004) discard;
  vec3 V = VIEW; vec2 rad = vC / max(r, 1e-4); float q = r / R;
  // the stone: a flat top rounded at its edge, and a dished sink round the pivot hole
  float slope = 0.9 * smoothstep(0.78, 1.0, q) - 1.1 * smoothstep(0.5, 0.2, q) * smoothstep(0.1, 0.2, q);
  vec3 N = uTilt * normalize(vec3(rad * slope, 1.0));
  // light that went in comes back off the seat under the stone, strongest on the side away from the lamps
  float glow = 0.5 + 0.5 * dot(rad, -uKey.xy) * smoothstep(0.2, 1.0, q);
  vec3 inside = vec3(0.56, 0.006, 0.045) * envAt(uTilt * vec3(0.0, 0.0, 1.0), 5.5) * (0.25 + 1.5 * glow * glow) * mix(0.4, 1.0, smoothstep(0.12, 0.6, q));
  vec3 col = inside + 0.14 * mirror(N, V, 0.6);
  col = mix(col, STEEL * mirror(uTilt * vec3(0.0, 0.0, 1.0), V, 2.0) * 0.8, cov(r - 0.16 * R, px));   // the pivot's end in its hole
  // round the stone: a gold chaton, rounded like a ring, or the plate's polished sink
  float t = (r - R) / (out_ - R);
  vec3 ring = vLook.x > 0.5 ? GOLD * mirror(uTilt * normalize(vec3(rad * (t * 2.0 - 1.0) * 0.9, 1.0)), V, 1.4) : RHODIUM * mirror(uTilt * normalize(vec3(-rad * 0.8, 1.0)), V, 1.6);
  col = mix(col, ring, smoothstep(R - px, R + px, r));
  col = mix(col, vec3(0.012), smoothstep(px * 1.5, 0.0, abs(r - R)) * 0.8 + smoothstep(px * 1.5, 0.0, abs(r - out_ + px)) * 0.5);   // the seams
  put(col, al);
}
`;
