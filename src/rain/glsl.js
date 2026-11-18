// The window's shaders. Three passes a frame: the drops are drawn as a height field, the glass's own state (fog,
// mist, the wet film a running drop leaves) is advanced, and the picture is put together through both.
// Positions are CSS px with y down, as the DOM and the simulation have them; a texture's v runs up.

export const MAX = { bokeh: 6, haze: 4, lens: 32 };   // the pictures are stored as cbrt(value / MAX): tools/build-assets.mjs
export const TILE = 512;                              // CSS px that one repeat of the mist covers
export const LAMPS = 8;                               // lamps that move behind the glass

export const fullscreenVert = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const noise = /* glsl */ `
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// ---- drops: one quad per drop, kept where it is highest (MAX blending).
//   r: the water's height in CSS px     g: how clear the glass around it is swept (the sim reads this)
//   b: the drop's radius (the lens level it reads)     a: coverage, for an edge that is not a staircase
// A drop is a cap that sags a little under its own weight, with an outline that is no circle; a running one is
// drawn out upwards into its tail. aShape.y < 0 is no drop at all but a stamp: only its sweep, at that strength
// (the trails the window opens with); stamps are drawn by themselves, never among drops.
export const dropVert = /* glsl */ `
in vec3 position;
in vec4 aDrop;    // x, y, radius, seed
in vec2 aShape;   // stretch (1 at rest), strength (negative: a stamp)
uniform vec2 uRes;
out vec2 vQ;
out vec4 vDrop;
void main() {
  float reach = 1.5;                                         // the sweep reaches past the water
  vec2 half_ = aDrop.z * reach * vec2(1.0, max(1.0, aShape.x)) + 1.5;
  vQ = position.xy * half_ / aDrop.z;
  vDrop = vec4(aDrop.z, aDrop.w, aShape.x, aShape.y);
  vec2 p = aDrop.xy + position.xy * half_;
  gl_Position = vec4(p / uRes * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
`;
export const dropFrag = /* glsl */ `
precision highp float;
uniform float uRatio;
in vec2 vQ;
in vec4 vDrop;
out vec4 o;
void main() {
  float r = vDrop.x; float seed = vDrop.y; float st = vDrop.z; float strength = vDrop.w;
  vec2 q = vQ;
  if (q.y < 0.0) { q.y /= st; q.x *= 1.0 + (st - 1.0) * 0.55 * q.y * q.y; }                    // the tail: longer, and narrower towards its end
  float halo = (1.0 - smoothstep(0.9, 1.45, length(q))) * abs(strength);
  if (strength < 0.0) { o = vec4(0.0, halo / abs(strength), abs(strength), 0.0); return; }   // a stamp: its sweep, and in b how fresh it is
  float a = atan(q.y, q.x); float big = smoothstep(2.0, 6.0, r);                                 // a small drop is round
  float wob = 1.0 + big * (0.085 * sin(a * 2.0 + seed * 6.283) + 0.05 * sin(a * 3.0 + seed * 17.0) + 0.028 * sin(a * 5.0 + seed * 31.0));
  float d = length(q) / wob;
  float cap = mix(0.78, 0.46, smoothstep(3.0, 13.0, r));                                         // a large one lies flatter
  float h = r * cap * sqrt(max(0.0, 1.0 - d * d)) * (1.0 + 0.24 * big * clamp(q.y, -1.0, 1.0)); // and hangs low
  float cov = clamp((1.0 - d) * r * uRatio + 0.5, 0.0, 1.0);
  o = vec4(h, halo, r * step(d, 1.0), cov);
}
`;

// ---- the glass: r fog (condensation, 1 = misted over), g mist (how much of the fine spray has settled),
// b film (the water a running drop leaves behind it, gone in a few seconds).
// Fog and mist come back by themselves; a drop sweeps both where it is; the pointer wipes the fog along the
// stroke from uA to uB, in streaks, as a hand does.
export const simFrag = /* glsl */ `
precision highp float;
uniform sampler2D uPrev, uDrops;
uniform vec2 uRes, uA, uB, uDir;
uniform float uGrow, uFogRate, uMistRate, uDt, uReach, uWipe, uReset, uBreath, uSeed, uAlong, uStamp;
in vec2 vUv;
out vec4 o;
${noise}
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 s = mix(texture(uPrev, vUv), vec4(1.0, 1.0, 0.0, 1.0), uReset);
  vec4 d = texture(uDrops, vUv);
  float fog = s.r; float mist = s.g; float film = s.b;

  // back by itself, unevenly: condensation returns in patches
  float patch_ = 0.55 + 0.9 * vnoise(p * 0.012 + 7.0) * vnoise(p * 0.045 + 3.0) * 2.0;
  fog = min(1.0, fog + uGrow * uFogRate * patch_);
  mist = min(1.0, mist + uGrow * uMistRate);
  film = max(0.0, film - uDt * 0.17);
  fog = max(fog, uBreath);                                      // breathed on: misted over at once

  // swept by the drops, as wide as they are, give or take (uStamp: by the stamps of where drops went, each as fresh as it is)
  float swept = smoothstep(-0.1, 0.1, d.g - 0.56 - 0.2 * vnoise(p * vec2(0.09, 0.03) + 17.0));
  fog = min(fog, 1.0 - swept * mix(1.0, d.b, uStamp));
  mist = min(mist, 1.0 - smoothstep(0.0, 0.55, d.g) * mix(1.0, d.b, uStamp));
  film = max(film, d.a * step(4.0, d.b) * (1.0 - uStamp));

  // wiped by the pointer: a band with an uneven edge, never quite clean (thin lines of mist stay, along the
  // stroke), and wet for a while after
  if (uWipe > 0.0) {
    vec2 ab = uB - uA; vec2 ap = p - uA;
    float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float dist = length(ap - ab * t);
    float across = dot(ap, vec2(-uDir.y, uDir.x)); float along = dot(ap, uDir) + uAlong;
    float edge = uReach * (0.74 + 0.36 * vnoise(vec2(along * 0.035 + uSeed, across * 0.02 + uSeed * 0.7)));
    float k = 1.0 - smoothstep(edge * 0.6, edge, dist);
    float streak = vnoise(vec2(across * 0.55, uSeed * 3.1 + along * 0.006)) * 0.6 + vnoise(vec2(across * 0.17, uSeed * 1.7 + along * 0.004)) * 0.4;
    k *= 0.8 + 0.2 * smoothstep(0.3, 0.55, streak);
    fog = min(fog, 1.0 - k);
    film = max(film, k * 0.5 * smoothstep(0.75, 0.35, streak));
  }
  o = vec4(fog, mist, film, 1.0);
}
`;

// ---- the picture: the city out of focus, the same city through condensation where the glass is fogged, the mist
// and the drops as small lenses over both (each shows the whole scene, upside down), then the camera: its vignette,
// its curve and its grain.
export const compositeFrag = /* glsl */ `
precision highp float;
#define LAMPS ${LAMPS}
uniform sampler2D uBokeh, uHaze, uLens, uState, uDrops, uMist;
uniform vec2 uRes, uShift;
uniform vec4 uCover;
uniform float uRatio, uSeed, uFog, uGrain, uExposure;
uniform vec4 uLamp[LAMPS];    // x, y in the picture (0..1, y up), brightness, how far out of focus (1: as the far shore)
uniform vec3 uLampCol[LAMPS];
in vec2 vUv;
out vec4 o;
${noise}
vec3 cube(vec3 s) { return s * s * s; }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 st = texture(uState, vUv);
  vec2 tx = 1.0 / vec2(textureSize(uDrops, 0));
  vec4 d = texture(uDrops, vUv);

  // the glass is never quite flat where water has just run: the view behind it wavers
  vec2 wet = (vec2(vnoise(p * 0.1), vnoise(p * 0.1 + 31.0)) - 0.5) * st.b * 0.011;
  vec2 bg = (vUv - 0.5) * uCover.xy + 0.5 + uCover.zw + uShift;
  vec3 sharp = cube(texture(uBokeh, bg + wet).rgb) * ${MAX.bokeh.toFixed(1)};
  vec3 haze = cube(texture(uHaze, bg).rgb) * ${MAX.haze.toFixed(1)};
  // what moves out there: the lamps of the boats on the river, each a disc like every other lamp in the picture
  // (the same radius, the same brighter rim), and a glow where the glass is misted
  for (int i = 0; i < LAMPS; i++) {
    vec2 to = (bg - uLamp[i].xy) * vec2(1.0, ${(1400 / 2048).toFixed(4)}) / (0.031 * uLamp[i].w);
    float r2 = dot(to, to);
    if (r2 > 9.0) continue;
    float r = sqrt(r2); vec3 lamp = uLampCol[i] * uLamp[i].z / (uLamp[i].w * uLamp[i].w);
    sharp += lamp * (1.0 - smoothstep(0.95, 1.01, r)) * (1.0 + 1.3 * smoothstep(0.78, 0.86, r));
    haze += lamp * 1.1 * exp(-r2 * 0.88);
  }
  sharp += haze * 0.045;   // no pane is clean: a little of every lamp's light is all over it

  // condensation: countless droplets too small to see, which scatter what is behind them into a glow and lift
  // the dark with it. Its grain is those droplets; at a wiped edge they stand apart.
  float grain = hash(floor(p * 1.3)) * 0.45 + vnoise(p * 0.3) * 0.55;
  // nor does it lie evenly: thinner here and there, and in long faint stripes where water ran an hour ago
  float lie = (0.86 + 0.14 * vnoise(p * 0.0035 + 2.0)) * (0.87 + 0.13 * vnoise(vec2(p.x * 0.024, p.y * 0.0017 + 3.0)));
  float f = smoothstep(0.02 + 0.2 * grain, 0.72 + 0.28 * grain, st.r) * uFog * lie;
  float glow = dot(haze, vec3(0.2126, 0.7152, 0.0722));
  vec3 fogged = mix(haze, vec3(glow), 0.1) * 0.5 + vec3(0.035, 0.039, 0.05) * (1.0 + 1.2 * glow) * (0.96 + 0.08 * grain);
  vec3 col = mix(sharp, fogged, f);

  // A drop is a lens of its own: it shows the scene behind it sharp and small, turned over (top for bottom, left
  // for right), about the point straight behind it. uLens is that scene as a fisheye (96° from the axis at the
  // edge); the camera's own view is 52° of it across.
  vec2 behind = (bg - 0.5) * vec2(0.271, 0.185);

  // mist: the fine spray between the drops. Each bead of it is there once the mist has settled past its own share,
  // and it settles in patches.
  vec4 m = texture(uMist, p / ${TILE.toFixed(1)});
  float settle = st.g * (0.35 + 1.1 * vnoise(p * 0.009 + 11.0) * vnoise(p * 0.031 + 5.0) * 1.9);
  float bead = m.b * smoothstep(m.a - 0.03, m.a + 0.03, settle) * step(0.004, st.g);
  if (bead > 0.0) {
    vec2 n = (m.rg * 2.0 - 1.0) * vec2(1.0, -1.0);
    float rim = dot(n, n);
    vec3 lens = cube(textureLod(uLens, vec2(0.5 + behind.x - n.x * 0.14, 0.5 - behind.y + n.y * 0.14), 5.0).rgb) * ${(MAX.lens * 0.22).toFixed(1)};
    lens = lens * (1.0 - 0.7 * rim * rim) + sharp * 0.35;
    col = mix(col, lens, bead * 0.8);
  }

  // drops
  if (d.a > 0.0) {
    float hx = texture(uDrops, vUv + vec2(tx.x, 0.0)).r - texture(uDrops, vUv - vec2(tx.x, 0.0)).r;
    float hy = texture(uDrops, vUv + vec2(0.0, tx.y)).r - texture(uDrops, vUv - vec2(0.0, tx.y)).r;
    vec2 slope = vec2(hx, hy) * 0.5 * uRatio;                   // CSS px of height per CSS px
    vec3 n = normalize(vec3(-slope, 1.0));
    float rim = dot(n.xy, n.xy);
    float k = 0.3;
    float lod = clamp(log2(512.0 * 2.0 * k / max(2.0 * d.b * uRatio, 1.0)), 0.0, 7.0);
    vec3 lens = cube(textureLod(uLens, vec2(0.5 + behind.x - n.x * k, 0.5 - behind.y + n.y * k), lod).rgb) * ${(MAX.lens * 0.6).toFixed(1)};
    lens = max(vec3(0.0), mix(vec3(dot(lens, vec3(0.2126, 0.7152, 0.0722))), lens, 1.35));   // small as they are in it, the lamps keep their colours
    lens *= 1.0 - 0.88 * pow(rim, 2.5);                          // towards its edge a drop looks past the scene: dark
    lens += sharp * 0.25 * (1.0 - rim) + vec3(0.003, 0.003, 0.005);   // and some light comes straight through its flat middle
    col = mix(col, lens, d.a);
  }

  // the camera
  vec2 c = vUv - 0.5; c.x *= uRes.x / uRes.y;
  col *= uExposure * (1.0 - 0.3 * dot(c, c));
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  float g = hash(gl_FragCoord.xy + uSeed * 37.0) - 0.5;
  col += g * uGrain * (1.0 - 0.5 * dot(col, vec3(0.3333)));
  o = vec4(col, 1.0);
}
`;
