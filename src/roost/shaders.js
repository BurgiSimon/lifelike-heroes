// GLSL for the scene. The frame is laid out in CSS pixels with y down, the same space index.js lays the page out in.
// The lens stands at the world's origin (flock.js): a point x to the right, y up and z away from it, in metres, is
// seen at uC + uF * (x, -y) / z, where uC is the point of the frame straight ahead on the horizon and uF the focal
// length in px.
//
// It is a picture of silhouettes, and it is drawn that way. The sky is a photograph. Everything in front of it only
// ever takes light away, so a bird is drawn by darkening (the blend keeps whichever is darker, what is there or the
// bird), which gets a thousand overlapping birds right in any order: a near one covers a far one, and a bird behind
// the sign's letters is not seen. Nothing here is brighter than paper white, so the scene is kept in eight bits,
// gamma-encoded, and multisampled: a starling at two hundred metres is a few pixels of wing.
import { SKY } from './optics.js';

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const head = /* glsl */`precision highp float;
precision highp sampler2D;
uniform vec2 uRes;    // hero box, CSS px
uniform float uPx;    // device px per CSS px
uniform float uF;     // the lens's focal length, CSS px
uniform vec2 uC;      // where the lens's axis meets the horizon, CSS px
uniform float uTime;  // the scene's own clock, s
uniform sampler2D uSky;
const vec3 DARK = vec3(0.017, 0.018, 0.024);   // a thing against the dusk: not black, it still has the east's sky on it
// The sky behind a point of the frame. It is kept as a flat picture in the lens's own projection (optics.js).
vec3 skyAt(vec2 p) {
  vec2 t = vec2(p.x - uC.x, uC.y - p.y) / uF;
  return texture(uSky, vec2(0.5 + t.x / ${f(2 * SKY.half)}, 1.0 - (${f(SKY.top)} - t.y) / ${f(SKY.top - SKY.bottom)})).rgb;
}
vec3 enc(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
`;
// where a fragment is in the frame, CSS px
const framePx = /* glsl */`
vec2 framePx() { return vec2(gl_FragCoord.x, uRes.y * uPx - gl_FragCoord.y) / uPx; }
`;

export const fullscreenVert = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const skyFrag = head + /* glsl */`
in vec2 vUv; out vec4 o;
void main() { o = vec4(enc(skyAt(vec2(vUv.x, 1.0 - vUv.y) * uRes)), 1.0); }
`;

// ---- a bird in the air: a body and two wings, built where it is from how it flies. Its body lies along its
// velocity. Its wings lie square to its lift (flock.js: what holds it up, which leans into every turn), so a bird
// that banks toward the lens shows the whole of its wings and one that flies level across the frame shows their
// edge. That, a thousand times over, is the dark wave in a turning flock.
export const birdVert = head + /* glsl */`
in vec3 position;   // body: along, across, 0. A wing: 0 its root's front, 1 its root's back, 2 its tip; -; 1 left, 2 right
in vec4 aA;         // where it is (m), and its own number
in vec4 aB;         // its velocity (m/s), and its kind: 0 one of the flock, 1 one of the sign's birds, 2 the falcon
in vec4 aC;         // its lift, and how much it is there
uniform float uLag; // s since the flock's last step: its birds are carried on along their velocity
out vec2 vQ; out float vWing; out float vAlpha; out float vFar;
void main() {
  float kind = aB.w; float own = aA.w;
  vec3 P = aA.xyz + aB.xyz * (kind < 0.5 ? uLag : 0.0);
  vec3 fw = normalize(aB.xyz + vec3(0.0, 0.0, 1e-4));
  vec3 up = normalize(aC.xyz - fw * dot(aC.xyz, fw) + vec3(0.0, 1e-3, 0.0));
  vec3 rt = cross(up, fw);
  float big = kind > 1.5 ? 2.7 : 1.0;   // a peregrine is nearly three starlings across
  // The wingbeat. A starling beats about twelve times a second in bursts and holds its wings out between them; a
  // falcon beats slow and shallow. A bird coming in to the sign or just up from it does not glide.
  float beat = uTime * (kind > 1.5 ? 31.0 : 68.0 + 18.0 * own) + own * 100.0;
  float glide = kind > 0.5 && kind < 1.5 ? 0.0 : smoothstep(0.45, 0.85, sin(uTime * (0.8 + 0.9 * own) + own * 40.0));
  float phi = (kind > 1.5 ? 0.5 : 1.0) * sin(beat) * (1.0 - 0.9 * glide) + 0.1;
  vec3 M; vec3 V = normalize(P);
  if (position.z < 0.5) {
    // the body, as the lens sees it: as long as its flight lies across the line of sight, never thinner than itself
    vec3 e1 = fw - V * dot(fw, V); float l1 = length(e1); e1 = l1 > 1e-3 ? e1 / l1 : up; vec3 e2 = cross(V, e1);
    M = (e1 * position.x * max(0.105 * l1, 0.034) + e2 * position.y * 0.034) * big;
    vQ = position.xy; vWing = 0.0;
  } else {
    float side = position.z < 1.5 ? -1.0 : 1.0;
    vec3 root = fw * (position.x < 0.5 ? 0.045 : -0.05) + rt * side * 0.018;
    vec3 tip = (rt * side * cos(phi) + up * sin(phi)) * 0.19 - fw * 0.05;   // swept back a little, as a starling's are
    M = (position.x > 1.5 ? tip : root) * big;
    vQ = vec2(0.0); vWing = 1.0;
  }
  // far off, a bird is smaller than a pixel can show: it is drawn a pixel and a half across and fainter by as much
  float span = 0.19 * big * uF / P.z * uPx; float grow = max(1.0, 1.5 / span);
  M = P + M * grow;
  vAlpha = aC.w / grow; vFar = 1.0 - exp(-P.z / 2600.0);
  vec2 s = uC + uF * vec2(M.x, -M.y) / max(M.z, 1.0);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
export const birdFrag = head + framePx + /* glsl */`
in vec2 vQ; in float vWing; in float vAlpha; in float vFar; out vec4 o;
void main() {
  // the body is an oval, blunter at the head; a wing beats too fast for the shutter and is never quite solid
  float a = vWing > 0.5 ? 0.84 : 1.0 - smoothstep(0.7, 1.0, length(vQ * vec2(1.0, 1.0 + 0.35 * vQ.x)));
  vec3 sky = skyAt(framePx());
  o = vec4(enc(mix(sky, mix(DARK, sky, vFar), a * vAlpha)), 1.0);
}
`;

// ---- the roofline and the sign: painted once into a canvas (skyline.js) and laid over the sky. Its blue says
// how far off a thing is (0: this roof; more: paler, into the haze), its red over its blue that it is a lit window.
export const maskFrag = head + /* glsl */`
uniform sampler2D uMask;
in vec2 vUv; out vec4 o;
const vec3 LAMP = vec3(1.0, 0.56, 0.2);   // a tungsten bulb behind a blind
void main() {
  vec4 m = texture(uMask, vUv);
  if (m.a < 0.003) discard;
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  // What is far off pales into the air between, and that air is lit by the horizon behind it: one colour for the
  // whole of a distant dome, not the sky that happens to be behind each part of it.
  vec3 air = skyAt(vec2(uC.x, uC.y - 0.05 * uF));
  // this roof's wall faces away from the afterglow: it has only the dark half of the sky on it, a little more low down
  vec3 c = DARK * (1.0 + 0.5 * smoothstep(uC.y, uRes.y, p.y)) + air * 0.2 * m.b;   // never as light as any sky behind it
  c = mix(c, LAMP * (0.86 + 0.06 * sin(uTime * 0.7 + p.x * 0.05)), clamp((m.r - m.b) * 2.5, 0.0, 1.0));
  o = vec4(enc(c), m.a);
}
`;

// ---- a bird on the sign: one small shape, drawn from its feet up
export const perchVert = head + /* glsl */`
in vec3 position;
in vec4 aP;         // its feet (CSS px), which way it faces (-1 left, 1 right), its own number
uniform float uPpm; // px per metre at the sign
out vec2 vQ;
void main() {
  float size = 0.125 * uPpm * (0.9 + 0.2 * aP.w);   // half the box a starling fills: about a hand's length of bird
  // it shifts its weight now and then
  float bob = 0.04 * sin(uTime * (1.3 + aP.w) + aP.w * 60.0) * step(0.6, sin(uTime * 0.31 + aP.w * 30.0));
  // some sit upright and some hunched forward: the whole bird is tipped a little about its feet
  float tip = (fract(aP.w * 17.3) - 0.5) * 0.5; vec2 q = vec2(position.x, position.y - 0.93 + bob);
  q = vec2(q.x * cos(tip) - q.y * sin(tip), q.x * sin(tip) + q.y * cos(tip));
  vec2 s = aP.xy + vec2(q.x * aP.z, q.y) * size;
  vQ = position.xy;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
}
`;
export const perchFrag = /* glsl */`precision highp float;
in vec2 vQ; out vec4 o;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
void main() {
  vec2 q = vQ;
  // a starling at rest: an upright oval of a body, head forward, a short tail down behind, a spike of a bill
  vec2 b = q - vec2(-0.02, 0.12); b = vec2(b.x * 0.87 - b.y * 0.5, b.x * 0.5 + b.y * 0.87);
  float d = length(b / vec2(0.6, 0.36)) - 1.0;
  d = min(d, (length(q - vec2(0.36, -0.36)) - 0.2) / 0.3);
  d = min(d, (seg(q, vec2(0.5, -0.38), vec2(0.86, -0.3)) - 0.045 * (1.0 - smoothstep(0.5, 0.86, q.x))) / 0.3);
  d = min(d, (seg(q, vec2(-0.4, 0.34), vec2(-0.86, 0.66)) - 0.09) / 0.3);
  d = min(d, (min(seg(q, vec2(0.02, 0.4), vec2(0.06, 0.93)), seg(q, vec2(0.18, 0.36), vec2(0.2, 0.93))) - 0.03) / 0.3);
  float a = 1.0 - smoothstep(-0.02, 0.06, d);
  o = vec4(pow(vec3(0.017, 0.018, 0.024), vec3(1.0 / 2.2)), a);
}
`;

// The lens and the print. The sky came developed (its build script exposed it and rolled its highlights off), so
// there is no tone curve to apply here: only what the lens does to the corners, a grade, the display's encoding, grain.
export const filmFrag = /* glsl */`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene;
uniform vec2 uRes; uniform float uFrame;
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = pow(texture(uScene, vUv).rgb, vec3(2.2));
  // lens: light falls off gently toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.85); c *= mix(1.0, fall * fall, 0.4);
  // grade, on display light: a touch more contrast and colour, the shadows held a little blue under the warm sky
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  c *= mix(vec3(0.96, 1.0, 1.06), vec3(1.0), smoothstep(0.0, 0.25, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // fine grain, strongest in the mid-tones, and a last half-bit of dither against banding in the sky
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.015 * (0.35 + 0.65 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;
