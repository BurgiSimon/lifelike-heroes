// GLSL for the scene. Everything is lit in linear light into a half-float target; `film` is the lens and the film.
// The wall is laid out in CSS pixels with y down, the same space index.js lays the page out in; z points out of
// the wall at the lens. uPpm is how many of those px make a metre, for everything that has a size of its own.
//
// How the light gets to the wall: a shadow on the wall is its object moved along the sun's rays, so everything
// that stands in the light is drawn where its shadow falls (room.js calls this shadow space). The frame, pass by pass:
//   tree     the lime tree's leaves and wood, as how much of the light they cover (nearer boughs in red, farther in green)
//   curtain  the sheer, as how much cloth the light has to cross
//   light    the light map: what is left of the sun at each point of the wall plane, each thing blurred by the sun's
//            own width at its distance, and how much sky the window shows that point
//   spectra  what the crystals throw
//   scene    the photograph: plaster, skirting and boards, lit by the light map
import { SUN, KX, KY, BOUGHS, CRYSTALS } from './room.js';

export const BARS = 8;   // glazing bars the light map takes

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
// highp int as well as float: three adds no precision to a raw shader, and a mediump uint hash is 16 bits on many
// phone GPUs (Mali; Adreno under Mesa), where it returns 0.
const head = /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
uniform vec2 uRes;    // hero box, CSS px
uniform float uPpm;   // CSS px per metre
uniform float uTime;  // the scene's own clock, s
const vec3 SUN = vec3(${SUN.map(f).join(', ')});   // toward the sun
const vec2 SLIP = vec2(${f(KX)}, ${f(KY)});        // how far a shadow lies from its object, per unit of depth between them
// A rect of the wall (x, y, 1/w, 1/h) to the clip space and the texture coordinates of a target that covers it.
vec4 toClip(vec2 p, vec4 box) { vec2 q = (p - box.xy) * box.zw; return vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); }
vec2 toUv(vec2 p, vec4 box) { vec2 q = (p - box.xy) * box.zw; return vec2(q.x, 1.0 - q.y); }
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
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

export const fullscreenVert = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---- the lime tree. A leaf or a length of wood is one quad; where it is now is its place at rest, its bough's
// swing (room.js), what the pointer's breeze has done to the air there, and its own small restlessness.
const sway = /* glsl */`
uniform vec2 uBough[${BOUGHS}];   // each bough's tip: how far it has swung, m
uniform sampler2D uField;         // the pointer's breeze over the frame: push x, y (m), stir
uniform vec2 uTree;               // the top right corner of the glass, px: the tree is grown from there
uniform vec4 uTreeBox;
uniform float uBreeze;
// p: m from that corner. b: its bough. t: how far along the bough. tw: how far along its twig. s: its own number.
vec2 swayAt(vec2 p, float b, float t, float tw, float s, out float stir) {
  vec4 air = texture(uField, (uTree + p * uPpm) / uRes);
  stir = uBreeze + air.z;
  vec2 d = uBough[int(b + 0.5)] * pow(t, 1.4) + air.xy * (0.35 + 0.65 * tw);
  return d + vec2(sin(uTime * (2.1 + 1.7 * s) + s * 31.0), cos(uTime * (1.7 + 1.3 * s) + s * 17.0)) * 0.012 * tw * stir;
}
`;
export const leafVert = head + sway + /* glsl */`
in vec3 position;
in vec4 aLeaf;   // x, y (m), the way it points, its length (m)
in vec4 aSway;   // bough, along the bough, along the twig, its own number
in vec2 aKind;   // how squarely it faces the sun (0..1), and 1 for the farther boughs
uniform vec4 uClear;    // l, t, r, b px: where the lettering's shadow falls. The photographer kept that glass clear of leaves.
uniform float uLeaves;  // how much of the tree is still in leaf, 0..1
out vec2 vQ; out float vFar;
void main() {
  float s = aSway.w; float stir;
  vec2 at = aLeaf.xy + swayAt(aLeaf.xy, aSway.x, aSway.y, aSway.z, s, stir);
  vec2 rest = uTree + aLeaf.xy * uPpm;
  vec2 out2 = max(uClear.xy - rest, rest - uClear.zw);
  float keep = smoothstep(-0.03 * uPpm, 0.12 * uPpm, max(out2.x, out2.y)) * step(fract(s * 7.31), uLeaves);
  // a leaf rocks on its stalk and turns its face to and from the sun: that is the flicker in a tree's shade
  float ang = aLeaf.z + stir * 0.55 * sin(uTime * (5.0 + 5.0 * s) + s * 50.0);
  float face = clamp(aKind.x + stir * 0.4 * sin(uTime * (6.3 + 4.0 * s) + s * 90.0), 0.18, 1.0);
  vec2 d = vec2(cos(ang), sin(ang)); float len = aLeaf.w * keep;
  vec2 m = at + d * (position.x * 0.5 + 0.5) * len + vec2(-d.y, d.x) * position.y * len * 0.44 * face;
  vQ = position.xy; vFar = aKind.y;
  gl_Position = toClip(uTree + m * uPpm, uTreeBox);
}
`;
export const leafFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vQ; in float vFar; out vec4 o;
void main() {
  float s = vQ.x * 0.5 + 0.5;
  float w = 1.75 * pow(max(s, 1e-4), 0.45) * pow(max(1.0 - s, 0.0), 0.75);   // a lime leaf: broad by the stalk, drawn out to a point
  float a = smoothstep(0.0, fwidth(vQ.y) * 1.5 + 0.02, w - abs(vQ.y)) * 0.94;
  o = vec4(a * (1.0 - vFar), a * vFar, 0.0, a);
}
`;
export const woodVert = head + sway + /* glsl */`
in vec3 position;
in vec4 aA;   // one end: x, y (m), along the bough, along the twig
in vec4 aB;   // the other
in vec4 aR;   // radius (m), far, bough, its own number
out vec2 vQ; out float vFar;
void main() {
  float stir;
  vec2 a = aA.xy + swayAt(aA.xy, aR.z, aA.z, aA.w, aR.w, stir);
  vec2 b = aB.xy + swayAt(aB.xy, aR.z, aB.z, aB.w, aR.w, stir);
  vec2 d = normalize(b - a + 1e-6);
  vec2 m = mix(a, b, position.x * 0.5 + 0.5) + d * position.x * aR.x + vec2(-d.y, d.x) * position.y * aR.x;
  vQ = position.xy; vFar = aR.y;
  gl_Position = toClip(uTree + m * uPpm, uTreeBox);
}
`;
export const woodFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vQ; in float vFar; out vec4 o;
void main() { float a = smoothstep(1.0, 1.0 - fwidth(vQ.y) * 1.5 - 0.05, abs(vQ.y)); o = vec4(a * (1.0 - vFar), a * vFar, 0.0, a); }
`;

// ---- the curtain, seen along the light. What matters to the light is how much cloth it has to cross: one layer
// met squarely is thin, a layer met aslant is thicker by one over the cosine, and where a fold turns edge-on to the
// sun it is a dark line. Where folds lie over each other in this view they are simply drawn over each other, and add up.
export const TAU = 0.46;   // how much one layer of the sheer takes from light that meets it squarely (as optical depth)
export const clothVert = head + /* glsl */`
in vec3 position;   // m from the left end of the rod; z is out into the room
in vec3 normal;     // which way the cloth faces there
in vec2 uv;         // m on the cloth laid flat
uniform vec4 uCurt;     // the rod's left end, px; and px per metre of cloth, across and down
uniform vec4 uCurtBox;
out vec2 vFlat; out vec3 vFace;
void main() {
  // a point that has swung out into the room is nearer the wall, so its shadow has less far to slip
  vFlat = uv; vFace = normal;
  gl_Position = toClip(uCurt.xy + position.xy * uCurt.zw - SLIP * position.z * uPpm, uCurtBox);
}
`;
export const clothFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vFlat; in vec3 vFace; out vec4 o;
uniform vec2 uCloth;   // the cloth laid flat: width, height (m)
const vec3 RAY = vec3(${f(-SUN[0])}, ${f(-SUN[1])}, ${f(SUN[2])});   // the way the light travels, in the cloth's own axes (z into the room)
void main() {
  // a sheer's weave lets light through even edge-on: never more than three layers' worth
  float layers = 1.0 / max(abs(dot(normalize(vFace), RAY)), 0.3);
  // the hems are the cloth turned over twice and sewn
  float hem = max(step(uCloth.y - 0.028, vFlat.y), max(step(vFlat.x, 0.012), step(uCloth.x - 0.012, vFlat.x)));
  o = vec4(${f(TAU)} * layers * (1.0 + 1.7 * hem) * 0.25, 0.0, 0.0, 1.0);   // a quarter of it, so that four layers still fit in eight bits
}
`;

// ---- the light map. For each point of the wall plane: how much of the sun's disc can be seen from there past
// everything in the way. An edge is not blurred here by a filter: it is as soft as the sun is wide, seen from the
// wall, at that thing's distance (uPen: things at the window; uPenTree: the tree's nearer and farther boughs).
const disc = (name, n, ch) => /* glsl */`
float ${name}(sampler2D t, vec2 uv, vec2 r, float lod) {
  float s = 0.0;
  for (int i = 0; i < ${n}; i++) { float k = (float(i) + 0.5) / ${n}.0; float a = float(i) * 2.39996323; s += textureLod(t, uv + r * sqrt(k) * vec2(cos(a), sin(a)), lod).${ch}; }
  return s / ${n}.0;
}`;
export const lightFrag = (low) => head + noise + disc('lettersIn', low ? 8 : 14, 'r') + disc('clothIn', low ? 5 : 8, 'r') + disc('nearIn', low ? 8 : 14, 'r') + disc('farIn', low ? 10 : 18, 'g') + /* glsl */`
uniform vec4 uMapBox;
uniform vec4 uOpen;               // the glass: l, t, r, b px
uniform vec4 uBars[${BARS}]; uniform int uBarN;   // glazing bars, the same way
uniform float uPen;               // px: the width of a shadow's edge for things at the window
uniform vec2 uPenTree;            // and for the tree's nearer and farther boughs
uniform sampler2D uLetters; uniform float uText;
uniform sampler2D uCurtain; uniform vec4 uCurtBox; uniform float uCurtPx;
uniform sampler2D uTreeTex; uniform vec4 uTreeBox; uniform float uTreePx;   // px of wall per texel
uniform vec4 uCrys[${CRYSTALS}];  // each crystal's shadow: x, y px, how much it is there, the x its thread hangs from
uniform float uDz;                // px from the wall to the window
in vec2 vUv; out vec4 o;

// The share of the sun's disc (radius r) seen past a straight edge, d beyond it.
float past(float d, float r) { float t = clamp(d / r, -1.0, 1.0); return 0.5 + (t * sqrt(1.0 - t * t) + asin(t)) * 0.31830989; }
// How much of everything in front of a wall point the window takes up, for a window parallel to it (the corner
// form of the view factor of a rectangle): a, b are a corner's offsets, c the distance between the planes.
float corner(float a, float b, float c) { float A = sqrt(a * a + c * c); float B = sqrt(b * b + c * c); return (a / A * atan(b / A) + b / B * atan(a / B)) * 0.15915494; }

void main() {
  vec2 q = uMapBox.xy + vec2(vUv.x, 1.0 - vUv.y) / uMapBox.zw;
  float r = uPen * 0.5;
  float sun = past(q.x - uOpen.x, r) * past(uOpen.z - q.x, r) * past(q.y - uOpen.y, r) * past(uOpen.w - q.y, r);
  for (int i = 0; i < ${BARS}; i++) {
    if (i >= uBarN) break;
    vec4 b = uBars[i];
    sun *= 1.0 - (past(q.x - b.x, r) - past(q.x - b.z, r)) * (past(q.y - b.y, r) - past(q.y - b.w, r));
  }
  // old glass is never flat: it gathers the light a little here and spreads it a little there
  float wave = fbm(q / uPpm * vec2(7.0, 2.6) + 3.0) + 0.5 * vnoise(q / uPpm * vec2(21.0, 5.0));
  sun *= 1.0 + 0.11 * (wave - 0.74);
  // the lettering on the glass
  sun *= 1.0 - uText * lettersIn(uLetters, vec2(q.x, uRes.y - q.y) / uRes, r / uRes, log2(max(1.0, r * 0.47)));
  // the curtain: light that crosses more cloth comes through weaker, and a little warmer
  float cloth = 4.0 * clothIn(uCurtain, toUv(q, uCurtBox), r * uCurtBox.zw * vec2(1.0, -1.0), log2(max(1.0, r / uCurtPx * 0.6)));
  vec3 lightCol = exp(-cloth * vec3(0.94, 1.0, 1.1));
  // the tree. A leaf lets a little light through, yellow now that it is October
  vec2 tu = toUv(q, uTreeBox); vec2 tr = uTreeBox.zw * vec2(0.5, -0.5);
  float nearCov = nearIn(uTreeTex, tu, uPenTree.x * tr, log2(max(1.0, uPenTree.x * 0.5 / uTreePx * 0.47)));
  float farCov = farIn(uTreeTex, tu, uPenTree.y * tr, log2(max(1.0, uPenTree.y * 0.5 / uTreePx * 0.42)));
  const vec3 LEAF = vec3(0.07, 0.075, 0.03);
  lightCol *= mix(vec3(1.0), LEAF, min(nearCov, 1.0)) * mix(vec3(1.0), LEAF, min(farCov, 1.0));
  // the crystals: glass that sends its light elsewhere throws a shadow like anything else, and so does its thread
  float rc = 0.019 * uPpm;
  for (int i = 0; i < ${CRYSTALS}; i++) {
    vec4 c = uCrys[i]; if (c.z < 0.01) continue;
    vec2 d = q - c.xy;
    sun *= 1.0 - 0.86 * c.z * (1.0 - smoothstep(max(rc - r, 0.0), rc + r, length(d * vec2(1.0, 0.62))));
    float along = clamp((q.y - uOpen.y) / max(c.y - uOpen.y, 1.0), 0.0, 1.0);
    float off = abs(q.x - mix(c.w, c.x, along)) / r;
    sun *= 1.0 - 0.14 * c.z * sqrt(max(1.0 - off * off, 0.0)) * step(uOpen.y, q.y) * step(q.y, c.y);
  }
  // and the sky that the window shows this point: the window is up and to the left of its patch of sun, uDz away
  vec2 w0 = uOpen.xy - SLIP * uDz - q; vec2 w1 = uOpen.zw - SLIP * uDz - q;
  float sky = corner(w1.x, w1.y, uDz) - corner(w0.x, w1.y, uDz) - corner(w1.x, w0.y, uDz) + corner(w0.x, w0.y, uDz);
  o = vec4(sun * lightCol, sky);
}
`;

// ---- the spectra. Each is the sun's own image (a disc), once for every colour, laid side by side from the red
// end to the violet: so its colours run into each other by exactly the sun's width, and it is round at both ends.
export const beamVert = head + /* glsl */`
in vec3 position;
in vec4 aEnds;   // where the red end comes down, and the violet end, px
in vec4 aBeam;   // half its width px, its light as a share of the sun's
out vec2 vQ; out vec2 vK;
void main() {
  vec2 d = aEnds.zw - aEnds.xy; float len = length(d); d /= max(len, 1e-3);
  float hw = max(aBeam.x, 0.5); float reach = hw * 1.5;
  vec2 p = mix(aEnds.xy, aEnds.zw, position.x * 0.5 + 0.5) + d * position.x * reach + vec2(-d.y, d.x) * position.y * reach;
  vQ = vec2((position.x * 0.5 + 0.5) * len + position.x * reach, position.y * reach) / hw;   // in half-widths, from the red end
  vK = vec2(len / hw, aBeam.y);
  gl_Position = toClip(p, vec4(0.0, 0.0, 1.0 / uRes));
}
`;
const TAPS = 14;
export const beamFrag = /* glsl */`precision highp float; precision highp int;
in vec2 vQ; in vec2 vK; out vec4 o;
// The eye's three responses to a wavelength (nm), as Wyman, Sloan and Shirley fitted them, in linear sRGB.
vec3 hue(float l) {
  float a = (l - 442.0) * (l < 442.0 ? 0.0624 : 0.0374); float b = (l - 599.8) * (l < 599.8 ? 0.0264 : 0.0323); float c = (l - 501.1) * (l < 501.1 ? 0.0490 : 0.0382);
  float x = 0.362 * exp(-0.5 * a * a) + 1.056 * exp(-0.5 * b * b) - 0.065 * exp(-0.5 * c * c);
  a = (l - 568.8) * (l < 568.8 ? 0.0213 : 0.0247); b = (l - 530.9) * (l < 530.9 ? 0.0613 : 0.0322);
  float y = 0.821 * exp(-0.5 * a * a) + 0.286 * exp(-0.5 * b * b);
  a = (l - 437.0) * (l < 437.0 ? 0.0845 : 0.0278); b = (l - 459.0) * (l < 459.0 ? 0.0385 : 0.0725);
  float z = 1.217 * exp(-0.5 * a * a) + 0.681 * exp(-0.5 * b * b);
  return vec3(3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.2040 * y + 1.0570 * z);
}
void main() {
  float L = vK.x; vec3 sum = vec3(0.0); float soft = max(0.16, L / ${TAPS}.0 * 0.7);
  for (int i = 0; i < ${TAPS}; i++) {
    float t = (float(i) + 0.5) / ${TAPS}.0;
    // glass bends light by its index, and its index goes with one over the wavelength squared (Cauchy): so the
    // blue end of a spectrum is drawn out longer than the red
    float l = inversesqrt(mix(1.0 / (700.0 * 700.0), 1.0 / (400.0 * 400.0), t));
    sum += hue(l) * (1.0 - smoothstep(1.0 - soft, 1.0 + soft, length(vec2(vQ.x - L * t, vQ.y))));
  }
  // so that the whole patch carries the light room.js worked out for it, and all its colours together make the sun's own
  sum = max(sum, 0.0) * (1.0 / ${TAPS}.0) * vec3(1.19, 0.86, 1.02) * (2.0 * (L + 2.0) / 3.14159265);
  o = vec4(sum * vK.y, 1.0);
}
`;

// ---- the photograph. One sun and one sky: every surface is lit by the light map and by nothing else.
export const sceneFrag = head + noise + /* glsl */`
uniform vec3 uCam;         // the lens: x, y on the wall plane's axes, and how far out from the wall, px
uniform float uFloorY;     // the line where the wall meets the floor, px
uniform vec2 uSkirt;       // the skirting board: height, depth px
uniform sampler2D uLight; uniform vec4 uMapBox; uniform sampler2D uSpec;
uniform sampler2D uWallD; uniform sampler2D uWallN; uniform sampler2D uFloorD; uniform sampler2D uFloorR;
uniform sampler2D uCloud;   // slow noise, made once (render.js): limewash clouds, brush streaks, and how the wall leans (x, y)
uniform float uPx;          // device px per CSS px
in vec2 vUv; out vec4 o;

const vec3 SUNCOL = vec3(4.6, 3.55, 2.4);     // the low sun, through glass: scene light is not clamped, and a sunlit wall is several times paper white
const vec3 SKYCOL = vec3(2.3, 2.75, 3.6);     // the sky and the street, per share of a point's outlook that the window fills
const vec3 ROOM = vec3(0.33, 0.30, 0.26);    // what the rest of the room hands back: the sun's patch, bounced off everything once
const vec3 LIME = vec3(0.80, 0.775, 0.715);   // the limewash
const vec3 PAINT = vec3(0.66, 0.65, 0.615);  // the skirting: an eggshell white gone a little grey

vec4 lightAt(vec3 P, float lod) { return textureLod(uLight, toUv(P.xy + SLIP * P.z, uMapBox), lod); }

// Plaster at m (metres along the wall, and down it). The scan is two metres square and the wall is wider, so it is
// laid twice, the second time turned and shifted, and a slow noise chooses between them: no stain comes round again.
// The scans are read with their slopes given outright (the wall is square to the lens, so they are the same
// everywhere): a lookup inside a branch has none of its own, and would sparkle along the skirting.
vec3 plaster(vec2 m, out vec3 n) {
  vec2 u1 = m * 0.5; vec2 u2 = vec2(-m.y, m.x) * 0.43 + vec2(0.37, 0.61);
  vec2 gx = vec2(0.5 / (uPpm * uPx), 0.0); vec2 gy = gx.yx;
  vec4 slow = textureLod(uCloud, m * 0.25, 0.0);
  float w = smoothstep(0.42, 0.58, textureLod(uCloud, m * 0.41 + 0.3, 0.0).r);
  // Only the scan's fine grain is kept (its pits, its hairline cracks): each sample is divided by its own
  // surroundings, which takes out the weather stains of the outside wall it was scanned from.
  vec3 a = mix(textureGrad(uWallD, u1, gx, gy).rgb / textureLod(uWallD, u1, 6.0).rgb, textureGrad(uWallD, u2, gx, gy).rgb / textureLod(uWallD, u2, 6.0).rgb, w);
  vec3 n1 = textureGrad(uWallN, u1, gx, gy).xyz * 2.0 - 1.0; vec3 n2 = textureGrad(uWallN, u2, gx, gy).xyz * 2.0 - 1.0;
  n = mix(n1, vec3(n2.y, -n2.x, n2.z), w);
  // a wall plastered by hand is not a plane, and limewash goes on in clouds, brushed this way and that
  n.xy = n.xy * 1.5 + 0.05 * (slow.ba - 0.5);
  n = normalize(n);
  return LIME * mix(vec3(1.0), max(a, 0.9), 0.85) * (0.935 + 0.1 * slow.r + 0.05 * (slow.g - 0.5));   // its grain, not its deepest scars: those would be known again two metres on
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float top = uFloorY - uSkirt.x;
  // What the lens sees along this pixel's line of sight: the floor, the skirting's face, its top edge, or the wall.
  float ts = 1.0 - uSkirt.y / uCam.z; vec2 ps = uCam.xy + ts * (p - uCam.xy);
  vec3 P; vec3 col; vec3 spectra = texture(uSpec, vUv).rgb * SUNCOL;
  if (ps.y > uFloorY) {
    // ---- the floor: old boards running out from the wall
    float tf = (uFloorY - uCam.y) / (p.y - uCam.y);
    P = vec3(uCam.x + tf * (p.x - uCam.x), uFloorY, uCam.z * (1.0 - tf));
    vec2 m = vec2(P.x, P.z) / uPpm; vec2 uv = m / 1.2;
    // the boards run away from the lens, so the scan's slopes are worked out from the line of sight
    float dtf = -tf / (p.y - uCam.y); float k = 1.0 / (1.2 * uPpm * uPx);
    vec2 gx = vec2(tf, 0.0) * k; vec2 gy = vec2((p.x - uCam.x) * dtf, -uCam.z * dtf) * k;
    vec3 alb = textureGrad(uFloorD, uv, gx, gy).rgb; float rough = textureGrad(uFloorR, uv, gx, gy).r;
    alb = mix(vec3(dot(alb, vec3(0.3, 0.6, 0.1))), alb, 0.7) * 0.8;
    vec4 L = lightAt(P, 0.0);
    float nook = 1.0 - 0.5 * exp(-P.z / (0.03 * uPpm));   // little sky reaches the corner under the skirting
    // the sunlit wall above hands some of its light down to the boards in front of it
    vec3 glow = LIME * SUNCOL * SUN.z * lightAt(vec3(P.x, uFloorY - 0.3 * uPpm, 0.0), 4.0).rgb * 0.16 * exp(-P.z / (0.6 * uPpm));
    col = alb * (SUNCOL * L.rgb * -SUN.y + (SKYCOL * L.a * 0.8 + ROOM) * nook + glow + spectra);
    // and the wax on them mirrors the foot of the wall, more the lower the eye looks along them
    vec3 V = normalize(P - uCam); float t = P.z / max(-V.z, 1e-3); vec2 up = vec2(P.x + V.x * t, P.y - V.y * t);
    vec4 M = textureLod(uLight, toUv(up, uMapBox), clamp(1.0 + t / (0.05 * uPpm), 1.0, 5.0));
    vec3 foot = mix(LIME, PAINT, step(top, up.y)) * (SUNCOL * M.rgb * SUN.z + SKYCOL * M.a + ROOM);
    float fres = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
    col += foot * fres * clamp(1.75 - 1.5 * rough, 0.1, 1.0) * nook;
  } else if (ps.y >= top) {
    // ---- the skirting's face: painted wood, a little glossy, with a bead run along it a thumb's width from the top
    P = vec3(ps, uSkirt.y);
    vec2 m = P.xy / uPpm; float down = (P.y - top) / uPpm;   // m below its top edge
    float bead = (down - 0.03) / 0.0035;   // the groove above the bead: its upper side faces the floor, its lower side the sky
    vec3 N = normalize(vec3(0.02 * (vnoise(m * vec2(9.0, 70.0)) - 0.5), 1.1 * bead * exp(-bead * bead), 1.0));
    vec4 L = lightAt(P, 0.0);
    float nook = (1.0 - 0.4 * exp(-(uFloorY - P.y) / (0.018 * uPpm))) * (1.0 - 0.3 * exp(-bead * bead));
    vec3 alb = PAINT * (0.97 + 0.06 * vnoise(m * vec2(5.0, 90.0)));   // the brush went along it
    alb *= 1.0 - 0.1 * smoothstep(0.035, 0.0, (uFloorY - P.y) / uPpm) * vnoise(m * vec2(30.0, 8.0));   // and the mop has been along its foot
    col = alb * (SUNCOL * L.rgb * max(dot(N, SUN), 0.0) + (SKYCOL * L.a * 0.8 + ROOM) * nook + spectra);
    vec3 H = normalize(SUN + normalize(uCam - P));
    col += SUNCOL * L.rgb * 0.3 * pow(max(dot(N, H), 0.0), 70.0);
  } else {
    float tt = (top - uCam.y) / (p.y - uCam.y); float zt = uCam.z * (1.0 - tt);
    if (p.y > uCam.y && zt >= 0.0 && zt <= uSkirt.y) {
      // ---- the skirting's top, seen from above: rounded over from the wall to its face, so the light slides round it
      P = vec3(uCam.x + tt * (p.x - uCam.x), top, zt);
      float a = 1.5708 * zt / uSkirt.y; vec3 N = vec3(0.0, -cos(a), sin(a));
      vec4 L = lightAt(P, 0.0);
      float back = 1.0 - 0.5 * exp(-zt / (0.004 * uPpm));   // dust, and the shade of the wall behind it
      col = PAINT * (SUNCOL * L.rgb * max(dot(N, SUN), 0.0) + (SKYCOL * L.a * (0.8 + 0.5 * cos(a)) + ROOM) * back + spectra);
      vec3 H = normalize(SUN + normalize(uCam - P));
      col += SUNCOL * L.rgb * 0.3 * pow(max(dot(N, H), 0.0), 70.0);
    } else {
      // ---- the wall
      P = vec3(p, 0.0);
      vec3 N; vec3 alb = plaster(p / uPpm, N);
      vec4 L = lightAt(P, 0.0);
      float h = (top - p.y) / uPpm;   // m above the skirting
      float nook = 1.0 - 0.22 * exp(-max(h, 0.0) / 0.05);
      alb *= 1.0 - 0.07 * exp(-max(h, 0.0) / 0.22) * textureLod(uCloud, p / uPpm * vec2(1.3, 0.6), 0.0).g;   // the foot of a wall is where it is scuffed
      // the window is up and to one side, back along the light, and its sky meets the plaster a little aslant from there
      float skyTilt = 1.0 - 0.75 * dot(N.xy, SLIP);
      // where the sun lies on the boards in front of the wall, they hand some of it up to the wall's foot, warm as oak
      vec3 lift = vec3(0.30, 0.17, 0.07) * SUNCOL * -SUN.y * lightAt(vec3(p.x, uFloorY, 0.35 * uPpm), 3.0).rgb * 0.5 * exp(-max(h, 0.0) / 0.45);
      // a room is a little brighter low down, where the floor hands the window's light back, than up under the ceiling
      vec3 room = ROOM * (0.9 + 0.2 * p.y / uRes.y);
      col = alb * (SUNCOL * L.rgb * max(dot(N, SUN), 0.0) + (SKYCOL * L.a * skyTilt + room + lift) * nook + spectra);
    }
  }
  o = vec4(col, 1.0);
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
  o = vec4(min(c, vec3(40.0)) * smoothstep(2.3, 4.6, l), 1.0);
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

// The lens and the film, in the order a camera does them: glow round what burns out, falloff toward the corners,
// the tone curve that folds scene light into the display's range, a grade, the display's own encoding, grain.
export const filmFrag = (toneChunk) => /* glsl */`precision highp float; precision highp int;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uFrame; uniform float uBloomK;
const float PRINT = 2.0;
${toneChunk}
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
  // lens: a shifted wide lens loses a little light toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.3);
  c = AgXToneMapping(c);
  // The print. The exposure keeps the sunlit wall low on the curve, where a curtain's shade or a leaf's still
  // shows as a difference; here it is printed up to paper white, and only what is brighter than the wall rolls off.
  c *= PRINT;
  c = mix(c, 0.78 + 0.22 * (1.0 - exp(-(c - 0.78) / 0.22)), step(0.78, c));
  // grade, on display light: a touch more colour than the flat transform
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.18);
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // fine grain, strongest in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.017 * (0.35 + 0.65 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
