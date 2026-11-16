// Seeds: dandelion fluff the wind lets go of. Sixty at most, simulated on the CPU the way the original did it
// (eased toward the wind where they are, lifted by it, bobbing), drawn as small lit sprites that defocus with depth.
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { SEEDS, WIND, LENS } from './config.js';
import { ground } from './terrain.js';
import { shared, LIGHT, weatherAt, sward } from './glsl.js';

const VERT = /* glsl */`
${LIGHT}
attribute vec4 iPos;      // xyz, radius
attribute vec2 iLook;     // opacity, tilt
uniform float uFrame; uniform float uPx;
varying vec2 vUv; varying vec4 vCol; varying vec3 vQ;
void main() {
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0); float depth = -mv.z;
  float R = ${LENS.a.toFixed(6)} * abs(uLens.y / max(depth, 0.05) - 1.0) * uFrame * depth;      // blur radius here, m
  float r = max(iPos.w, uPx * depth * 2.4);
  float c = cos(iLook.y), s = sin(iLook.y);
  vec2 q = mat2(c, -s, s, c) * position.xy;
  mv.xy += q * (r + R);
  vUv = position.xy * (1.0 + R / r) * 0.5 + 0.5;
  vQ = vec3(position.xy, clamp(log2(1.0 + 6.0 * R / r), 0.0, 6.0));     // out of focus: a softer mip inside a round falloff
  // fluff scatters forward: toward the sun it burns, away from it it is only pale
  vec3 v = normalize(cameraPosition - iPos.xyz);
  float fwd = pow(max(dot(v, -uSun), 0.0), 3.0);
  vec3 light = skyLight(v) * 0.5 + uSunCol * (0.5 + 3.6 * fwd) * wordShadow(iPos.xyz);
  float spread = r * r / ((r + R) * (r + R));
  vCol = vec4(light * vec3(0.9, 0.86, 0.78), iLook.x * spread);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D uFluff;
varying vec2 vUv; varying vec4 vCol; varying vec3 vQ;
vec3 pack(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
void main() {
  float a = textureLod(uFluff, clamp(vUv, 0.0, 1.0), vQ.z).r * vCol.a * smoothstep(1.0, 0.55, length(vQ.xy));
  gl_FragColor = vec4(pack(vCol.rgb) * a, a);
}`;

// The pappus: a fan of fine hairs on a stalk with the seed under it, drawn once to a small mipped texture.
function fluff() {
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const cx = S / 2; const cy = S * 0.46;
  for (let k = 0; k < 34; k++) {
    const a = -Math.PI / 2 + (k / 33 - 0.5) * 2.5 + (rnd(k * 3 + 400) - 0.5) * 0.12; const len = S * (0.3 + 0.1 * rnd(k * 3 + 401));
    g.globalAlpha = 0.35 + 0.4 * rnd(k * 3 + 402); g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
  }
  const halo = g.createRadialGradient(cx, cy - S * 0.1, 0, cx, cy - S * 0.1, S * 0.36);
  halo.addColorStop(0, 'rgba(255,255,255,0.55)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 1; g.fillStyle = halo; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.globalAlpha = 0.85; g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + S * 0.3); g.stroke();
  g.fillStyle = '#fff'; g.globalAlpha = 1; g.beginPath(); g.ellipse(cx, cy + S * 0.33, 2.2, 5, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

export function createSeeds() {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(SEEDS.cap * 4), 4); const look = new THREE.InstancedBufferAttribute(new Float32Array(SEEDS.cap * 2), 2);
  pos.setUsage(THREE.DynamicDrawUsage); look.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', pos); geo.setAttribute('iLook', look); geo.instanceCount = 0;
  const tex = fluff();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uFluff: { value: tex } }, transparent: true, depthWrite: false,
    // premultiplied over; the target's alpha is the lens's CoC, so it is left alone
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 20;
  const seeds = []; let due = 0; let no = 0;

  const add = (x, z, age = 0, lift = 0) => {
    if (seeds.length >= SEEDS.cap) return;
    const n = no++;
    seeds.push({ x, y: ground(x, z) + sward(x, z) * 0.8 + lift, z, vx: 0, vy: 0.1, age, life: 14 + rnd(n * 3) * 12, ph: rnd(n * 3 + 1) * 6.2832, r: 0.8 + rnd(n * 3 + 2) * 0.5 });
  };

  return {
    mesh,
    get count() { return seeds.length; },
    // A few already in the air, so the first frame is not an empty sky.
    prime(view) { for (let i = 0; i < 9; i++) { const d = 6 + 20 * rnd(i * 5 + 70); add((rnd(i * 5 + 71) * 2 - 1) * view.tanH * d * 0.95, -d, 3 + 6 * rnd(i * 5 + 72), 0.5 + 2.6 * rnd(i * 5 + 73)); seeds[seeds.length - 1].vx = 0.6; } },
    step(dt, time, wind, burst, view) {
      due += dt * wind * SEEDS.rate;
      if (burst) due += dt * WIND.burst.speed / SEEDS.perGust;
      for (; due >= 1; due--) {
        // the wind lets go of one: anywhere at a breeze, along the front during a gust
        const d = 5 + 23 * (1 - (0.1 + 0.8 * rnd(no * 3 + 7)));
        const x = burst ? (burst.x + d * WIND.dir[1]) / WIND.dir[0] : (-1 + (rnd(no * 3 + 8) - 0.05) * 1.7) * view.tanH * d;
        if (Math.abs(x) < view.tanH * d + 1) add(x, -d);
      }
      const ease = Math.min(1, dt * 1.5);
      for (let i = seeds.length; i--;) {
        const s = seeds[i]; const push = Math.max(0, weatherAt(s.x, s.z, s.ph, time, wind, burst ? burst.x : -1e4, burst ? 1 : 0));
        s.age += dt;
        s.vx += (0.2 + 4.6 * push - s.vx) * ease; s.vy += (0.066 + 0.66 * push - 0.11 * Math.sin(s.ph + s.age * 1.7) - s.vy) * ease;
        s.x += WIND.dir[0] * s.vx * dt; s.z += WIND.dir[1] * s.vx * dt; s.y += s.vy * dt;
        const d = -s.z;
        if (s.age > s.life || s.x > view.tanH * d + 0.6 || d > 60 || s.y - view.eyeY > view.tanTop * d + 0.5) seeds.splice(i, 1);
      }
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const a = pos.array; const b = look.array; const j = i * 4;     // written in place: nothing is allocated per frame
        a[j] = s.x; a[j + 1] = s.y; a[j + 2] = s.z; a[j + 3] = 0.04 * s.r;
        b[i * 2] = Math.min(1, Math.max(0, Math.min(s.age / 1.5, (s.life - s.age) / 2))); b[i * 2 + 1] = -Math.min(0.9, Math.max(0, s.vx / 2.9));
      }
      pos.needsUpdate = look.needsUpdate = true; geo.instanceCount = seeds.length;
      return seeds.length > 0;
    },
    clear() { seeds.length = 0; geo.instanceCount = 0; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
