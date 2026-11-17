// Everything that floats: lily pads, their blooms, pellets, pollen, fallen leaves and petals. One instanced quad
// each. iA = (x, y, radius px, angle), iB = (kind: 0 pad, 1 a bloom's stamens, 2 pellet, 3 pollen, 4 fallen leaf
// or petal, 5 one petal of a bloom; seed; two free values). A pellet's first free value is its height on the way
// down, 1 to 0.
import { common, gobo } from './common.js';

export const floatVert = /* glsl */ `
${common}
in vec3 position;
in vec4 iA; in vec4 iB;
uniform sampler2D uSurf;
out vec2 vQ; flat out vec4 vA; flat out vec4 vB; flat out vec3 vG; out vec2 vP;
void main() {
  float r = iA.z;
  float up = iB.x > 1.5 && iB.x < 2.5 ? iB.z : 0.0;   // a pellet still in the air
  vec3 sf = textureLod(uSurf, uvOf(iA.xy), 0.0).xyz;
  vec2 c = iA.xy + sf.xy * (iB.x < 1.5 || iB.x > 4.5 ? 10.0 : 22.0) * uS * (1.0 - min(1.0, up * 20.0));   // light things slide down the face of a ripple
  r /= 1.0 - 0.66 * up;                               // up there it is nearer the lens
  float m = 1.0 + 4.0 / r;      // room for the edge and the meniscus round it
  float cs = cos(iA.w); float sn = sin(iA.w);
  vec2 q = position.xy * m;
  vec2 p = c + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) * r;
  vQ = q; vA = vec4(iA.xy, r, iA.w); vB = iB; vG = sf; vP = p;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

const shape = /* glsl */ `
const float NOTCH = 0.16;
// Signed px inside a lily pad (positive inside): a wavy rim, a slit to the middle, a bite or two.
float padShape(vec2 q, float r, float seed) {
  float rho = length(q); float th = atan(q.y, q.x);
  float wav = 0.02 * sin(th * 3.0 + seed * 40.0) + 0.013 * sin(th * 7.0 + seed * 90.0) + 0.007 * sin(th * 13.0 + seed * 11.0);
  float d = (1.0 + wav - rho) * r;
  d = min(d, (abs(th) - NOTCH * mix(0.35, 1.0, rho * rho)) * rho * r);
  for (int i = 0; i < 2; i++) {
    float hs = hash(vec2(seed * 91.0 + float(i) * 7.0, 3.0));
    if (hs > 0.5) continue;                       // about half the bites exist
    float an = 0.9 + 4.4 * hash(vec2(seed * 53.0, float(i) + 11.0));
    float rn = 0.07 + 0.09 * hash(vec2(seed * 17.0, float(i) + 5.0));
    d = min(d, (length(q - vec2(cos(an), sin(an)) * (1.0 + rn * 0.35)) - rn) * r);
  }
  return d;
}
// One petal of a water lily, in its own quad: x runs from its base (-1) outward, y across. It stands up from
// the water by an angle whose cosine is ct, so from above it is that much shorter. Returns signed px inside, and
// how far along it we are.
float petal(vec2 q, float r, float ct, out float al) {
  al = (q.x + 1.0) / (2.0 * ct);
  float wide = 0.47 * pow(max(sin(3.14159 * pow(clamp(al, 0.0, 1.0), 0.6)), 0.0), 0.85);
  return al > 1.0 ? -1e3 : (wide - abs(q.y)) * r;
}
// A fallen leaf or petal lying flat: the same outline bent along its midrib, its edge a little uneven. c is how
// far across it we are, -1..1.
float leaf(vec2 q, float r, float seed, out float al, out float c) {
  float y = q.y - (seed - 0.5) * 0.5 * (1.0 - q.x * q.x);
  al = (q.x + 1.0) * 0.5;
  float wide = 0.47 * pow(max(sin(3.14159 * pow(clamp(al, 0.0, 1.0), 0.6)), 0.0), 0.85) * (0.94 + 0.06 * sin(q.x * 17.0 + seed * 40.0));
  c = y / max(wide, 1e-3);
  return (wide - abs(y)) * r;
}
`;

// Coverage only, for the shadows floaters throw on the floor and on the koi.
export const floatMaskFrag = /* glsl */ `
${common}
${shape}
in vec2 vQ; flat in vec4 vA; flat in vec4 vB;
out vec4 o;
void main() {
  float r = vA.z; float kind = vB.x; float a;
  if (kind < 0.5) a = clamp(padShape(vQ, r, vB.y) * uPx * 0.34 + 0.5, 0.0, 1.0);
  else if (kind < 1.5) a = (1.0 - smoothstep(0.7, 1.0, length(vQ))) * 0.9;
  else if (kind < 2.5) a = (1.0 - smoothstep(0.7, 1.3, length(vQ))) * (1.0 - vB.z);   // a shadow that small is lost on the way down from any height
  else if (kind > 4.5) { float al; a = clamp(petal(vQ, r, cos(vB.z), al) * uPx * 0.34 + 0.5, 0.0, 1.0) * 0.85; }
  else if (kind > 3.5) { float al; float c; a = clamp(leaf(vQ, r, vB.y, al, c) * uPx * 0.34 + 0.5, 0.0, 1.0) * 0.85; }
  else a = (1.0 - smoothstep(0.5, 1.0, length(vQ))) * 0.25;
  o = vec4(0.0, a, 0.0, a);
}
`;

export const floatFrag = /* glsl */ `
${common}
${gobo}
${shape}
in vec2 vQ; flat in vec4 vA; flat in vec4 vB; flat in vec3 vG; in vec2 vP;
out vec4 o;
uniform sampler2D uSky;

vec3 skyAt(vec3 n) {
  vec3 rf = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 c = textureLod(uSky, vec2(0.5) + rf.xy * 0.42, 4.3).rgb;
  return c * c * (1.0 + 2.0 * smoothstep(0.55, 1.0, dot(c, vec3(0.333))));
}

void main() {
  vec2 q = vQ; float r = vA.z; float kind = vB.x; float seed = vB.y;
  float cs = cos(vA.w); float sn = sin(vA.w);
  // the sun as this floater sees it, in its own turned frame
  vec3 sunL = vec3(cs * SUN_A.x + sn * SUN_A.y, -sn * SUN_A.x + cs * SUN_A.y, SUN_A.z);
  vec2 tilt = vec2(cs * vG.x + sn * vG.y, -sn * vG.x + cs * vG.y);   // it rides the water's slope
  float gate = goboAt(vP, 0.0);
  vec3 sun = SUNCOL * gate; vec3 amb = SKYCOL * (0.75 + 0.25 * gate);
  vec3 hv = normalize(sunL + vec3(0.0, 0.0, 1.0));
  vec3 col = vec3(0.0); float alpha = 0.0;

  if (kind < 0.5) {
    // ---- lily pad
    float rho = length(q); float th = atan(q.y, q.x);
    float d = padShape(q, r, seed);
    alpha = clamp(d * uPx + 0.5, 0.0, 1.0);
    // veins fan out from where the stalk meets the leaf and fork twice on the way to the rim
    float nv = 9.0 + floor(hash(vec2(seed * 13.0, 5.0)) * 5.0); float sp = 6.2831853 / nv * rho * r;        // px between neighbours here
    float a1 = th / 6.2831853 * nv + 0.5;
    float v1 = abs(fract(a1) - 0.5) * sp;
    float fk = max(rho - 0.42, 0.0) * 0.55;
    float v2 = min(abs(fract(a1 + fk * nv / 6.2831853) - 0.5), abs(fract(a1 - fk * nv / 6.2831853) - 0.5)) * sp;
    float wv = mix(1.5, 0.55, rho) * (0.6 + 0.25 * r / 40.0);
    float vein = max((1.0 - smoothstep(0.0, wv, v1)) * (1.0 - smoothstep(0.5, 0.62, rho)) , (1.0 - smoothstep(0.0, wv * 0.8, v2)) * smoothstep(0.4, 0.5, rho)) * (1.0 - smoothstep(0.9, 1.0, rho));
    float webn = fbm(q * 7.0 + seed * 31.0);
    // leaf colour: deep green, lighter between veins, older leaves yellowing and bronzing from the rim
    float age = hash(vec2(seed * 71.0, 2.0)); float hue = hash(vec2(seed * 29.0, 7.0));
    vec3 g1 = mix(vec3(0.03, 0.085, 0.02), vec3(0.05, 0.125, 0.02), hue); vec3 g2 = mix(vec3(0.06, 0.13, 0.034), vec3(0.105, 0.2, 0.04), hue);
    vec3 alb = mix(g1, g2, fbm(q * 2.3 + seed * 13.0) * 0.9 + 0.25 * cos(a1 * 6.2831853) * rho);
    alb = mix(alb, vec3(0.2, 0.22, 0.035), smoothstep(0.45, 0.8, fbm(q * 1.6 + seed * 5.0) + age * 0.25 - 0.1) * 0.55);
    // an old leaf yellows in one sector first
    float sector = (1.0 - smoothstep(0.25, 0.75, abs(mod(th - hue * 6.2831853 + 3.14159, 6.2831853) - 3.14159))) * smoothstep(0.55, 0.75, age);
    alb = mix(alb, vec3(0.25, 0.2, 0.04), sector * smoothstep(0.2, 0.9, rho + (webn - 0.5) * 0.3) * 0.7);
    alb = mix(alb, vec3(0.14, 0.055, 0.03), smoothstep(0.86 - 0.3 * age, 1.02, rho + (webn - 0.5) * 0.22) * (0.35 + 0.5 * age));
    alb = mix(alb, vec3(0.09, 0.06, 0.02), smoothstep(0.7, 0.78, fbm(q * 9.0 + seed * 3.0)) * 0.7);    // spotting
    alb = mix(alb, alb * 1.5 + vec3(0.03, 0.05, 0.0), vein * 0.38);
    alb *= 0.9 + 0.2 * webn;
    // surface: cupped at the rim, ridged at the veins, gently quilted between them
    vec2 rd = q / max(rho, 1e-3);
    // the rim curls up along some arcs, more on some leaves, and shows its red-brown underside there
    float curl = (0.25 + 0.75 * hue) * smoothstep(-0.2, 0.7, sin(th + seed * 40.0) + 0.4 * sin(th * 2.0 + seed * 9.0));
    vec3 n = vec3(-rd * 0.17 * curl * pow(rho, 12.0), 1.0);
    alb = mix(alb, vec3(0.16, 0.06, 0.035), curl * smoothstep(0.93, 1.0, rho) * 0.6);
    n.xy += vec2(-rd.y, rd.x) * sin(a1 * 6.2831853) * 0.1 * rho;
    n.xy += (vec2(vnoise(q * 14.0 + seed), vnoise(q * 14.0 + seed + 37.0)) - 0.5) * 0.14;
    n.xy -= tilt * 1.4;
    vec3 flatN = normalize(vec3(-tilt * 1.4, 1.0));   // the leaf as a whole, for what it mirrors of the sky
    n = normalize(n);
    float ndl = max(dot(n, sunL), 0.0);
    // a bloom on this pad shades it
    float shb = 0.0;
    if (dot(vB.zw, vB.zw) > 0.0) { vec2 bq = q - vB.zw + normalize(sunL.xy) * 0.16; shb = (1.0 - smoothstep(0.22, 0.56, length(bq))) * 0.7; }
    // where the rim curls up on the sun's side it shades the leaf just inside it
    float lip = curl * smoothstep(0.76, 0.9, rho) * (1.0 - smoothstep(0.9, 0.98, rho)) * max(dot(rd, normalize(sunL.xy)), 0.0);
    col = alb * (sun * ndl * (1.0 - shb) * (1.0 - 0.6 * lip) + amb * (1.0 - 0.4 * shb));
    // wax: a tight sun highlight where the leaf tilts right, and a broad pale sheen of sky
    float ndh = max(dot(n, hv), 0.0);
    float fres = 0.04 + 0.5 * pow(1.0 - n.z, 4.0);
    col += sun * (pow(ndh, 260.0) * 0.4 * smoothstep(0.4, 0.75, vnoise(q * 38.0 + seed * 77.0)) + pow(ndh, 40.0) * 0.25) * (1.0 - shb) * (1.0 - 0.6 * vein);
    col += skyAt(flatN) * fres * (1.2 + 0.8 * webn);
    // beads of water sitting on the wax
    for (int i = 0; i < 6; i++) {
      vec2 hc = vec2(hash(vec2(seed * 97.0, float(i))), hash(vec2(float(i) + 3.0, seed * 59.0)));
      float ang = hc.x * 6.2831853; float rr = 0.12 + 0.68 * sqrt(hc.y);
      float br = (0.9 + 2.3 * hash(vec2(seed * 7.0 + float(i), 9.0))) * uS;      // px
      vec2 dv = (q - vec2(cos(ang), sin(ang)) * rr) * r / br;
      float dd = length(dv);
      if (dd < 1.6) {
        float inb = 1.0 - smoothstep(0.85, 1.0, dd);
        vec2 dn = dv / max(dd, 1e-3);
        float focus = smoothstep(-0.3, 0.9, dot(dn, -normalize(sunL.xy))) * dd;      // the bead gathers light on its far side
        col = mix(col, col * mix(0.55, 2.3, focus), inb);
        col += sun * (1.0 - smoothstep(0.1, 0.34, length(dv - normalize(sunL.xy) * 0.42))) * inb * 1.6;
        col *= 1.0 - 0.45 * (1.0 - inb) * (1.0 - smoothstep(1.0, 1.6, length(dv + normalize(sunL.xy) * 0.35)));  // its small shadow
      }
    }
    // the cut edge catches a little light on the sunward side; the water's own climb up the rim is in the surface
    // pass (it bends the floor there), so all that is drawn here is the thin dark line of the leaf's thickness
    float rimLight = dot(rd, normalize(sunL.xy));
    col += sun * alb * 0.3 * smoothstep(1.6, 0.0, d) * max(rimLight, 0.0);
    float men = (1.0 - smoothstep(0.0, 2.2, -d)) * step(d, 0.5);
    col = mix(amb * 0.02, col, alpha);
    alpha = max(alpha, men * 0.25);
  } else if (kind < 1.5) {
    // ---- the crown of stamens at a bloom's heart: two rings of short strokes round a yellow-green boss
    float rho = length(q); float th = atan(q.y, q.x) / 6.2831853;
    vec3 gold = vec3(0.82, 0.5, 0.05);
    float core = 1.0 - smoothstep(0.26, 0.36, rho);
    col = mix(gold * 0.5, vec3(0.6, 0.55, 0.1), core) * (sun * 0.7 + amb);
    alpha = core;
    for (int k = 0; k < 2; k++) {
      float fk = float(k); float nn = 13.0 + 11.0 * fk; float r0 = 0.3 + 0.34 * fk;
      float cell = floor(th * nn + seed * 9.0 * (fk + 1.0)); float id = hash(vec2(cell, fk + seed * 50.0));
      float ac = abs(fract(th * nn + seed * 9.0 * (fk + 1.0)) - 0.5);
      float reach = r0 + 0.2 + 0.14 * id;
      float dash = (1.0 - smoothstep(0.16, 0.3, ac)) * smoothstep(r0 - 0.2, r0 - 0.08, rho) * (1.0 - smoothstep(reach - 0.06, reach + 0.05, rho));
      vec3 sc = mix(gold, vec3(0.95, 0.74, 0.2), smoothstep(reach - 0.22, reach, rho)) * (0.75 + 0.5 * id);   // anthers paler at the tips
      col = mix(col, sc * (sun * 0.8 + amb), dash); alpha = max(alpha, dash);
    }
  } else if (kind > 4.5) {
    // ---- one petal of a water lily: cupped, creased down the middle, thin enough to glow
    float ct = cos(vB.z); float st = sin(vB.z); float al;
    float d = petal(q, r, ct, al);
    alpha = clamp(d * uPx + 0.5, 0.0, 1.0);
    float across = q.y / 0.47;
    vec3 n = normalize(vec3(-st - 0.5 * (al - 0.5), -across * 0.75, ct + 0.25));
    float ndl = dot(n, sunL);
    vec3 pale = vec3(0.8, 0.79, 0.71);
    vec3 tint = vB.w > 0.5 ? mix(pale, vec3(0.84, 0.84, 0.8), al) : mix(vec3(0.82, 0.7, 0.7), vec3(0.78, 0.36, 0.47), smoothstep(0.0, 0.9, al) * (0.7 + 0.5 * seed));
    tint = mix(vec3(0.62, 0.66, 0.4), tint, smoothstep(0.0, 0.42, al));          // green-cream where it leaves the stem
    tint *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.14, abs(across)));              // the crease
    tint *= 0.93 + 0.14 * hash(vec2(seed * 91.0, 3.0));
    float tuck = mix(0.42, 1.0, smoothstep(0.0, 0.5, al));                        // down among the other petals less light arrives
    col = tint * (sun * (max(ndl, 0.0) * 0.8 + 0.3 * (1.0 - max(ndl, 0.0)) + 0.35 * max(-ndl, 0.0)) * tuck + amb * mix(0.55, 1.0, tuck));   // thin enough that a petal turned from the sun still glows
    // its shadow on whatever lies beneath: the petals of the whorl below, the pad
    float sal; vec2 so = vec2(cs * SHDIR.x + sn * SHDIR.y, -sn * SHDIR.x + cs * SHDIR.y) * (1.6 + 5.0 * st) * uS / r;
    float shd = clamp(petal(q - so, r, ct, sal) * uPx * 0.5 + 0.5, 0.0, 1.0) * 0.6 * gate;
    col = mix(vec3(0.0), col, alpha); alpha = max(alpha, shd * (1.0 - alpha));
    o = vec4(col, alpha); return;
  } else if (kind < 2.5) {
    // ---- pellet: a small brown ball sitting in the surface. On its way down (up, 1 to 0) it is nearer the lens:
    // out of focus, and it comes into the frame rather than appearing in it.
    float rho = length(q); float up = vB.z;
    vec3 n = vec3(q, sqrt(max(1.0 - rho * rho, 0.0)));
    alpha = clamp((1.0 - rho) * r * uPx / (1.0 + 5.0 * up) + 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, up));
    vec3 alb = vec3(0.3, 0.17, 0.07) * (0.8 + 0.4 * vnoise(q * 5.0 + seed * 9.0));
    col = alb * (sun * max(dot(n, sunL), 0.0) + amb) + sun * pow(max(dot(n, hv), 0.0), 30.0) * 0.25;
    float men = (1.0 - smoothstep(1.0, 1.5, rho)) * (1.0 - alpha) * (1.0 - min(1.0, up * 20.0));
    col = mix(vec3(0.0), col, alpha); alpha = max(alpha, men * 0.4);
  } else if (kind < 3.5) {
    // ---- pollen: a pale speck riding in the surface film
    float rho = length(q);
    alpha = (1.0 - smoothstep(0.35, 1.0, rho)) * (0.3 + 0.3 * vB.z);
    col = vec3(0.34, 0.3, 0.17) * (sun * 0.6 + amb);
  } else {
    // ---- a fallen leaf (vB.z < 0.5) or a lily petal adrift: folded a little along the midrib, its edges lifted
    // off the water, mottled as it ages
    float al; float c;
    float d = leaf(q, r, seed, al, c);
    alpha = clamp(d * uPx + 0.5, 0.0, 1.0);
    bool isLeaf = vB.z < 0.5;
    float fold = isLeaf ? 0.35 : -0.55;                           // a leaf creases down, a petal cups up like a boat
    vec3 n = normalize(vec3(-(al - 0.45) * 0.5, -c * fold - sign(c) * 0.5 * smoothstep(0.55, 1.0, abs(c)), 1.0) - vec3(tilt, 0.0));
    float mott = fbm(q * 3.1 + seed * 23.0);
    vec3 alb;
    if (isLeaf) {
      // from summer green through yellow to rust, a different mix on every leaf, browner toward the edge
      alb = mix(vec3(0.34, 0.25, 0.035), vB.w < 0.35 ? vec3(0.13, 0.19, 0.035) : vB.w < 0.7 ? vec3(0.46, 0.3, 0.03) : vec3(0.3, 0.1, 0.03), smoothstep(0.25, 0.7, mott + (vB.w - 0.5) * 0.3));
      alb = mix(alb, vec3(0.13, 0.065, 0.025), smoothstep(0.5, 1.0, abs(c) + (mott - 0.5) * 0.8) * 0.65);
      float side = abs(fract((al - abs(c) * 0.28) * 5.0 + 0.5) - 0.5) * 2.0 * r / 5.0;            // px from the nearest side vein
      alb *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 1.1, side)) * smoothstep(0.1, 0.3, abs(c));
      alb = mix(alb, alb * 1.5 + 0.03, 1.0 - smoothstep(0.0, 1.1 * uS, abs(c) * d / max(1.0 - abs(c), 1e-3)));   // the midrib, by its distance in px
    } else {
      alb = mix(vec3(0.66, 0.42, 0.46), vec3(0.72, 0.68, 0.62), vB.w) * (0.85 + 0.3 * mott);
      alb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.2, abs(c)));
    }
    float ndl = max(dot(n, sunL), 0.0);
    col = alb * (sun * (ndl * 0.9 + 0.1) + amb);
    col += sun * pow(max(dot(n, hv), 0.0), 26.0) * (isLeaf ? 0.16 : 0.07) * smoothstep(0.35, 0.6, mott);   // wet patches shine
    col += skyAt(n) * 0.04;
    // the water holds it by a dark line all round, thicker where its edge shades the surface
    float rim = (1.0 - smoothstep(0.0, 2.0 * uS, -d)) * step(d, 0.5);
    col = mix(vec3(0.0), col, alpha); alpha = max(alpha, rim * 0.3);
    o = vec4(col, alpha); return;
  }
  o = vec4(col * alpha, alpha);
}
`;
