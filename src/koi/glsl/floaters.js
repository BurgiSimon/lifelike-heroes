// Everything that floats: lily pads, their blooms, pellets, pollen and fallen petals. One instanced quad each.
// iA = (x, y, radius px, angle), iB = (kind: 0 pad, 1 bloom, 2 pellet, 3 pollen, 4 petal; seed; two free values).
import { common, gobo } from './common.js';

export const floatVert = /* glsl */ `
${common}
in vec3 position;
in vec4 iA; in vec4 iB;
uniform sampler2D uSurf;
out vec2 vQ; flat out vec4 vA; flat out vec4 vB; flat out vec3 vG; out vec2 vP;
void main() {
  float r = iA.z; float m = 1.0 + 4.0 / r;      // room for the edge and the meniscus round it
  vec3 sf = textureLod(uSurf, uvOf(iA.xy), 0.0).xyz;
  vec2 c = iA.xy + sf.xy * (iB.x < 1.5 ? 10.0 : 22.0) * uS;   // light things slide down the face of a ripple
  float cs = cos(iA.w); float sn = sin(iA.w);
  vec2 q = position.xy * m;
  vec2 p = c + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) * r;
  vQ = q; vA = iA; vB = iB; vG = sf; vP = p;
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
// Petals of one whorl of a water lily: returns signed px inside the petal under q, and where on it we are.
float whorl(vec2 q, float r, float n, float len, float turn, out float along, out float across) {
  float rho = length(q); float a = atan(q.y, q.x) / 6.2831853 * n + turn;
  across = (fract(a) - 0.5) * 2.0;            // -1..1 across the petal's slot
  along = rho / len;
  float wide = 0.98 * pow(max(sin(3.14159 * pow(clamp(along, 0.0, 1.0), 0.72)), 0.0), 0.8);
  return (wide - abs(across)) * 3.14159 / n * rho * r;
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
  else if (kind < 1.5) a = (1.0 - smoothstep(0.6, 0.95, length(vQ))) * 0.9;
  else if (kind < 2.5) a = 1.0 - smoothstep(0.7, 1.3, length(vQ));
  else a = (1.0 - smoothstep(0.5, 1.0, length(vQ * vec2(1.0, kind > 3.5 ? 2.0 : 1.0)))) * (kind > 3.5 ? 0.7 : 0.25);
  o = vec4(0.0, a, 0.0, a);
}
`;

export const floatFrag = /* glsl */ `
${common}
${gobo}
${shape}
in vec2 vQ; flat in vec4 vA; flat in vec4 vB; flat in vec3 vG; in vec2 vP;
out vec4 o;

vec3 skyAt(vec3 n) {
  vec3 rf = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 c = textureLod(uSky, vec2(0.5) + rf.xy * 0.42, 4.8).rgb;
  return c * c * (1.0 + 2.0 * smoothstep(0.55, 1.0, dot(c, vec3(0.333))));
}

void main() {
  vec2 q = vQ; float r = vA.z; float kind = vB.x; float seed = vB.y;
  float cs = cos(vA.w); float sn = sin(vA.w);
  // the sun as this floater sees it, in its own turned frame
  vec3 sunL = vec3(cs * SUN_A.x + sn * SUN_A.y, -sn * SUN_A.x + cs * SUN_A.y, SUN_A.z);
  vec2 tilt = vec2(cs * vG.x + sn * vG.y, -sn * vG.x + cs * vG.y);   // it rides the water's slope
  float gate = goboAt(vP);
  vec3 sun = SUNCOL * gate; vec3 amb = SKYCOL * (0.75 + 0.25 * gate);
  vec3 hv = normalize(sunL + vec3(0.0, 0.0, 1.0));
  vec3 col = vec3(0.0); float alpha = 0.0;

  if (kind < 0.5) {
    // ---- lily pad
    float rho = length(q); float th = atan(q.y, q.x);
    float d = padShape(q, r, seed);
    alpha = clamp(d * uPx + 0.5, 0.0, 1.0);
    // veins fan out from where the stalk meets the leaf and fork twice on the way to the rim
    float nv = 11.0; float sp = 6.2831853 / nv * rho * r;        // px between neighbours here
    float a1 = th / 6.2831853 * nv + 0.5;
    float v1 = abs(fract(a1) - 0.5) * sp;
    float fk = max(rho - 0.42, 0.0) * 0.55;
    float v2 = min(abs(fract(a1 + fk * nv / 6.2831853) - 0.5), abs(fract(a1 - fk * nv / 6.2831853) - 0.5)) * sp;
    float wv = mix(1.5, 0.55, rho) * (0.6 + 0.25 * r / 40.0);
    float vein = max((1.0 - smoothstep(0.0, wv, v1)) * (1.0 - smoothstep(0.5, 0.62, rho)) , (1.0 - smoothstep(0.0, wv * 0.8, v2)) * smoothstep(0.4, 0.5, rho)) * (1.0 - smoothstep(0.9, 1.0, rho));
    float webn = fbm(q * 7.0 + seed * 31.0);
    // leaf colour: deep green, lighter between veins, older leaves yellowing and bronzing from the rim
    float age = hash(vec2(seed * 71.0, 2.0));
    vec3 g1 = vec3(0.045, 0.125, 0.022); vec3 g2 = vec3(0.1, 0.21, 0.035);
    vec3 alb = mix(g1, g2, fbm(q * 2.3 + seed * 13.0) * 0.9 + 0.25 * cos(a1 * 6.2831853) * rho);
    alb = mix(alb, vec3(0.2, 0.22, 0.035), smoothstep(0.45, 0.8, fbm(q * 1.6 + seed * 5.0) + age * 0.25 - 0.1) * 0.55);
    alb = mix(alb, vec3(0.14, 0.055, 0.03), smoothstep(0.86 - 0.3 * age, 1.02, rho + (webn - 0.5) * 0.22) * (0.35 + 0.5 * age));
    alb = mix(alb, vec3(0.09, 0.06, 0.02), smoothstep(0.7, 0.78, fbm(q * 9.0 + seed * 3.0)) * 0.7);    // spotting
    alb = mix(alb, alb * 1.5 + vec3(0.03, 0.05, 0.0), vein * 0.75);
    alb *= 0.9 + 0.2 * webn;
    // surface: cupped at the rim, ridged at the veins, gently quilted between them
    vec2 rd = q / max(rho, 1e-3);
    vec3 n = vec3(-rd * 0.4 * pow(rho, 7.0), 1.0);
    n.xy += vec2(-rd.y, rd.x) * sin(a1 * 6.2831853) * 0.1 * rho;
    n.xy += (vec2(vnoise(q * 14.0 + seed), vnoise(q * 14.0 + seed + 37.0)) - 0.5) * 0.14;
    n.xy -= tilt * 1.4;
    n = normalize(n);
    float ndl = max(dot(n, sunL), 0.0);
    // a bloom on this pad shades it
    float shb = 0.0;
    if (dot(vB.zw, vB.zw) > 0.0) { vec2 bq = q - vB.zw - sunL.xy * -0.16; shb = (1.0 - smoothstep(0.25, 0.5, length(bq))) * 0.6; }
    col = alb * (sun * ndl * (1.0 - shb) + amb * (1.0 - 0.4 * shb));
    // wax: a tight sun highlight where the leaf tilts right, and a broad pale sheen of sky
    float ndh = max(dot(n, hv), 0.0);
    float fres = 0.04 + 0.5 * pow(1.0 - n.z, 4.0);
    col += sun * (pow(ndh, 90.0) * 1.2 + pow(ndh, 14.0) * 0.045) * (1.0 - shb) * (1.0 - 0.6 * vein);
    col += skyAt(n) * fres * (0.7 + 0.5 * webn);
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
    // the cut edge catches light on the sunward side; the meniscus round the leaf is a thin dark line with a glint
    float rimLight = dot(rd, normalize(sunL.xy));
    col += sun * alb * 0.6 * smoothstep(1.6, 0.0, d) * max(rimLight, 0.0);
    float men = (1.0 - smoothstep(0.0, 2.6, -d)) * step(d, 0.5);
    vec3 menCol = sun * 0.22 * pow(max(rimLight, 0.0), 3.0) + amb * 0.02;
    col = mix(menCol, col, alpha);
    alpha = max(alpha, men * mix(0.38, 0.8, pow(max(rimLight, 0.0), 3.0)));
  } else if (kind < 1.5) {
    // ---- water lily bloom: four whorls of pointed petals, outermost first, and a crown of stamens
    float rho = length(q);
    vec3 tint = mix(vec3(0.8, 0.42, 0.5), vec3(0.84, 0.83, 0.76), step(0.5, vB.z));      // pink or white
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float al; float ac;
      float len = 1.0 - fk * 0.21;
      float d = whorl(q, r, 10.0 - fk * 1.5, len, fk * 0.5 + seed * 3.0 + 0.13 * fk * fk, al, ac);
      float a = clamp(d * uPx + 0.5, 0.0, 1.0);
      float lift = 0.2 + fk * 0.22;                 // inner petals stand more upright
      vec2 rd = q / max(rho, 1e-3);
      vec3 n = normalize(vec3(vec2(-rd.y, rd.x) * ac * 0.8 - rd * (lift - 0.9 * pow(al, 3.0)), 1.0));
      float ndl = max(dot(n, sunL), 0.0);
      vec3 alb = mix(vec3(0.8, 0.79, 0.68), tint, smoothstep(0.1, 0.85, al));
      alb *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.1, abs(ac)));           // the crease down the middle
      float under = fk < 2.5 ? smoothstep((len - 0.21) * 0.45, (len - 0.21) * 1.1, rho + 0.05 * dot(rd, sunL.xy)) : 1.0;   // the whorl above shades this one's base
      float seam = mix(0.72, 1.0, smoothstep(0.0, 1.6, d));               // petals darken where they tuck under their neighbours
      vec3 pc = alb * seam * (sun * (ndl * 0.75 + 0.2) * mix(0.3, 1.0, under) + amb * mix(0.4, 1.0, under));
      col = mix(col, pc, a); alpha = max(alpha, a);
    }
    float st = 1.0 - smoothstep(0.17, 0.22, rho);
    vec3 sc = vec3(0.85, 0.5, 0.05) * (0.7 + 0.6 * vnoise(q * 60.0)) * (sun * 0.6 + amb);
    col = mix(col, sc, st); alpha = max(alpha, st);
  } else if (kind < 2.5) {
    // ---- pellet: a small brown ball sitting in the surface
    float rho = length(q);
    vec3 n = vec3(q, sqrt(max(1.0 - rho * rho, 0.0)));
    alpha = clamp((1.0 - rho) * r * uPx + 0.5, 0.0, 1.0);
    vec3 alb = vec3(0.3, 0.17, 0.07) * (0.8 + 0.4 * vnoise(q * 5.0 + seed * 9.0));
    col = alb * (sun * max(dot(n, sunL), 0.0) + amb) + sun * pow(max(dot(n, hv), 0.0), 30.0) * 0.25;
    float men = (1.0 - smoothstep(1.0, 1.5, rho)) * (1.0 - alpha);
    col = mix(vec3(0.0), col, alpha); alpha = max(alpha, men * 0.4);
  } else if (kind < 3.5) {
    // ---- pollen: a pale speck
    float rho = length(q);
    alpha = (1.0 - smoothstep(0.35, 1.0, rho)) * (0.35 + 0.5 * vB.z);
    col = vec3(0.62, 0.55, 0.3) * (sun * 0.6 + amb);
  } else {
    // ---- a fallen petal or a small leaf: a lens with a crease, slightly cupped
    vec2 e = q * vec2(1.0, 2.1);
    float rho = length(e);
    alpha = clamp((1.0 - rho) * r * 0.45 * uPx + 0.5, 0.0, 1.0);
    vec3 n = normalize(vec3(-q.x * 0.2, -q.y * 1.3, 1.0) - vec3(tilt, 0.0));
    vec3 alb = vB.z > 0.5 ? mix(vec3(0.52, 0.38, 0.39), vec3(0.56, 0.53, 0.48), vB.w) : mix(vec3(0.3, 0.2, 0.04), vec3(0.2, 0.25, 0.04), vB.w);
    alb *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.12, abs(q.y)));
    col = alb * (sun * (max(dot(n, sunL), 0.0) * 0.85 + 0.15) + amb);
    col += skyAt(n) * 0.05;
  }
  o = vec4(col * alpha, alpha);
}
`;
