import{a as e,c as t,l as n,o as r,r as i,s as a,t as o,u as s}from"./kit-C3B5HmhP.js";import{A as c,C as l,G as u,H as d,K as f,N as p,T as m,U as h,V as g,W as _,_ as v,a as y,b,d as x,h as S,i as C,j as ee,l as te,m as w,o as T,r as ne,t as E,v as D,x as re,y as O}from"./chrome-NgyE--Yh.js";var k=4096,A=30,j=.42,M=4.4,N=1/60,P=e=>()=>{let t=e+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296};function F(){let e=P(20261118),t={W:0,H:0,drops:[],buf:new Float32Array(k*6),count:0,time:0,landed:[]},n=0,r=0,i=0,a=null,s=(n,r,i,a=!1)=>({x:n,y:r,r:i,born:t.time,seed:e(),run:!1,vx:0,vy:0,wait:0,sway:0,lean:0,gone:0,gap:0,stretch:1,bead:a,hold:9.5+3.5*e()}),c=(e,t=0)=>{e.run||(e.run=!0,e.wait=t,e.gap=e.r,e.gone=0,e.bead=!1)},l=(t,n,r,i)=>{let a=t.r**3,o=i**3,s=o/(a+o);t.x+=(n-t.x)*s,t.y+=(r-t.y)*s*(t.run?.35:1),t.r=Math.cbrt(a+o),!t.run&&t.r>t.hold&&c(t,.1+.5*e())},u=(e,n,r)=>{for(let i of t.drops){let t=i.r+r*.6;if((i.x-e)**2+(i.y-n)**2<t*t)return l(i,e,n,r),i}let i=s(e,n,r);return t.drops.push(i),i};function d(i,d,f=null){let{W:p,H:m,drops:h}=t,g=p*m/1e6;for(f||(t.time+=i),n+=i*A*d*g;n>=1;){--n;let r=u(e()*p,e()*m,1.9+8.2*e()**3.6);a===null&&t.landed.length<8&&t.landed.push(r.x/p)}for(r+=i*j*d*Math.max(g,.35);r>=1;){--r;let t=e()<.55;c(u(e()*p,t?-14-30*e():e()*m*.6,9.6+3.6*e()),t?0:.6*e())}for(let n=h.length-1;n>=0;n--){let r=h[n];if(f&&r!==f)continue;if(!r.run){r.r-=i*(r.bead?.62:.2)/r.r,r.r<1.15&&h.splice(n,1);continue}if(r.wait>0)r.wait-=i,r.vy*=Math.exp(-i*16);else{let t=2.3*r.r*r.r;r.vy+=(t-r.vy)*Math.min(1,i*4.5),e()<i*(r.r<7?1.9:r.r<10?.7:.22)&&(r.wait=.1+.75*e())}r.sway-=i,r.sway<=0&&(r.sway=.25+.9*e(),r.lean=(e()-.5)*(e()<.25?.5:.12)),r.vx+=(r.lean*r.vy-r.vx)*Math.min(1,i*7);let c=r.vx*i,l=r.vy*i,u=Math.hypot(c,l);if(r.x+=c,r.y+=l,r.gone+=u,r.stretch+=(1+Math.min(1.25,r.vy/300)-r.stretch)*Math.min(1,i*9),r.r-=u*.0042,r.gone>r.gap&&r.vy>30){r.gone=0,r.gap=r.r*(.55+1.9*e()**1.6);let t=o(r.r*(.13+.2*e()),1.3,3.4);h.push(s(r.x+(e()-.5)*r.r*.45,r.y-r.r*(.75+.5*r.stretch),t,!0)),r.r=Math.cbrt(Math.max(1,r.r**3-t**3))}a&&a.push(r.x,r.y,r.r,t.time),r.y-3.5*r.r>m?h.splice(n,1):r.r<M&&(r.run=!1,r.vx=r.vy=0,r.stretch=1,r.hold=99)}for(let e of h)if(!(!e.run||f&&e!==f))for(let t=h.length-1;t>=0;t--){let n=h[t];if(n===e||n.r>e.r||n.bead&&n.y<e.y)continue;let r=e.r+n.r*.5;Math.abs(n.x-e.x)<r&&(n.x-e.x)**2+(n.y-e.y)**2<r*r&&(l(e,n.x,n.y,n.r),n.r=0)}for(let e=h.length-1;e>=0;e--)h[e].r===0&&h.splice(e,1);h.length>4032&&h.splice(0,h.length-4032)}function f(){let e=t.buf,n=0;for(let r of t.drops)e[n++]=r.x,e[n++]=r.y,e[n++]=r.r*o(.35+(t.time-r.born)*7,.35,1),e[n++]=r.seed,e[n++]=r.stretch,e[n++]=1;return t.count=t.drops.length,t.count}return{st:t,fit(e,n){if(t.W&&t.H)for(let r of t.drops)r.x*=e/t.W,r.y*=n/t.H;t.W=e,t.H=n},advance(e,t){for(i=Math.min(i+e,N*4);i>=N;)d(N,t),i-=N},write:f,soak(e,n,r){t.drops.length=0,a=[];let i=t.time;for(let o=0;o<e;o+=1/30)t.time-i<e-r&&(a.length=0),d(1/30,n);let s=new Float32Array(Math.min(k,a.length/4)*6),c=a.length/4-s.length/6;for(let e=0;e<s.length/6;e++){let n=(c+e)*4,i=1-(t.time-a[n+3])/r;s.set([a[n],a[n+1],a[n+2],0,1,-o(i,.02,1)],e*6)}return a=null,s},send(n,r){let i=u(o(n,8,t.W-8),o(r,-20,t.H-8),10.4+2.2*e());i.r=Math.max(i.r,10.4),c(i),i.wait=0,i.vy=60;for(let n=0;n<5;n++){let n=e()*6.283,r=i.r*(1.5+1.6*e());t.drops.push(s(i.x+Math.cos(n)*r,i.y+Math.sin(n)*r*.8,1.3+1.4*e(),!0))}return i},settle(e){a=[];for(let n=0;n<1500&&e.run&&t.drops.includes(e);n++)d(1/60,0,e);let n=new Float32Array(Math.min(k,a.length/4)*6);for(let e=0;e<n.length/6;e++)n.set([a[e*4],a[e*4+1],a[e*4+2],0,1,-1],e*6);return a=null,n},spill(n,r){n>0&&n<t.W&&r>0&&r<t.H&&u(n,r,1.4+1.9*e()**2)},spot(){return[t.W*(.3+.5*e()),t.H*(.1+.25*e())]}}}var I={bokeh:6,haze:4,lens:32},ie=`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,L=`
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`,ae=`
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
`,oe=`
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
`,se=`
precision highp float;
uniform sampler2D uPrev, uDrops;
uniform vec2 uRes, uA, uB, uDir;
uniform float uGrow, uFogRate, uMistRate, uDt, uReach, uWipe, uReset, uBreath, uSeed, uAlong, uStamp;
in vec2 vUv;
out vec4 o;
${L}
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
`,R=`
precision highp float;
#define LAMPS 8
uniform sampler2D uBokeh, uHaze, uLens, uState, uDrops, uMist;
uniform vec2 uRes, uShift;
uniform vec4 uCover;
uniform float uRatio, uSeed, uFog, uGrain, uExposure;
uniform vec4 uLamp[LAMPS];    // x, y in the picture (0..1, y up), brightness, how far out of focus (1: as the far shore)
uniform vec3 uLampCol[LAMPS];
in vec2 vUv;
out vec4 o;
${L}
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
  vec3 sharp = cube(texture(uBokeh, bg + wet).rgb) * ${I.bokeh.toFixed(1)};
  vec3 haze = cube(texture(uHaze, bg).rgb) * ${I.haze.toFixed(1)};
  // what moves out there: the lamps of the boats on the river, each a disc like every other lamp in the picture
  // (the same radius, the same brighter rim), and a glow where the glass is misted
  for (int i = 0; i < LAMPS; i++) {
    vec2 to = (bg - uLamp[i].xy) * vec2(1.0, ${(1400/2048).toFixed(4)}) / (0.031 * uLamp[i].w);
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
  vec4 m = texture(uMist, p / ${512 .toFixed(1)});
  float settle = st.g * (0.35 + 1.1 * vnoise(p * 0.009 + 11.0) * vnoise(p * 0.031 + 5.0) * 1.9);
  float bead = m.b * smoothstep(m.a - 0.03, m.a + 0.03, settle) * step(0.004, st.g);
  if (bead > 0.0) {
    vec2 n = (m.rg * 2.0 - 1.0) * vec2(1.0, -1.0);
    float rim = dot(n, n);
    vec3 lens = cube(textureLod(uLens, vec2(0.5 + behind.x - n.x * 0.14, 0.5 - behind.y + n.y * 0.14), 5.0).rgb) * ${(I.lens*.22).toFixed(1)};
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
    vec3 lens = cube(textureLod(uLens, vec2(0.5 + behind.x - n.x * k, 0.5 - behind.y + n.y * k), lod).rgb) * ${(I.lens*.6).toFixed(1)};
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
`,z={size:1024,density:2};function ce(){let e=z.size,n=new Uint8Array(e*e*4);for(let t=0;t<e*e;t++)n[t*4]=n[t*4+1]=128,n[t*4+3]=255;let r=.6*z.density,i=2.7*z.density,a=Math.ceil(i*2.4),o=Math.ceil(e/a),s=Array.from({length:o*o},()=>[]),c=3e4;for(let l=0;l<c;l++){let u=r+(i-r)*(1-l/c)**4.5,d=t(l*3+1)*e,f=t(l*3+2)*e,p=Math.floor(d/a),m=Math.floor(f/a),h=!0;for(let t=-1;t<=1&&h;t++)for(let n=-1;n<=1&&h;n++)for(let r of s[(m+t+o)%o*o+(p+n+o)%o]){let t=Math.abs(r.x-d),n=Math.abs(r.y-f);if(t>e/2&&(t=e-t),n>e/2&&(n=e-n),t*t+n*n<((r.r+u)*1.3+1.2)**2){h=!1;break}}if(!h)continue;s[m*o+p].push({x:d,y:f,r:u});let g=Math.round(255*Math.min(.96,.08+.52*t(l*3+3)+.4*(u-r)/(i-r))),_=.86+.3*t(l*3+7),v=Math.ceil(u*1.2+2);for(let t=-v;t<=v;t++)for(let r=-v;r<=v;r++){let i=Math.floor(d)+r,a=Math.floor(f)+t,o=(i+.5-d)*_,s=(a+.5-f)/_,c=Math.hypot(o,s)/u,l=((a%e+e)%e*e+(i%e+e)%e)*4;if(c>=1+.5/u){n[l+2]===0&&c<1+2/u&&(n[l+3]=g);continue}let p=Math.min(1,Math.max(0,(1-c)*u+.5));p*255<n[l+2]||(n[l]=Math.round(127.5+o/u*127.5/Math.max(c,1)),n[l+1]=Math.round(127.5+s/u*127.5/Math.max(c,1)),n[l+2]=Math.round(p*255),n[l+3]=g)}}return n}var le=`./assets/rain/`,ue=2048/1400,de=.5,fe=.1;async function B(e,{low:t=!1}={}){let n=new ne({canvas:e,antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:`high-performance`}),r=n.getContext();if(!r.isContextLost()&&!r.getExtension(`EXT_color_buffer_float`)&&!r.getExtension(`EXT_color_buffer_half_float`))throw n.dispose(),Error(`rain: no float render targets`);n.autoClear=!1,n.setPixelRatio(1);let i=new g,a=e=>i.loadAsync(le+e).then(e=>(e.colorSpace=``,e.minFilter=e.magFilter=b,e.generateMipmaps=!1,e)),[o,s,E]=await Promise.all([a(`bokeh.webp`),a(`haze.webp`),a(`lens.webp`)]).catch(e=>{throw n.dispose(),e}),A=document.createElement(`canvas`);A.width=E.image.width,A.height=E.image.height;let j=A.getContext(`2d`,{willReadFrequently:!0});j.drawImage(E.image,0,0);let M=E.image.height,N=[];for(let e=0,t=M,n=0;t>=1;e++,t>>=1){let r=j.getImageData(e?M:0,e?n:0,t,t);N.push({data:new Uint8Array(r.data.buffer),width:t,height:t}),e&&(n+=t)}E.dispose();let P=new te(N[0].data,M,M,c,d);P.mipmaps=N,P.generateMipmaps=!1,P.minFilter=re,P.magFilter=b,P.needsUpdate=!0;let F=new te(ce(),z.size,z.size,c,d);F.wrapS=F.wrapT=p,F.minFilter=F.magFilter=b,F.needsUpdate=!0;for(let e of[o,s,P,F])n.initTexture(e);let I=(e=b)=>new f(4,4,{type:S,format:c,minFilter:e,magFilter:e,depthBuffer:!1,stencilBuffer:!1}),L={drops:I(m),a:I(),b:I()},B={uRes:{value:new h(1,1)},uRatio:{value:1}},V=(e,t,n={},r={})=>new ee({glslVersion:w,vertexShader:e,fragmentShader:t,uniforms:{...B,...n},depthTest:!1,depthWrite:!1,side:2,...r}),pe={transparent:!0,blending:5,blendEquation:104,blendSrc:201,blendDst:201,blendEquationAlpha:104,blendSrcAlpha:201,blendDstAlpha:201},H=new T,U=new y;U.setAttribute(`position`,new C(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));let W=new l(U);W.frustumCulled=!1;let G=(e,t)=>{W.material=e,n.setRenderTarget(t),n.render(W,H)},K=new v;K.setAttribute(`position`,new C(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0]),3));let q=new D(new Float32Array(k*6),6);q.setUsage(x),K.setAttribute(`aDrop`,new O(q,4,0)),K.setAttribute(`aShape`,new O(q,2,4));let me=V(ae,oe,{},pe),he=new l(K,me);he.frustumCulled=!1;let ge=(e,t)=>{q.array.set(t*6<e.length?e.subarray(0,t*6):e),q.clearUpdateRanges(),q.addUpdateRange(0,t*6),q.needsUpdate=!0,K.instanceCount=t,n.setRenderTarget(L.drops),n.setClearColor(0,0),n.clear(!0,!1,!1),t&&n.render(he,H)},J=V(ie,se,{uPrev:{value:null},uDrops:{value:L.drops.texture},uA:{value:new h},uB:{value:new h},uDir:{value:new h(1,0)},uGrow:{value:0},uFogRate:{value:1/14},uMistRate:{value:1/26},uDt:{value:0},uReach:{value:60},uWipe:{value:0},uReset:{value:0},uBreath:{value:0},uSeed:{value:0},uAlong:{value:0},uStamp:{value:0}}),Y=V(ie,R,{uBokeh:{value:o},uHaze:{value:s},uLens:{value:P},uMist:{value:F},uState:{value:null},uDrops:{value:L.drops.texture},uCover:{value:new u(1,1,0,0)},uShift:{value:new h},uSeed:{value:0},uFog:{value:.9},uGrain:{value:.03},uExposure:{value:.62},uLamp:{value:Array.from({length:8},()=>new u(0,-9,0,1))},uLampCol:{value:Array.from({length:8},()=>new _)}}),_e=[{y:.468,every:96,from:1.12,to:-.14,at:31,lamps:[[0,0,.5,[1,.74,.46]],[.021,.004,.36,[1,.8,.55]],[.043,.001,.3,[1,.72,.42]],[-.016,.012,.42,[.2,1,.45]]]},{y:.452,every:141,from:-.12,to:1.14,at:104,lamps:[[0,.016,.5,[1,.95,.86]],[-.03,0,.36,[1,.12,.08]],[-.052,.003,.22,[1,.7,.4]],[.018,.002,.26,[.75,.86,1]]]}],ve=e=>{let t=0;for(let n of _e){let r=(e+n.at)%n.every/n.every,i=n.from+(n.to-n.from)*r;for(let[e,r,a,o]of n.lamps)Y.uniforms.uLamp.value[t].set(i+e,n.y+r,a,.92),Y.uniforms.uLampCol.value[t].set(...o),t++}},X=0,Z=0,ye=1,be=0,xe=!0,Se=0,Q=0,$=[],Ce=()=>{if(!X||!Z)return;let e=Math.max(2,Math.round(X*ye)),t=Math.max(2,Math.round(Z*ye));n.setSize(e,t,!1),B.uRes.value.set(X,Z),B.uRatio.value=e/X,L.drops.setSize(e,t);let r=X/Z,i=.96;Y.uniforms.uCover.value.set(i*Math.min(1,r/ue),i*Math.min(1,ue/r),0,r<1?.02:0)},we=()=>{let e=Math.max(2,Math.round(X*de)),t=Math.max(2,Math.round(Z*de));if(L.a.width===e&&L.a.height===t)return;if(xe){L.a.setSize(e,t),L.b.setSize(e,t);return}let n=L.a;L.a=L.b,L.b=I(),L.b.setSize(e,t),L.a.setSize(e,t),ge(q.array,0);let r=J.uniforms;r.uGrow.value=r.uDt.value=r.uReset.value=r.uBreath.value=r.uWipe.value=0,r.uPrev.value=n.texture,G(J,L.a),n.dispose()},Te=(e,t,n=0)=>{let r=J.uniforms;if(be+=e,r.uGrow.value=0,be>=fe&&(r.uGrow.value=be,be=0),r.uDt.value=e,r.uReset.value=+!!xe,r.uBreath.value=n,xe=!1,r.uWipe.value=+!!t,t){r.uA.value.set(t[0],t[1]),r.uB.value.set(t[2],t[3]);let e=t[2]-t[0],n=t[3]-t[1],i=Math.hypot(e,n);i>.5&&r.uDir.value.set(e/i,n/i),r.uSeed.value=t[4]*100,r.uReach.value=t[5],r.uAlong.value=t[6]||0}r.uPrev.value=L.a.texture,G(J,L.b);let i=L.a;L.a=L.b,L.b=i},Ee=e=>{ve(e),Y.uniforms.uState.value=L.a.texture,G(Y,null)};return{setSize(e,t){let n=e!==X||t!==Z;X=e,Z=t,Ce(),n&&we()},setRatio(e){e!==ye&&(ye=e,Ce())},setOptions({fog:e,refog:t}){Y.uniforms.uFog.value=e,J.uniforms.uFogRate.value=1/t,J.uniforms.uMistRate.value=1/(t*2)},wipe(e,t,n,r,i,a,o=0){$.push([e,t,n,r,i,a,o]),$.length>24&&$.shift()},breathe(){$.length=0,Q=1},stamp(e){J.uniforms.uStamp.value=1,ge(e,e.length/6),Te(0,null),J.uniforms.uStamp.value=0},look(e,t){Y.uniforms.uShift.value.set(-e*.008,t*.006)},frame(e,n,r){for(ge(e.buf,e.count),Te(n,Q?null:$.shift()||null,Q),Q=0;$.length;)Te(0,$.shift());Y.uniforms.uGrain.value=t?.022:.03,Se=(Se+1)%240,Y.uniforms.uSeed.value=Se,Ee(r)},warm(){n.compile(he,H);for(let e of[J,Y])W.material=e,n.compile(W,H)},destroy({context:e=!0,resources:t=!0}={}){if(t){for(let e of Object.values(L))e.dispose();for(let e of[o,s,P,F])e.dispose();for(let e of[me,J,Y])e.dispose();U.dispose(),K.dispose()}n.dispose(),e&&n.forceContextLoss()}}}function V(e){let t=e.noise(),n=e.filter(`bandpass`,5200,.6),r=e.gain(.03),i=e.filter(`lowpass`,380,.5),a=e.gain(.075),o=e.gain(1);t.connect(n),n.connect(r),r.connect(o),t.connect(i),i.connect(a),a.connect(o),o.connect(e.dry),e.sway(o.gain,.09,.22),e.sway(o.gain,.23,.12),e.sway(n.frequency,.05,900);let s=-1;return{patter(t){e.burst({f:2600+3200*Math.random(),q:2.5,attack:.001,decay:.03+.03*Math.random(),gain:.03+.04*Math.random(),pan:t,send:.25})},drop(t){e.burst({f:1500,q:1.4,attack:.001,decay:.05,gain:.16,pan:t,send:.3}),e.note({f:520,to:300,attack:.004,decay:.16,gain:.07,pan:t,send:.4}),e.note({f:880,to:620,at:.07,attack:.004,decay:.09,gain:.025,pan:t,send:.4})},wipe(t,n){let r=e.ctx.currentTime;r-s<.16||(s=r,e.burst({f:620+500*n,to:760+700*n,q:1.6,attack:.05,decay:.2,gain:.05+.05*n,pan:t,send:.3}))},breathe(){e.burst({f:900,to:600,q:.5,attack:.35,decay:.9,gain:.07,send:.35})}}}var pe={rain:1,fog:.95,refog:14,reach:64},H={rain:[0,2],fog:[0,1],refog:[4,40],reach:[30,140]},U=[[`rain`,`Rainfall`,.1,`×`],[`fog`,`Mist on the glass`,.05],[`refog`,`Mists over in`,1,`s`],[`reach`,`Wipe width`,2,`px`]].map(([e,t,n,r])=>({id:e,label:t,min:H[e][0],max:H[e][1],step:n,value:pe[e],unit:r})),W=[{id:`drop`,label:`Send a drop down`},{id:`breathe`,label:`Breathe on the glass`}],G=e=>{let t={...pe};for(let n of Object.keys(H)){let r=Number(e?.[n]);Number.isFinite(r)&&(t[n]=o(r,...H[n]))}return t.text=e?.text!==!1,t.sound=e?.sound===!0,t};function K(t,s={}){let c=G(s),l=!a();t.classList.add(`rain`),t.classList.toggle(`is-still`,!l),t.classList.toggle(`is-bare`,!c.text),t.setAttribute(`aria-labelledby`,`rain-title`),t.innerHTML=`
    <canvas class="rain__glass" aria-hidden="true"></canvas>
    <h1 class="rain__title" id="rain-title">Small Hours</h1>
    <button class="rain__cue" type="button">Send a drop down</button>
    <p class="rain__note"><span>Lowlight · night programme</span><span>00:00 – 04:00</span></p>
    <p class="sr-only" role="status"></p>`;let u=t.querySelector(`canvas`),d=t.querySelector(`[role="status"]`),f=F(),p=f.st,m=n(V,{room:1.4});m.set(c.sound);let h=e=>e/Math.max(1,p.W)*2-1,g=new AbortController,_=(e,t,n)=>e.addEventListener(t,n,{signal:g.signal}),v=null,y=null,b=null,x=!1,S=!1,C=0,ee=0,te=!1,w=0,T=null,ne=0,E=0,D=.4,re=0,O={x:0,y:0,tx:0,ty:0},k=()=>{w=0,v&&!S&&p.W&&(f.write(),v.frame(p,0,0))},A=()=>{!l&&!w&&(w=requestAnimationFrame(k))},j=()=>{let e=t.clientWidth,n=t.clientHeight;e&&n&&(f.fit(e,n),v&&!S&&(v.setSize(e,n),te||M(),l||k()))},M=()=>{te=!0,v.stamp(f.soak(26,c.rain,c.refog));let e=Math.min(p.W,p.H)*.095,t=null,n=0;for(let r=0;r<=16;r++){let i=r/16,a=[p.W*(.29+.65*i),p.H*(.53-.3*i-.09*Math.sin(Math.PI*i))];t&&(v.wipe(...t,...a,.37,e,n),n+=Math.hypot(a[0]-t[0],a[1]-t[1])),t=a}},N=(e,t)=>{if(!p.W||!v||S)return;let n=f.send(e,t);d.textContent=`Drop ${++ee} runs down the glass.`,m.play(`drop`,h(n.x)),l||(v.stamp(f.settle(n)),k())},P=()=>{v&&!S&&(v.breathe(),m.play(`breathe`),d.textContent=`The glass mists over.`,A())},I=e=>{if(!p.W)return;y.tick(e);let t=Math.min(e,.05);C+=t,f.advance(t,c.rain);for(let e of p.landed)Math.random()<.3&&m.play(`patter`,e*2-1);p.landed.length=0;let n=1-Math.exp(-t*3);O.x+=(O.tx-O.x)*n,O.y+=(O.ty-O.y)*n,v.look(O.x,O.y),f.write(),v.frame(p,t,C)},ie=()=>{x||S||!v||(t.classList.remove(`is-static`),j(),l&&!b&&(b=e(t,I)),requestAnimationFrame(()=>{!x&&!S&&t.classList.add(`is-ready`)}))},L=()=>{b?.(),b=null,t.classList.remove(`is-ready`),t.classList.add(`is-static`)},ae=0,oe=()=>{let e=++ae;B(u,{low:r()===`low`}).then(n=>{if(x){n.destroy();return}if(S||e!==ae){n.destroy({context:!1,resources:!S});return}v=n,v.setOptions(c),v.warm();let r=Math.min(window.devicePixelRatio||1,2),a=Math.min(r,Math.max(1,Math.sqrt(26e5/Math.max(1,t.clientWidth*t.clientHeight))));y?v.setRatio(y.ratio):y=i({min:Math.min(a,Math.max(.7,.5*r)),max:a,onChange:e=>v?.setRatio(e)}),ie()}).catch(e=>{x||(console.info(`Night rain: static fallback.`,e?.message||e),L())})};oe();let se=new ResizeObserver(j);se.observe(t),_(u,`webglcontextlost`,e=>{e.preventDefault(),S=!0,L()}),_(u,`webglcontextrestored`,()=>{S=!1,v?.destroy({context:!1,resources:!1}),v=null,oe()});let R=e=>{let t=u.getBoundingClientRect();return{x:e.clientX-t.left,y:e.clientY-t.top,t:e.timeStamp}},z=e=>{T=e,ne=Math.random(),E=0,D=.4};_(t,`pointerdown`,e=>{e.pointerType===`touch`&&z(R(e))}),_(t,`pointermove`,e=>{let t=R(e);if(T||z(t),v&&!S){let e=Math.hypot(t.x-T.x,t.y-T.y),n=e/Math.max(4,t.t-T.t);D+=(o(.36+n*.7,.36,1)-D)*.25;let r=c.reach*D*o(p.W/900,.6,1);if(v.wipe(T.x,T.y,t.x,t.y,ne,r,E),E+=e,re+=e,re>16&&e>.5){re=0;let n=Math.random()<.5?-1:1,i=r*(.8+.25*Math.random())*n;f.spill(t.x-(t.y-T.y)/e*i,t.y+(t.x-T.x)/e*i)}n>.25&&m.play(`wipe`,h(t.x),Math.min(1,n/2))}T=t,O.tx=h(t.x),O.ty=t.y/Math.max(1,p.H)*2-1,A()});for(let e of[`pointerleave`,`pointercancel`,`pointerup`])_(t,e,t=>{(e!==`pointerup`||t.pointerType===`touch`)&&(T=null),e===`pointerleave`&&(O.tx=O.ty=0)});return _(t,`click`,e=>{if(e.target.closest(`button`))return;let t=R(e);N(t.x,t.y)}),_(t.querySelector(`.rain__cue`),`click`,()=>N(...f.spot())),{update(e={}){let n=c;c=G({...c,...e}),v?.setOptions(c),m.set(c.sound),n.text!==c.text&&t.classList.toggle(`is-bare`,!c.text),A()},action(e){e===`drop`&&N(...f.spot()),e===`breathe`&&P()},destroy(){x=!0,b?.(),se.disconnect(),g.abort(),cancelAnimationFrame(w),v?.destroy(),v=null,m.destroy(),t.classList.remove(`rain`,`is-ready`,`is-static`,`is-still`,`is-bare`),t.removeAttribute(`aria-labelledby`),t.innerHTML=``}}}window.hero=K(document.getElementById(`hero`),{sound:s.get()}),E(window.hero,{controls:U,actions:W});