// What floats on the pond, as instances of one quad: pollen and fallen petals (drifting on their own), the lily
// pads and their blooms (from the pond's springs), and the pellets.
import * as THREE from 'three';
import { rnd } from '../shared/kit.js';
import { BLOOMS } from './pond.js';

const PADS = 7; const PELLETS = 8;

export function createFloaters({ pollen = 80, petals = 9 } = {}) {
  const MAX = pollen + petals + PADS + BLOOMS.length + PELLETS;
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

  return {
    geo, pads, padCount: 0,
    update(st, time) {
      const { W, H, S } = st; n = 0;
      // litter keeps to loose rafts that the breeze carries slowly across and round again
      const bw = W + 120; const bh = H + 120;
      for (let i = 0; i < pollen + petals; i++) {
        const petal = i >= pollen; const k = i * 7 + 300;
        const raft = Math.floor(rnd(k) * 9); const loose = rnd(k + 1) < 0.35;
        const u = loose ? rnd(k + 2) : rnd(raft * 3 + 900) + (rnd(k + 2) - 0.5) * 0.16;
        const v = loose ? rnd(k + 3) : rnd(raft * 3 + 901) + (rnd(k + 3) - 0.5) * 0.12;
        const sp = 0.6 + 0.8 * rnd(k + 4);
        const x = ((((u * bw + time * 2.6 * sp + Math.sin(time * 0.07 + k) * 14) % bw) + bw) % bw) - 60;
        const y = ((((v * bh + time * 1.1 * sp + Math.cos(time * 0.05 + k) * 10) % bh) + bh) % bh) - 60;
        if (petal) put(x, y, (3.6 + 3.4 * rnd(k + 5)) * S, rnd(k + 6) * 6.283 + time * 0.05 * (rnd(k + 7) - 0.5), 4, rnd(k + 8), rnd(k + 9) < 0.45 ? 1 : 0, rnd(k + 10));
        else put(x, y, (0.9 + 1.3 * rnd(k + 5)) * S, 0, 3, rnd(k + 8), rnd(k + 9), 0);
      }
      st.pads.forEach((p, i) => {
        const x = p.u * W + p.ox; const y = p.v * H + p.oy; const r = p.r * S;
        const b = BLOOMS.find((q) => q[0] === p.i);
        put(x, y, r, p.a, 0, 0.11 + rnd(p.i + 40) * 0.8, b ? b[1] : 0, b ? b[2] : 0);
        pads[i * 4] = x; pads[i * 4 + 1] = y; pads[i * 4 + 2] = r;
      });
      this.padCount = st.pads.length;
      for (const p of st.pads) {
        const b = BLOOMS.find((q) => q[0] === p.i); if (!b) continue;
        const r = p.r * S; const c = Math.cos(p.a); const s = Math.sin(p.a);
        put(p.u * W + p.ox + (c * b[1] - s * b[2]) * r, p.v * H + p.oy + (s * b[1] + c * b[2]) * r, r * b[3], p.a * 0.6 + p.i, 1, rnd(p.i + 60), p.i % 3 === 0 ? 1 : 0, 0);
      }
      for (const p of st.pellets) put(p.x, p.y, 3.1 * S * Math.min(1, 0.4 + (st.t - p.t) * 4), p.seed * 6.283, 2, p.seed, 0, 0);
      geo.instanceCount = n;
      iA.needsUpdate = iB.needsUpdate = true;
    },
  };
}
