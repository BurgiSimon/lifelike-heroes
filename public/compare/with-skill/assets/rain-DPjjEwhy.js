import{a as e,l as t,n,o as r,r as i,s as a,t as o,u as s}from"./kit-C3B5HmhP.js";import{A as c,B as l,C as u,G as d,H as f,N as p,U as m,V as h,W as g,_,a as v,b as y,c as b,d as x,g as S,h as C,i as w,j as T,l as E,m as ee,n as D,o as O,r as te,s as k,t as A,x as j}from"./chrome-unMT6QSD.js";var M=2600,N=12,P=5.2,F=430,I=.14,L=1150,R=.022,z=9,B=e=>()=>{e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296},V=e=>{let t=Math.sin(e*127.1)*43758.5453;return t-Math.floor(t)},H=e=>{let t=Math.floor(e),n=e-t,r=n*n*(3-2*n);return V(t)*(1-r)+V(t+1)*r};function ne(e){let t=e,n={W:0,H:0,S:1,t:0,drops:[],clears:[],events:[],feet:[]},r=B(7),i=0,a=6,o=0,s=24,c=1,l=1,u=new Int32Array(1),d=new Int32Array(2856),f=0,p=()=>{c=Math.ceil(n.W/s)+3,l=Math.ceil(n.H/s)+3,u.length!==c*l&&(u=new Int32Array(c*l)),u.fill(-1);let e=n.drops.length;f=e,d.length<e&&(d=new Int32Array(e*2));for(let t=0;t<e;t++){let e=n.drops[t],r=Math.min(c-1,Math.max(0,Math.floor(e.x/s)+1))+c*Math.min(l-1,Math.max(0,Math.floor(e.y/s)+1));d[t]=u[r],u[r]=t}},m=(e,t,r,i,a)=>{let o=Math.ceil(r/s),p=Math.floor(e/s)+1,m=Math.floor(t/s)+1;for(let e=Math.max(0,m-o);e<=Math.min(l-1,m+o);e++)for(let t=Math.max(0,p-o);t<=Math.min(c-1,p+o);t++)for(let r=u[t+c*e];r>=0;r=d[r]){let e=n.drops[r];r<f&&e.side===i&&!e.gone&&a(e)}},h=(e,t,i,a)=>({x:e,y:t,r:i,side:a,born:n.t,seed:r(),hold:N*n.S*(.82+.4*r()),run:!1,vy:0,tail:0,shed:0,gap:12*n.S,px:e,py:t,grow:0,gone:!1}),g=(e,t)=>Math.cbrt(e*e*e+t*t*t),_=(e,t,r,i)=>{let a=null;if(m(e,t,r+N*1.5*n.S,i,n=>{!a&&Math.hypot(n.x-e,n.y-t)<n.r+r*.55&&(a=n)}),!a){let a=h(e,t,r,i);return n.drops.push(a),a}let o=r*r*r/(a.r*a.r*a.r+r*r*r);return a.x+=(e-a.x)*o,a.y+=(t-a.y)*o,a.r=g(a.r,r),a},v=(e,t)=>{let{S:i}=n;if(e.grow>0)return e.r=Math.min(e.grow,e.r+26*i*t),e.r>=e.grow&&(e.grow=0,e.run=!0,n.events.push({kind:`run`,x:e.x})),e.side===1&&n.clears.push({ax:e.x,ay:e.y,bx:e.x,by:e.y,r:e.r*1.25,v:0,k:0}),!0;e.px=e.x,e.py=e.y;let a=Math.min(1,Math.max(0,(e.r-P*i)/(N*.9*i))),o=H(e.seed*91+e.y/(64*i)),s=F*i*(.3+.7*a)*(o<.2?.07:.5+.5*o);if(e.vy+=(s-e.vy)*(1-Math.exp(-t/I)),e.x+=(H(e.seed*53+e.y/(90*i))-.5)*.42*e.vy*t+(H(e.seed*17+e.y/(15*i))-.5)*.12*e.vy*t,e.y+=e.vy*t,e.tail+=(Math.min(e.vy*.13,7*e.r)-e.tail)*(1-Math.exp(-t/.1)),m(e.x,e.y,e.r+N*1.5*i,e.side,t=>{t===e||t.grow>0||Math.hypot(t.x-e.x,t.y-e.y)>e.r*.92+t.r*.5||(e.r=Math.min(N*1.3*i,g(e.r,t.r)),t.gone=!0,e.vy*=.75)}),e.shed+=e.vy*t,e.shed>e.gap){let t=i*(1.2+2.2*r()*r()),a=h(e.x+(r()-.5)*2*i,e.y-e.r*.8-e.tail*r()*.5,t,e.side);n.drops.push(a),e.r=Math.cbrt(Math.max(1,e.r*e.r*e.r-4.5*t*t*t)),e.shed=0,e.gap=i*(7+26*r())}return e.side===1&&(e.r=Math.min(N*1.3*i,g(e.r,.62*i*Math.cbrt(e.vy*t))),n.clears.push({ax:e.px,ay:e.py,bx:e.x,by:e.y,r:e.r*(.5+.34*o),v:0,k:0})),e.r<P*i&&(e.run=!1,e.tail=0,e.vy=0),e.y-e.r-e.tail>n.H+20*i?(e.gone=!0,!1):!0},y=()=>{let e=0;for(let t of n.drops)t.gone||(n.drops[e++]=t);n.drops.length=e;for(let e=0;n.drops.length>2600&&e<n.drops.length;e++){let t=n.drops[e];!t.run&&!t.grow&&t.r<3.2*n.S&&(n.drops.splice(e,1),e--)}},b=e=>{let{W:o,H:s,S:c}=n;if(o){for(n.t+=e,p(),i+=e*z*t.rain*o*s/1e6;i>=1;){--i;let e=r(),t=r()<R,a=c*(t?N*(1.02+.3*r()):1.6+6.4*e**2.4),l=_(r()*o,r()*s*(t?.6:1.02)-.01*s,a,0);a>4.5*c&&n.events.push({kind:`tick`,x:l.x,r:a/c})}if(a-=e*(.4+.6*t.mist),a<=0){a=6+10*r();let e=n.feet.length&&r()<.45?n.feet[Math.floor(r()*n.feet.length)]:null;e?x(e.x,e.y,.72):x((.08+.84*r())*o,(.05+.5*r())*s,1)}for(let t of n.drops)t.gone||(!t.run&&!t.grow&&t.r>t.hold&&(t.run=!0,n.events.push({kind:`slip`,x:t.x})),(t.run||t.grow)&&v(t,e));y()}},x=(e,t,i=1)=>{let a=h(e,t,1.6*n.S,1);return a.grow=(N*.86+1.2*r())*n.S*i,a.hold=1e9,n.drops.push(a),a},S=()=>{let{W:e,H:o,S:c}=n;r=B(7),i=0,a=6,n.t=0,n.drops.length=0,n.clears.length=0,n.events.length=0,s=Math.max(8,24*c),p();let l=Math.min(M*.72,L*e*o/1e6);for(let t=0;t<l;t++){t%48==0&&p();let n=r();_(r()*e,r()*o,c*(1.9+8.4*n**2),0)}let u=t;t={...t,rain:1,mist:0},a=1e9;for(let e=0;e<720;e++)b(1/30);t=u,a=4,n.clears.length=0,n.events.length=0};return{st:n,fit(e,t){return e===n.W&&t===n.H?!1:(n.W=e,n.H=t,n.S=t/900,S(),!0)},setOptions(e){t=e},setFeet(e){n.feet=e},step:b,drip(e,t,n){return o++,x(e,t,n)},weep(e,t){return x(e,t,.62+.2*r())},seeded(){let e=V(o*2+11.3),t=V(o*2+12.7);return[(.14+.72*e)*n.W,(.1+.3*t)*n.H]},settle(e){e.r=e.grow||e.r,e.grow=0,e.run=!0,p();for(let t=0;t<900&&e.run&&!e.gone;t++)v(e,1/30);e.tail=0,y()}}}var U=.6,W=.36,re=.24,ie=.3,G=e=>e.toFixed(4),K=`precision highp float;
precision highp sampler2D;
uniform vec2 uRes;    // hero box, CSS px
uniform float uPx;    // device px per CSS px
#define S (uRes.y / 900.0)
`,q=`
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
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`,ae=`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,oe=`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uBase; uniform sampler2D uGlow; uniform float uExposure;
void main() { vec3 g = texture(uGlow, vUv).rgb; o = vec4((texture(uBase, vUv).rgb + g * g * ${G(12)}) * uExposure, 1.0); }
`,se=`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uExposure;
void main() { o = vec4(pow(texture(uTex, vUv).rgb, vec3(2.2)) * ${G(8)} * uExposure, 1.0); }
`,ce=K+q+`
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev;
uniform float uDt;           // s since the last pass (0: only wipe)
uniform float uBack;         // share of the mist that returns per second
uniform int uCaps;
uniform vec4 uCap[16];  // a stroke from xy to zw, CSS px
uniform vec4 uCapK[16]; // its half-width, what is left of the mist in it (0: wiped clean), 1 for a finger and 0 for a drop
uniform sampler2D uMask; uniform vec4 uMaskMap; uniform float uLetters;   // the patch of breath round the headline
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 m = texture(uPrev, vUv).rg;
  // The headline is read against the mist round it, so a hand must not be able to rub it out: where the breath
  // lies, a wipe only thins the mist, and it is back in a few seconds. (A choice for the page, not for the physics.)
  float breath = (1.0 - texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r) * uLetters;
  // It comes back as fine droplets that seed sooner in some places than others, so a wiped patch closes unevenly.
  m.r = min(1.0, m.r + uDt * uBack * (0.5 + 1.1 * fbm(p / (70.0 * S) + 3.0)) * (1.0 + 9.0 * breath));
  m.g *= exp(-uDt / 7.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uCaps) break;
    vec2 a = uCap[i].xy; vec2 ba = uCap[i].zw - a; vec2 pa = p - a; vec3 k = uCapK[i].xyz;
    float len = length(ba); vec2 dir = len > 0.5 ? ba / len : vec2(0.0, 1.0);
    float d = length(pa - ba * clamp(dot(pa, ba) / max(len * len, 1e-4), 0.0, 1.0));
    // A fingertip does not wipe evenly: it leaves streaks that run the way it went, and a ragged edge.
    float across = dot(pa, vec2(-dir.y, dir.x)) / S + float(i) * 13.0;
    float streak = vnoise(vec2(across * 0.55, dot(a, vec2(0.013, 0.007))));
    float fine = vnoise(vec2(across * 1.9, 4.2));
    float edge = smoothstep(k.x * (1.0 - 0.42 * k.z) - 1.0, k.x + 1.0, d + k.z * k.x * 0.34 * (streak - 0.5));
    float left = k.y + k.z * 0.3 * smoothstep(0.62, 0.9, fine);
    m.r = min(m.r, mix(max(left, 0.5 * breath), 1.0, edge));
    m.g = max(m.g, k.z * (1.0 - edge));
  }
  o = vec4(m, 0.0, 1.0);
}
`,le=`precision highp float;
in vec3 position;
in vec4 aDrop;   // x, y, radius, length of the tail it draws out behind it (CSS px)
in vec4 aKind;   // seed 0..1, side (0 rain, 1 room), how far from round
uniform vec2 uRes;
out vec2 vQ; out vec4 vDrop; out vec4 vKind;
void main() {
  float r = aDrop.z;
  // the quad: a margin round the head, and room above it for the tail
  vec2 q = mix(vec2(-1.3 * r, -1.3 * r - aDrop.w), vec2(1.3 * r, 1.45 * r), position.xy * 0.5 + 0.5);
  vQ = q; vDrop = aDrop; vKind = aKind;
  vec2 p = aDrop.xy + q;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`,ue=`precision highp float;
in vec2 vQ; in vec4 vDrop; in vec4 vKind;
out vec4 o;
const float K = 1.5557;   // a cap that meets the glass at 40 degrees, as water does on a window nobody polished: 1 / sin(40°), in radii
float cap(float d) { return d < 1.0 ? sqrt(K * K - d * d) - sqrt(K * K - 1.0) : 0.0; }
void main() {
  float r = vDrop.z; float tail = vDrop.w; float seed = vKind.x;
  vec2 q = vQ / r;
  float a = atan(q.y, q.x);
  // No drop is a circle: its edge is pinned wherever the glass happened to hold it.
  float wob = 1.0 + vKind.z * (0.075 * sin(2.0 * a + seed * 6.28) + 0.05 * sin(3.0 * a + seed * 17.0) + 0.02 * sin(5.0 * a + seed * 41.0));
  q.y *= q.y < 0.0 ? 1.07 : 0.95;   // and the water hangs low in it
  float h = cap(length(q) / wob) * (1.0 + 0.24 * q.y);
  if (tail > 0.5 && vQ.y < 0.0) {
    // A running drop draws water out behind it, narrowing toward where it came from, never evenly.
    float t = clamp(-vQ.y / tail, 0.0, 1.0);
    float w = mix(0.9, 0.14, pow(t, 0.6)) * (1.0 + 0.14 * sin(t * 11.0 + seed * 30.0));
    h = max(h, 0.8 * w * cap(abs(vQ.x / r) / w) * step(-vQ.y, tail));
  }
  if (h <= 0.0) discard;
  o = vec4(h * r * (1.0 - vKind.y), h * r * vKind.y, r, 1.0);
}
`,de=K+q+`
in vec2 vUv; out vec4 o;
uniform sampler2D uWater;   // r: rain-side height, g: room-side height, b: radius of the drop (CSS px)
uniform sampler2D uMist;    // r: how far the mist has come back, g: a finger's wet
uniform sampler2D uText;    // b: the letters, r: the same, soft
uniform sampler2D uMask;    // 0 round the headline's lines, 1 away from them
uniform vec4 uMaskMap;
uniform sampler2D uLens;    // the city as the lens draws it, focused on the glass: every lamp a disc
uniform sampler2D uWide;    // the city in focus, 2*LON by 2*LAT degrees
uniform vec2 uTexel;        // one texel of uWater
uniform vec3 uCam;          // xy: where the lens's axis meets the frame; z: its focal length (CSS px)
uniform float uLodLens;     // texels of uLens per CSS px
uniform float uThick;       // the mist option
uniform float uLetters;     // 1 while the headline is written on the glass

const vec2 WIDE = vec2(${G(80*Math.PI/180)}, ${G(55*Math.PI/180)});
const vec3 LAMP = vec3(1.0, 0.66, 0.36);                   // the room's lamp: tungsten against the city's blue
const vec3 TO_LAMP = vec3(-0.222, -0.278, 0.935);          // the way a drop's skin must face to mirror it into the lens

vec3 lensAt(vec2 p, float lod) {
  vec2 t = (p - uCam.xy) / uCam.z;
  return textureLod(uLens, vec2(0.5 + t.x / ${G(2*U)}, 0.5 - t.y / ${G(2*W)}), lod).rgb;
}
// The city spread by size px of scatter: four taps on a turned square hide the blocks of a coarse mip.
vec3 spread(vec2 p, float size) {
  float lod = log2(max(size * uLodLens, 1.0)); float r = size * 0.55;
  return 0.25 * (lensAt(p + r * vec2(0.38, 0.92), lod) + lensAt(p + r * vec2(-0.92, 0.38), lod) + lensAt(p + r * vec2(-0.38, -0.92), lod) + lensAt(p + r * vec2(0.92, -0.38), lod));
}

// What is seen through water whose skin slopes by g (rise over run, pointing to where it is thickest). A drop is a
// small strong lens: each point of it turns the lens's whole cone of sight aside, toward the thick of the drop, so
// it holds the city upside down and very small. The cone is as wide as ever, so what the drop holds is the same
// defocused city, not a sharp one. Its middle looks straight on; its rim looks nearly 20 degrees away.
vec3 through(vec2 p, vec2 g, float r) {
  float sl = length(g); float th = atan(sl); float s = 1.333 * sin(th);
  float turn = asin(min(s, 1.0)) - th;
  vec2 dir = g / max(sl, 1e-4);
  vec2 t = (p - uCam.xy) / uCam.z;
  vec2 ang = clamp(atan(t) + turn * dir, -1.2, 1.2);        // the direction looked in, radians right and down of the axis
  vec2 tt = tan(ang);
  float size = max(r * uPx, 1.0);                             // the drop's radius in device px: it sets how small its picture is
  vec2 uvL = vec2(0.5 + tt.x / ${G(2*U)}, 0.5 - tt.y / ${G(2*W)});
  vec3 c = textureLod(uLens, uvL, clamp(log2(0.21 * uLodLens * uCam.z / size) + 0.4, 0.0, 8.0)).rgb;
  // Further off axis than the lens's own picture reaches: the wide panorama, blurred by about the same cone.
  vec2 off = abs(uvL - 0.5) * 2.0; float beyond = max(smoothstep(0.78, 1.0, off.x), smoothstep(0.78, 1.0, off.y));
  if (beyond > 0.0) c = mix(c, textureLod(uWide, clamp(0.5 + vec2(ang.x, -ang.y) / (2.0 * WIDE), 0.004, 0.996), clamp(log2(99.0 / size), 4.6, 8.0)).rgb, beyond);
  // Toward its rim the skin is steep and mirrors more of the dark room than it lets through: a thin dark edge.
  c *= 1.0 - 0.7 * smoothstep(0.62, 0.9, s);
  // The lamp, mirrored small on every drop in the same place: the one thing in the picture lit from this side.
  vec3 n = normalize(vec3(-g, 1.0));
  float glint = smoothstep(0.9982, 0.9996, dot(n, TO_LAMP));
  return c + LAMP * 4.0 * glint * smoothstep(3.0, 6.0, size);
}

// How thick the mist lies, 0..1: most low on the pane and toward its frame, where the glass is coldest, in uneven
// patches; least high in the middle.
float lies(vec2 p) {
  vec2 u = p / uRes;
  float low = smoothstep(0.1, 0.95, u.y); float side = smoothstep(0.3, 0.5, abs(u.x - 0.5));
  return clamp(0.68 + 0.24 * low + 0.1 * side + 0.42 * (fbm(p / (250.0 * S) + 5.0) - 0.5), 0.0, 1.0);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  // the water: both sides' heights here and one texel to each side, for the slope of each
  vec3 w = texture(uWater, vUv).rgb;
  vec2 wl = texture(uWater, vUv - vec2(uTexel.x, 0.0)).rg; vec2 wr = texture(uWater, vUv + vec2(uTexel.x, 0.0)).rg;
  vec2 wu = texture(uWater, vUv + vec2(0.0, uTexel.y)).rg; vec2 wd = texture(uWater, vUv - vec2(0.0, uTexel.y)).rg;
  float e = 2.0 / uPx;
  vec2 gFar = vec2(wr.r - wl.r, wd.r - wu.r) / e; vec2 gNear = vec2(wr.g - wl.g, wd.g - wu.g) / e;

  // the far side: the city, and the rain standing on the glass in front of it
  vec3 col = lensAt(p, 0.0);
  if (w.r > 0.0) col = mix(col, through(p, gFar, w.b), smoothstep(0.0, 0.3, w.r));

  // the mist. The letters are where it is not: sampled with a small wander, so no stroke has a ruled edge.
  vec2 mist = texture(uMist, vUv).rg;
  vec2 wander = (vec2(vnoise(p / (6.0 * S)), vnoise(p / (6.0 * S) + 31.7)) - 0.5) * 2.2 * S;
  vec3 ink = texture(uText, vec2(p.x + wander.x, uRes.y - p.y - wander.y) / uRes).rgb * uLetters;
  float breath = (1.0 - texture(uMask, p * uMaskMap.xy + uMaskMap.zw).r) * uLetters;   // someone breathed on the glass to write on it
  // It returns as specks before it is a film again: the grain only shows while a patch is closing.
  float back = clamp(mist.r + (vnoise(p * uPx / 1.3) - 0.5) * 0.36 * sin(3.14159 * mist.r), 0.0, 1.0);
  float fog = back * clamp(lies(p) * uThick + 0.7 * breath, 0.0, 0.96) * (1.0 - ink.b);
  // Beside each stroke the water that was pushed aside stands in a row of fine beads, each a clear spot in the mist.
  vec2 cell = p / (3.3 * S); vec2 id = floor(cell);
  float bead = smoothstep(0.4, 0.2, length(fract(cell) - 0.5 - 0.28 * (vec2(hash(id), hash(id + 9.0)) - 0.5))) * step(0.42, hash(id + 3.0));
  float rim = ink.r * (1.0 - ink.b);
  fog *= 1.0 - 0.8 * bead * smoothstep(0.08, 0.5, rim);
  // a finger leaves its own wet behind: finer beads, for a few seconds
  fog *= 1.0 - 0.5 * bead * mist.g * (1.0 - back);
  // Mist is a diffuser: it hands on the light behind it, spread wide (most of it nearby, some of it very far) and
  // dimmer, because much of what it scatters never reaches the lens; and it catches a little of the room's lamp.
  // The lamp stands to the left, so its share falls off across the pane; and where the breath lies the mist is at
  // its thickest and whitest, which is what the writing is read against.
  vec3 room = mix(LAMP, vec3(0.8), 0.3) * (mix(0.024, 0.006, smoothstep(0.0, 0.8, p.x / uRes.x)) + 0.17 * breath);
  vec3 glow = (0.6 * spread(p, 44.0 * S) + 0.4 * spread(p, 190.0 * S)) * vec3(0.56, 0.58, 0.63) + room;
  // It is droplets, too small to see singly but not evenly small: a grain the lens only just resolves, which stays put.
  float grit = 0.5 * vnoise(p * uPx / 1.2 + 11.0) + 0.5 * vnoise(p / (3.4 * S) + 5.0);
  col = mix(col, glow * (0.94 + 0.12 * grit), clamp(fog * (0.97 + 0.06 * grit), 0.0, 1.0));

  // the near side: water in front of the mist, so nothing softens it
  float near = smoothstep(0.0, 0.3, w.g);
  if (near > 0.0) col = mix(col, through(p, gNear, w.b), near);
  o = vec4(col, 1.0);
}
`,fe=`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec3 c = 0.25 * (texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  float l = max(c.r, max(c.g, c.b));
  o = vec4(min(c, vec3(24.0)) * smoothstep(1.6, 4.0, l), 1.0);
}
`,pe=`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uStep;
void main() {
  vec4 c = texture(uTex, vUv) * 0.2270;
  c += (texture(uTex, vUv + uStep * 1.3846) + texture(uTex, vUv - uStep * 1.3846)) * 0.3162;
  c += (texture(uTex, vUv + uStep * 3.2308) + texture(uTex, vUv - uStep * 3.2308)) * 0.0703;
  o = c;
}
`,me=e=>`precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uFrame; uniform float uBloomK;
${e}
float rnd(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 15; n *= 2246822519u; n ^= n >> 13;
  return float(n) * (1.0 / 4294967295.0);
}
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
  // lens: a fast 50 mm wide open loses a good stop toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.9;
  float fall = 1.0 / (1.0 + dot(q, q) * 0.9); c *= mix(1.0, fall * fall, 0.5);
  c = AgXToneMapping(c);
  // grade, on display light: the flat transform given back some contrast and colour; night stays cool in the shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.3);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
  c *= mix(vec3(0.93, 0.98, 1.07), vec3(1.03, 1.0, 0.97), smoothstep(0.0, 0.5, l));
  c = max(c, 0.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // grain: a night exposure is a noisy one. Strongest in the mid-tones, and a last half-bit of dither against banding
  vec2 px = gl_FragCoord.xy + uFrame * vec2(37.0, 91.0);
  float gr = rnd(px) + rnd(px + 71.0) - 1.0;
  float lum = dot(c, vec3(0.3, 0.6, 0.1));
  c += gr * 0.024 * (0.4 + 0.6 * (1.0 - abs(2.0 * lum - 1.0)));
  c += (rnd(px + 13.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`,he=`./assets/rain/`,ge=.3,_e=2,ve=1/60;async function J(e,{low:t=!1}={}){let n=new l,r=(e,t)=>n.loadAsync(he+e).then(e=>(e.colorSpace=t?p:``,e.wrapS=e.wrapT=b,e.minFilter=y,e.generateMipmaps=!1,e)),i=await Promise.all([r(`city_base.webp`,!0),r(`city_glow.webp`),r(`city_wide.webp`)]),a=new te({canvas:e,antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:`high-performance`});if(a.autoClear=!1,!a.extensions.has(`EXT_color_buffer_float`)&&!a.extensions.has(`EXT_color_buffer_half_float`)){a.dispose();for(let e of i)e.dispose();throw Error(`no float render targets`)}let o=(e=!1)=>new d(4,4,{type:C,depthBuffer:!1,minFilter:e?j:y,magFilter:y,generateMipmaps:e}),s=o(!0),A=o(!0),N=o(),P=o(),F=o(),I=o(),L=o(),R=o();s.setSize(i[0].image.width,i[0].image.height),A.setSize(i[2].image.width,i[2].image.height);let z=new k(document.createElement(`canvas`));z.minFilter=z.magFilter=y,z.generateMipmaps=!1;let B=new E(new Uint8Array(4).fill(255),2,2,T,h);B.minFilter=B.magFilter=y,B.unpackAlignment=1,B.needsUpdate=!0;let V={uRes:{value:new f(1,1)},uPx:{value:1},uFrame:{value:0},uBase:{value:i[0]},uGlow:{value:i[1]},uExposure:{value:ge},uPrev:{value:null},uDt:{value:0},uBack:{value:ve},uCaps:{value:0},uCap:{value:Array.from({length:16},()=>new g)},uCapK:{value:Array.from({length:16},()=>new g)},uWater:{value:N.texture},uMist:{value:null},uText:{value:z},uMask:{value:B},uMaskMap:{value:new g(1,1,0,0)},uLens:{value:s.texture},uWide:{value:A.texture},uTexel:{value:new f},uCam:{value:new m},uLodLens:{value:1},uThick:{value:1},uLetters:{value:1},uScene:{value:I.texture},uBloom:{value:L.texture},uTex:{value:null},uStep:{value:new f},uBloomK:{value:t?0:.35},toneMappingExposure:{value:1}},H=(e,t)=>new c({glslVersion:ee,uniforms:V,vertexShader:ae,fragmentShader:e,depthTest:!1,depthWrite:!1,blending:0,...t}),ne=new v;ne.setAttribute(`position`,new w(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));let W=new O,G=e=>{let t=new u(ne,H(e));return t.frustumCulled=!1,t},K={lens:G(oe),wide:G(se),mist:G(ce),scene:G(de),bright:G(fe),blur:G(pe),film:G(me(D.tonemapping_pars_fragment))},q=(e,t)=>{a.setRenderTarget(t),a.render(e,W)},J=new _;J.setAttribute(`position`,new w(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),J.setIndex([0,1,2,0,2,3]);let Y=new S(new Float32Array(M*4),4);Y.setUsage(x);let X=new S(new Float32Array(M*4),4);X.setUsage(x),J.setAttribute(`aDrop`,Y),J.setAttribute(`aKind`,X),J.instanceCount=0;let Z=new u(J,new c({glslVersion:ee,uniforms:V,vertexShader:le,fragmentShader:ue,depthTest:!1,depthWrite:!1,side:2,transparent:!0,blending:5,blendEquation:104,blendSrc:201,blendDst:201,blendEquationAlpha:104,blendSrcAlpha:201,blendDstAlpha:201}));Z.frustumCulled=!1;let ye=0,Q=0,be=1,xe=0,Se=!1,$=!1,Ce=[],we=(e,t,n,r)=>{a.setRenderTarget(e),a.setClearColor(Math.round(t*255)<<16|Math.round(n*255)<<8|Math.round(r*255),1),a.clear(!0,!1,!1)},Te=(e,t)=>{let n=0;do{let r=0;for(;r<16&&n<e.length;r++,n++){let t=e[n];V.uCap.value[r].set(t.ax,t.ay,t.bx,t.by),V.uCapK.value[r].set(t.r,t.v,t.k,0)}V.uCaps.value=r,V.uDt.value=t,t=0,V.uPrev.value=P.texture,q(K.mist,F);let i=P;P=F,F=i}while(n<e.length);V.uMist.value=P.texture},Ee=()=>{we(P,1,0,0),Te(Ce,0),$=!0};return{resize(e,t,n){let r=e!==ye||t!==Q;ye=e,Q=t,be=t/900;let i=Math.max(2,Math.round(e*n)),o=Math.max(2,Math.round(t*n));a.setPixelRatio(1),a.setSize(i,o,!1),I.setSize(i,o),N.setSize(i,o),L.setSize(Math.ceil(i/4),Math.ceil(o/4)),R.setSize(Math.ceil(i/4),Math.ceil(o/4)),V.uRes.value.set(e,t),V.uPx.value=i/e,V.uTexel.value.set(1/i,1/o);let c=t>e,l=t/(2*(c?ie:re))*Math.max(1,e/t/(U/re)*1.02);V.uCam.value.set(e*.5+(c?.1*l:0),t*.4,l),V.uLodLens.value=s.width/(2*U*l),r&&(P.setSize(Math.ceil(e/_e),Math.ceil(t/_e)),F.setSize(Math.ceil(e/_e),Math.ceil(t/_e)),$=!1)},mask(e){let t=Math.ceil(ye/8)+1,n=Math.ceil(Q/8)+1,r=new Uint8Array(t*n).fill(255);if(e.length)for(let i=0;i<n;i++)for(let n=0;n<t;n++){let a=1e9,o=n*8,s=i*8;for(let t of e){let e=Math.max(t.l-o,o-t.r),n=Math.max(t.t-s,s-t.b);a=Math.min(a,Math.hypot(Math.max(e,0),Math.max(n,0))+Math.min(Math.max(e,n),0))}let c=Math.min(1,Math.max(0,(a+10)/(110*be)));r[i*t+n]=Math.round(255*c*c*(3-2*c))}B.dispose(),B.image={data:r,width:t,height:n},B.needsUpdate=!0,V.uMaskMap.value.set(1/(8*t),1/(8*n),.5/t,.5/n)},text(e,t){let n=e(z.image);return z.needsUpdate=!0,V.uLetters.value=+!!t,n},history(e){Ce=e,$=!1},restore(){Se=!1,$=!1},frame(e,n,r,a,o){Se||=(V.uTex.value=i[2],q(K.lens,s),q(K.wide,A),!0),$||Ee(),(o>0||a.length)&&Te(a,o),V.uThick.value=n.mist;let c=0,l=Y.array,u=X.array;for(let e of r.drops){if(c>=2600)break;let t=e.side?1:Math.min(1,.45+(r.t-e.born)/.12);l[c*4]=e.x,l[c*4+1]=e.y,l[c*4+2]=e.r*t,l[c*4+3]=e.tail,u[c*4]=e.seed,u[c*4+1]=e.side,u[c*4+2]=Math.min(1,e.r/(8*be))*(e.run?.5:1),u[c*4+3]=0,c++}J.instanceCount=c,Y.needsUpdate=!0,X.needsUpdate=!0,we(N,0,0,0),c&&q(Z,N),q(K.scene,I),t||(V.uTex.value=I.texture,q(K.bright,L),V.uTex.value=L.texture,V.uStep.value.set(1/L.width,0),q(K.blur,R),V.uTex.value=R.texture,V.uStep.value.set(0,1/L.height),q(K.blur,L)),V.uFrame.value=e.still?0:xe++%240,q(K.film,null)},dispose(){for(let e of[s,A,N,P,F,I,L,R,B,z,...i])e.dispose();for(let e of Object.values(K))e.material.dispose();Z.material.dispose(),J.dispose(),ne.dispose(),a.forceContextLoss(),a.dispose()}}}function Y(e,t,n,r){let i=t.getBoundingClientRect(),a=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4e6/Math.max(1,i.width*i.height))),o=Math.max(2,Math.round(i.width*a)),s=Math.max(2,Math.round(i.height*a));(e.width!==o||e.height!==s)&&(e.width=o,e.height=s);let c=e.getContext(`2d`,{willReadFrequently:!0});c.setTransform(1,0,0,1,0,0),c.globalCompositeOperation=`source-over`,c.shadowColor=`transparent`,c.fillStyle=`#000`,c.fillRect(0,0,o,s);let l=n.firstChild;if(r||!l)return[];c.globalCompositeOperation=`lighter`;let u=o+4e3,d=getComputedStyle(n),f=parseFloat(d.fontSize),p=`${d.fontWeight} ${f}px ${d.fontFamily}`,m=[],h=document.createRange(),g=l.textContent,_=/\S+/g,v;for(;v=_.exec(g);)h.setStart(l,v.index),h.setEnd(l,v.index+v[0].length),m.push([v[0],h.getBoundingClientRect()]);let y=[],b=(e,t,n)=>{c.save(),c.font=p,c.textBaseline=`alphabetic`,`letterSpacing`in c&&(c.letterSpacing=d.letterSpacing),`fontStretch`in c&&(c.fontStretch=`expanded`);let r=c.measureText(e),o=r.fontBoundingBoxAscent??f*.9,s=r.fontBoundingBoxDescent??f*.25,l=t.height/(o+s);c.translate((t.left-i.left)*a-n,(t.top-i.top+o*l)*a),c.scale(t.width/r.width*a,a),c.fillText(e,0,0),c.restore(),n||y.push({l:t.left-i.left,r:t.right-i.left,y:t.top-i.top+o*l})};c.fillStyle=`#00f`;for(let[e,t]of m)b(e,t,0);c.shadowColor=`#f00`,c.shadowBlur=3.5*a,c.shadowOffsetX=u,c.shadowOffsetY=0,c.fillStyle=`#000`;for(let[e,t]of m)b(e,t,u);c.shadowColor=`transparent`;let x=[],S=Math.max(...y.map(e=>e.y));for(let e of y){if(e.y<S-2)continue;let t=Math.round((e.y-2)*a),n=Math.max(0,Math.floor(e.l*a)),r=Math.min(o-n,Math.ceil((e.r-e.l)*a));if(t<0||t>=s||r<1)continue;let i=c.getImageData(n,t,r,1).data;for(let t=0;t<r;t+=Math.max(1,Math.round(5*a)))i[t*4+2]>128&&x.push({x:(n+t)/a,y:e.y+1})}return x}function X(e){let t=e.noise(),n=e.filter(`lowpass`,300,.5),r=e.gain(.1),i=e.gain(1),a=e.filter(`bandpass`,3400,.6),o=e.gain(.012);t.connect(n),n.connect(r),r.connect(i),t.connect(a),a.connect(o),o.connect(i),i.connect(e.dry),e.sway(i.gain,.07,.28),e.sway(i.gain,.19,.14),e.sway(a.frequency,.045,700),e.sway(n.frequency,.031,70);let s=-1;return{tick(t,n=5){e.burst({f:2600-190*n,to:900,q:1.6,attack:.002,decay:.05,gain:.03+.004*n,pan:t,send:.25})},slip(t){e.burst({f:1500,to:700,q:2.5,attack:.02,decay:.16,gain:.05,pan:t,send:.2})},drip(t){e.note({f:520,to:880,attack:.004,decay:.07,gain:.07,pan:t,send:.3}),e.note({f:1240,to:1700,at:.05,attack:.003,decay:.05,gain:.03,pan:t,send:.3})},run(t){e.burst({f:1900,to:800,q:3,attack:.03,decay:.34,gain:.075,pan:t,send:.3})},wipe(t,n=400){let r=e.ctx.currentTime;if(r-s<.16)return;s=r;let i=700+Math.min(1400,n*.7);e.burst({f:i,to:i*1.25,q:1.3,attack:.05,decay:.2,gain:.05,pan:t,send:.15})}}}var Z={reach:90,rain:1,mist:1,text:!0,sound:!1},ye=[{id:`reach`,label:`Wipe width`,min:30,max:220,step:10,value:90,unit:`px`},{id:`rain`,label:`Rain`,min:0,max:3,step:.1,value:1,unit:`×`},{id:`mist`,label:`Mist`,min:0,max:1.4,step:.05,value:1,unit:`×`}],Q=[{id:`drip`,label:`Let a drop run`}],be=520,xe=(e,t)=>e===null||e===``||!Number.isFinite(+e)?t:+e,Se=e=>({reach:o(xe(e.reach,Z.reach),30,220),rain:o(xe(e.rain,Z.rain),0,3),mist:o(xe(e.mist,Z.mist),0,1.4),text:e.text!==!1,sound:e.sound===!0});function $(o,s={}){let c=Se({...Z,...s}),l=a(),u=n(),d=r()===`low`,f=new AbortController,{signal:p}=f;o.classList.add(`rain`),o.classList.toggle(`is-still`,l),o.classList.toggle(`is-bare`,!c.text),o.innerHTML=`
    <canvas class="rain__canvas" aria-hidden="true"></canvas>
    <h1 class="rain__title">Stay in tonight</h1>
    <button type="button" class="rain__cue">Let a drop run</button>
    <p class="rain__note"><span>Lantern House · home hero</span><span>Shanghai · 2026</span></p>
    <p class="sr-only" role="status"></p>`;let m=o.querySelector(`canvas`),h=o.querySelector(`h1`),g=o.querySelector(`button`),_=o.querySelector(`[role="status"]`),v={W:0,H:0,still:l},y=ne(c),b=y.st,x=null,S=null,C=!1,w=!1,T=1,E=0,ee=0,D=null,O=null,te=0,k=[],A=t(X,{room:.9});A.set(c.sound);let j=e=>e/Math.max(1,v.W)*2-1,M=(e=0)=>{if(E=0,x&&!w&&v.W){for(let e of b.clears)k.push(e);b.clears.length=0,x.frame(v,c,b,k,e),k.length=0}},N=()=>{!l&&S||E||(E=requestAnimationFrame(()=>M(0)))},P=()=>{if(!x||!v.W)return;let e=o.getBoundingClientRect(),t=document.createRange();t.selectNodeContents(h);let n=t=>({l:t.left-e.left,t:t.top-e.top,r:t.right-e.left,b:t.bottom-e.top});x.mask(c.text?[...t.getClientRects()].map(n):[]),y.setFeet(x.text(e=>Y(e,o,h,!c.text),c.text))},F=()=>{let e=[],t=[[.71,.08,.3],[.24,.16,.5],[.88,.3,.05],[.47,.05,.62]].map(([e,t,n])=>[e*v.W,t*v.H,n]);[[.23,.4],[.71,.15]].forEach(([e,n])=>{let r=b.feet[Math.floor(e*b.feet.length)];r&&t.push([r.x,r.y,n,.7])});let{W:n,H:r}=v,i=r/900,a=Math.min(n,1.9*r),o=e=>({x:n*.5+a*(0+.37*e),y:r*(.41-.2*Math.sin(Math.PI*(.1+.62*e)))});for(let t=0;t<14;t++){let n=o(t/14),r=o((t+1)/14);e.push({ax:n.x,ay:n.y,bx:r.x,by:r.y,r:74*i,v:.04,k:1})}[.3,.74].forEach((e,n)=>{let r=o(e);t.push([r.x,r.y+66*i,.08+.2*n,.72])}),t.forEach(([t,n,r,i])=>{y.settle(y.drip(t,n,i));for(let t of b.clears)e.push({...t,v:r});b.clears.length=0}),x?.history(e)},I=()=>{let e=o.clientWidth,t=o.clientHeight;if(!e||!t)return;v.W=e,v.H=t;let n=y.fit(e,t);x?.resize(e,t,T),n&&(L=!1),P(),x&&!L&&(F(),L=!0),N()},L=!1,R=(e,t)=>{if(!x||w||!v.W)return;let n=y.drip(e,t);ee++,_.textContent=`Drop ${ee} runs down the glass and clears a track through the mist.`,A.play(`drip`,j(e)),l&&y.settle(n),N()},z=()=>R(...y.seeded()),B=Math.min(devicePixelRatio||1,2),V=Math.min(B,Math.max(1,Math.sqrt(22e5/Math.max(1,o.clientWidth*o.clientHeight)))),H=i({min:Math.min(V,Math.max(.6,.5*B)),max:V,onChange:e=>{T=e,x&&v.W&&x.resize(v.W,v.H,T)}}),U=e=>{if(H.tick(e),y.step(e),D&&O&&(D.x!==O.x||D.y!==O.y)){let t=Math.hypot(D.x-O.x,D.y-O.y);k.push({ax:O.x,ay:O.y,bx:D.x,by:D.y,r:c.reach/2,v:0,k:1}),A.play(`wipe`,j(D.x),t/Math.max(e,.001)),te+=t*c.mist,te>be*v.H/900&&(te=0,y.weep((O.x+D.x)/2,Math.max(O.y,D.y)+c.reach*.42))}O=D&&{x:D.x,y:D.y};for(let e of b.events)e.kind===`tick`?e.r>4.6&&A.play(`tick`,j(e.x),e.r):A.play(e.kind,j(e.x));b.events.length=0,M(e)};J(m,{low:d}).then(t=>{C?t.dispose():(x=t,document.fonts?.ready.then(()=>{C||(P(),N())}),I(),M(0),cancelAnimationFrame(E),E=0,o.classList.add(`is-ready`),l||(S=e(o,U)))}).catch(e=>{C||(console.info(`Night rain: no WebGL2 scene, the headline stands on the still ground.`,e?.message||e),o.classList.add(`is-static`))}),m.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),w=!0,o.classList.add(`is-static`)},{signal:p}),m.addEventListener(`webglcontextrestored`,()=>{w=!1,o.classList.remove(`is-static`),x&&v.W&&(x.restore(),x.resize(v.W,v.H,T),P()),N()},{signal:p});let W=new ResizeObserver(I);W.observe(o),I();let re=e=>{let t=m.getBoundingClientRect();return{x:e.clientX-t.left,y:e.clientY-t.top}};if(!l&&u){o.addEventListener(`pointermove`,e=>{e.pointerType!==`touch`&&(D=re(e))},{signal:p});for(let e of[`pointerleave`,`pointercancel`])o.addEventListener(e,()=>{D=null},{signal:p})}return o.addEventListener(`click`,e=>{if(!e.target.closest(`button`)){let t=re(e);R(t.x,t.y)}},{signal:p}),g.addEventListener(`click`,z,{signal:p}),{update(e={}){let t=c;c=Se({...c,...e}),A.set(c.sound),y.setOptions(c),c.text!==t.text&&(o.classList.toggle(`is-bare`,!c.text),P()),N()},action(e){e===`drip`&&z()},destroy(){C=!0,f.abort(),S?.(),W.disconnect(),cancelAnimationFrame(E),A.destroy(),x?.dispose(),x=null,o.classList.remove(`rain`,`is-ready`,`is-still`,`is-static`,`is-bare`),o.innerHTML=``}}}window.hero=$(document.getElementById(`hero`),{sound:s.get()}),A(window.hero,{controls:ye,actions:Q});