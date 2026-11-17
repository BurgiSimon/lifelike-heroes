// What floats on the pond, as instances of one quad: pollen, fallen leaves and petals (drifting on their own),
// the lily pads and their blooms (from the pond's springs), and the pellets.
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { BLOOMS } from './pond.js';

const PADS = 7; const PELLETS = 8;
// A water lily, whorl by whorl from the outside in: petals, their length as a share of the bloom's radius, and
// how far they stand up from the water (radians). Drawn in this order, so each whorl overlaps the one below.
const WHORLS = [[9, 1, 0.3], [8, 0.86, 0.6], [6, 0.66, 0.92], [5, 0.46, 1.16]];
const PETALS = WHORLS.reduce((n, w) => n + w[0], 0);

export function createFloaters({ pollen = 70, petals = 8 } = {}) {
  const LIT = pollen + petals;
  const MAX = LIT + PADS + BLOOMS.length * (PETALS + 1) + PELLETS;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(MAX * 4); const B = new Float32Array(MAX * 4);
  const iA = new THREE.InstancedBufferAttribute(A, 4); const iB = new THREE.InstancedBufferAttribute(B, 4);
  iA.setUsage(THREE.DynamicDrawUsage); iB.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', iA); geo.setAttribute('iB', iB);
  const pads = new Float32Array(8 * 4); // x, y, radius for the pass that calms the water beneath them
  let n = 0;
  const put = (x, y, r, a, kind, seed, e, f) => { A[n * 4] = x; A[n * 4 + 1] = y; A[n * 4 + 2] = r; A[n * 4 + 3] = a; B[n * 4] = kind; B[n * 4 + 1] = seed; B[n * 4 + 2] = e; B[n * 4 + 3] = f; n++; };

  // Litter keeps to loose rafts that the breeze carries slowly across and round again. What never changes about
  // a piece: where in its raft it sits, its pace, size, seed, two looks, its turn and how fast it turns.
  const L = new Float32Array(LIT * 9);
  for (let i = 0; i < LIT; i++) {
    const petal = i >= pollen; const k = i * 7 + 300;
    const raft = Math.floor(rnd(k) * 9); const loose = rnd(k + 1) < 0.35;
    L.set([
      loose ? rnd(k + 2) : rnd(raft * 3 + 900) + (rnd(k + 2) - 0.5) * 0.16, loose ? rnd(k + 3) : rnd(raft * 3 + 901) + (rnd(k + 3) - 0.5) * 0.12,
      0.6 + 0.8 * rnd(k + 4), petal ? (rnd(k + 9) < 0.4 ? 6 + 3 * rnd(k + 5) : 9 + 7 * rnd(k + 5)) : 0.8 + 1.1 * rnd(k + 5), rnd(k + 8),
      petal ? (rnd(k + 9) < 0.4 ? 1 : 0) : rnd(k + 9), petal ? rnd(k + 10) : 0, rnd(k + 6) * 6.283, 0.09 * (rnd(k + 7) - 0.5),
    ], i * 9);
  }
  // Petals: no two alike. Per bloom and petal: turn round the flower, length, tilt, seed.
  const P = new Float32Array(BLOOMS.length * PETALS * 4);
  BLOOMS.forEach((_, b) => {
    let j = 0;
    WHORLS.forEach(([count, len, tilt], w) => {
      for (let i = 0; i < count; i++, j++) {
        const k = b * 400 + j * 5 + 2000;
        P.set([(i + 0.5 * (w & 1) + (rnd(k) - 0.5) * 0.4) / count * 6.283 + b * 1.3, len * (0.88 + 0.24 * rnd(k + 1)), tilt + (rnd(k + 2) - 0.5) * 0.16, rnd(k + 3)], (b * PETALS + j) * 4);
      }
    });
  });

  return {
    geo, pads, padCount: 0,
    update(st, time) {
      const { W, H, S } = st; n = 0;
      const bw = W + 120; const bh = H + 120;
      for (let i = 0; i < LIT; i++) {
        const o = i * 9; const k = i * 7 + 300; const sp = L[o + 2];
        const x = ((((L[o] * bw + time * 2.6 * sp + Math.sin(time * 0.07 + k) * 14) % bw) + bw) % bw) - 60;
        const y = ((((L[o + 1] * bh + time * 1.1 * sp + Math.cos(time * 0.05 + k) * 10) % bh) + bh) % bh) - 60;
        if (i >= pollen) put(x, y, L[o + 3] * S, L[o + 7] + time * L[o + 8], 4, L[o + 4], L[o + 5], L[o + 6]);
        else put(x, y, L[o + 3] * S, 0, 3, L[o + 4], L[o + 5], 0);
      }
      const count = st.pads.length;
      for (let i = 0; i < count; i++) {
        const p = st.pads[i]; const x = p.u * W + p.ox; const y = p.v * H + p.oy; const r = p.r * S;
        let bx = 0; let by = 0;
        for (const b of BLOOMS) if (b[0] === p.i) { bx = b[1]; by = b[2]; }
        put(x, y, r, p.a, 0, 0.11 + rnd(p.i + 40) * 0.8, bx, by);
        pads[i * 4] = x; pads[i * 4 + 1] = y; pads[i * 4 + 2] = r;
      }
      this.padCount = count;
      for (let b = 0; b < BLOOMS.length; b++) {
        const [pi, ox, oy, size] = BLOOMS[b]; if (pi >= count) continue;
        const p = st.pads[pi]; const r = p.r * S; const c = Math.cos(p.a); const s = Math.sin(p.a);
        const x = p.u * W + p.ox + (c * ox - s * oy) * r; const y = p.v * H + p.oy + (s * ox + c * oy) * r;
        const rb = r * size; const turn = p.a * 0.6 + pi; const white = pi % 3 === 0 ? 1 : 0;
        for (let j = 0; j < PETALS; j++) {
          const o = (b * PETALS + j) * 4; const a = turn + P[o]; const half = rb * P[o + 1] * 0.5;
          put(x + Math.cos(a) * half, y + Math.sin(a) * half, half, a, 5, P[o + 3], P[o + 2], white);
        }
        put(x, y, rb * 0.3, turn, 1, rnd(pi + 60), 0, white);
      }
      for (const p of st.pellets) {
        const age = st.t - p.t;   // meeting the water it ducks under and bobs up again; its height is the shader's to draw
        put(p.x, p.y, 3.1 * S * (p.wet ? 1 - 0.22 * Math.exp(-8 * age) * Math.sin(18 * age) : 1), p.seed * 6.283, 2, p.seed, p.h, 0);
      }
      geo.instanceCount = n;
      iA.needsUpdate = iB.needsUpdate = true;
    },
  };
}
