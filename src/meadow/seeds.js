// Seeds: dandelion fluff the wind lets go of. Sixty at most, simulated on the CPU the way the original did it
// (eased toward the wind where they are, lifted by it, bobbing), drawn as small backlit sprites that defocus with
// depth: the far ones are specks in the light, the few that pass the lens are soft discs. The same sprites draw the
// air itself: pollen, dust and the odd midge between the lens and the word, catching the low sun.
import * as THREE from 'three';
import { rnd, clamp } from '../shared/kit.js';
import { SEEDS, WIND, LENS } from './config.js';
import { ground } from './terrain.js';
import { LIGHT, PACK, weatherAt, sward } from './glsl.js';

const VERT = /* glsl */`
${LIGHT}
attribute vec4 iPos;      // xyz, radius (negative: a mote, a plain soft speck)
attribute vec2 iLook;     // opacity, tilt
uniform float uFrame; uniform float uPx;
varying vec2 vUv; varying vec4 vCol; varying vec3 vQ;
void main() {
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0); float depth = -mv.z;
  float R = ${LENS.a.toFixed(6)} * abs(uLens.y / max(depth, 0.05) - 1.0) * uFrame * depth;      // blur radius here, m
  bool mote = iPos.w < 0.0;
  float r = max(abs(iPos.w), uPx * depth * (mote ? 1.6 : 5.0));                              // never under a few pixels: it would only twinkle
  float c = cos(iLook.y), s = sin(iLook.y);
  vec2 q = mat2(c, -s, s, c) * position.xy;
  mv.xy += q * (r + R);
  vUv = position.xy * (1.0 + R / r) * 0.5 + 0.5;
  // the mip its size on screen asks for (a far one is ten pixels of a 256 px drawing: sampled sharp, its hairs would
  // fall between the pixels and it would vanish), or a softer one when it is out of focus, inside a round falloff
  float lod = clamp(max(log2(1.0 + 6.0 * R / r), log2(128.0 * uPx * depth / r)), 0.0, 6.0);
  vQ = vec3(position.xy, mote ? 6.0 : lod);
  // fluff scatters forward: toward the sun it burns, away from it it is only pale
  vec3 v = normalize(cameraPosition - iPos.xyz);
  float fwd = pow(max(dot(v, -uSun), 0.0), 4.0);
  vec3 light = skyLight(v) * 0.5 + uSunCol * (0.25 + 4.0 * fwd) * wordShadow(iPos.xyz) * cloudSun(iPos.xz);
  // pale away from the sun, burning toward it; dust is fainter than fluff, or a narrow frame fills with sparks
  light *= min(1.0, mix(1.3, 6.0, fwd) * (mote ? 0.5 : 1.0) / max(light.r, max(light.g, light.b)));
  float spread = r * r / ((r + R) * (r + R));
  // Its light is spread over the blur disc, as a lens would, though less than fully or the near ones are lost. A far
  // one is a few pixels and needs all of them; seen that small a tuft is a quarter white (it is mostly air between
  // its hairs) and is given its light back.
  vCol = vec4(light * vec3(0.92, 0.88, 0.80), iLook.x * mix(spread, 1.0, 0.25) * clamp(6.0 * uPx * depth / r, 0.4, 1.5) * (mote ? 1.0 : 1.0 + 0.5 * lod));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D uFluff;
varying vec2 vUv; varying vec4 vCol; varying vec3 vQ;
${PACK}
void main() {
  float a = min(1.0, textureLod(uFluff, clamp(vUv, 0.0, 1.0), vQ.z).r * vCol.a) * smoothstep(1.0, 0.55, length(vQ.xy));
  gl_FragColor = vec4(pack(vCol.rgb) * a, 0.0);
}`;

// The pappus: a fan of fine hairs on a stalk with the seed under it, drawn once to a small mipped texture.
function fluff() {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const cx = S / 2; const cy = S * 0.46;
  for (let k = 0; k < 46; k++) {
    const a = -Math.PI / 2 + (k / 45 - 0.5) * 2.7 + (rnd(k * 3 + 400) - 0.5) * 0.12; const len = S * (0.3 + 0.1 * rnd(k * 3 + 401));
    g.globalAlpha = 0.6 + 0.3 * rnd(k * 3 + 402); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
  }
  // the hairs cross near the stalk: a denser, brighter heart
  const halo = g.createRadialGradient(cx, cy - S * 0.06, 0, cx, cy - S * 0.06, S * 0.22);
  halo.addColorStop(0, 'rgba(255,255,255,0.8)'); halo.addColorStop(0.35, 'rgba(255,255,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 1; g.fillStyle = halo; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.globalAlpha = 0.9; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + S * 0.3); g.stroke();
  g.fillStyle = '#fff'; g.globalAlpha = 1; g.beginPath(); g.ellipse(cx, cy + S * 0.33, 4.5, 10, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

const MOTES = 44;          // air, not seeds: they are not counted against the cap

export function createSeeds(shared) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const N = SEEDS.cap + MOTES;
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); const look = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  pos.setUsage(THREE.DynamicDrawUsage); look.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', pos); geo.setAttribute('iLook', look); geo.instanceCount = 0;
  const tex = fluff();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uFluff: { value: tex } }, transparent: true, depthWrite: false,
    // Screened on: backlit fluff adds its light and never dims the sky behind it, and the packed colour cannot run
    // past 1 as a plain add would. The target's alpha is the lens's CoC, so it is left alone.
    blending: THREE.CustomBlending, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 20;
  const seeds = []; let due = 0; let no = 0;
  // Each mote's own place in the air: depth, share of the frame's width, height over the ground, phase, size; one in eleven is a midge.
  const air = Array.from({ length: MOTES }, (_, i) => ({ d: 1.3 + 21 * rnd(i * 9 + 300) ** 1.6, u: rnd(i * 9 + 301) * 2 - 1, y: 0.35 + 2.3 * rnd(i * 9 + 302), ph: rnd(i * 9 + 303) * 6.2832, r: 0.0012 + 0.0016 * rnd(i * 9 + 304), fly: i % 11 === 0 }));
  // Written after the seeds: carried slowly downwind across the frame and round again, fading at the turn, wandering
  // as they go; a midge darts about instead.
  const drawAir = (time, view, at) => {
    const a = pos.array; const b = look.array;
    for (let i = 0; i < MOTES; i++) {
      const m = air[i]; const half = view.tanH * m.d + 0.4;
      const across = ((m.u * half + time * (0.1 + 60 * m.r)) % (2 * half) + 3 * half) % (2 * half) - half;
      const k = m.fly ? 1 : 0.25; const f = m.fly ? 3.1 : 0.7;
      const x = across + k * (0.5 * Math.sin(time * f + m.ph) + 0.2 * Math.sin(time * f * 2.3 + m.ph * 3));
      const z = -m.d + k * 0.4 * Math.sin(time * f * 0.7 + m.ph * 2);
      const j = (at + i) * 4;
      a[j] = x; a[j + 1] = ground(x, z) + m.y + k * (0.3 * Math.sin(time * f * 1.3 + m.ph * 5) + 0.1 * Math.sin(time * f * 3.1 + m.ph)); a[j + 2] = z; a[j + 3] = -(m.fly ? 0.003 : m.r);
      b[(at + i) * 2] = Math.min(1, (half - Math.abs(across)) / (0.15 * half)) * (m.fly ? 1.5 : 1.1); b[(at + i) * 2 + 1] = 0;
    }
  };

  const add = (x, z, age = 0, lift = 0, vy = 0.1) => {
    if (seeds.length >= SEEDS.cap) return;
    const n = no++;
    seeds.push({ x, y: ground(x, z) + sward(x, z) * 0.8 + lift, z, vx: 0, vy, age, life: 14 + rnd(n * 3) * 12, ph: rnd(n * 3 + 1) * 6.2832, r: 0.8 + rnd(n * 3 + 2) * 0.5 });
  };

  return {
    mesh,
    get count() { return seeds.length; },
    // A few already in the air, so the first frame is not an empty sky.
    prime(view) { for (let i = 0; i < 16; i++) { const d = 3 + 11 * rnd(i * 5 + 70); add((rnd(i * 5 + 71) * 2 - 1) * view.tanH * d * 0.92, -d, 3 + 6 * rnd(i * 5 + 72), 0.4 + 2.2 * rnd(i * 5 + 73)); seeds[seeds.length - 1].vx = 0.6; } },
    // Also the way to draw the air alone: with no time passed and no wind, nothing is let go and nothing moves.
    step(dt, time, wind, burst, view) {
      due += dt * wind * SEEDS.rate;
      if (burst) due += dt * WIND.burst.speed / SEEDS.perGust;
      for (; due >= 1; due--) {
        // The wind lets go of one: anywhere at a breeze, along the front during a gust. Most rise from the near and
        // middle field, where they are large enough to see; a few right past the lens.
        const k = rnd(no * 3 + 7); const d = rnd(no * 3 + 9) < 0.12 ? 1.2 + 1.8 * k : 2.5 + 16 * k * k;
        const x = burst ? (burst.x + d * WIND.dir[1]) / WIND.dir[0] : (-1 + (rnd(no * 3 + 8) - 0.05) * 1.7) * view.tanH * d;
        if (Math.abs(x) < view.tanH * d + 1) add(x, -d, 0, 0, burst ? 0.7 + 0.7 * k : 0.1);     // a gust throws them clear of the grass
        else no++;     // the front is out of the frame at that depth: another spot next time, or the gust would stop at the first such one
      }
      const ease = Math.min(1, dt * 1.5);
      for (let i = seeds.length; i--;) {
        const s = seeds[i]; const push = Math.max(0, weatherAt(s.x, s.z, s.ph, time, wind, burst ? burst.x : -1e4, burst ? 1 : 0));
        s.age += dt;
        s.vx += (0.2 + 4.6 * push - s.vx) * ease; s.vy += (0.066 + 1.1 * push - 0.11 * Math.sin(s.ph + s.age * 1.7) - s.vy) * ease;
        s.x += WIND.dir[0] * s.vx * dt; s.z += WIND.dir[1] * s.vx * dt; s.y += s.vy * dt;
        const d = -s.z;
        if (s.age > s.life || s.x > view.tanH * d + 0.6 || d > 60 || s.y - view.eyeY > view.tanTop * d + 0.5) seeds.splice(i, 1);
      }
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const a = pos.array; const b = look.array; const j = i * 4;     // written in place: nothing is allocated per frame
        // near life size at the lens, drawn larger with distance so the far ones stay more than a pixel
        a[j] = s.x; a[j + 1] = s.y; a[j + 2] = s.z; a[j + 3] = clamp(-s.z * 0.003, 0.01, 0.024) * s.r;
        b[i * 2] = Math.min(1, Math.max(0, Math.min(s.age / 0.6, (s.life - s.age) / 2))); b[i * 2 + 1] = -Math.min(0.9, Math.max(0, s.vx / 2.9));
      }
      drawAir(time, view, seeds.length);
      pos.needsUpdate = look.needsUpdate = true; geo.instanceCount = seeds.length + MOTES;
      return seeds.length > 0;
    },
    clear() { seeds.length = 0; geo.instanceCount = 0; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
