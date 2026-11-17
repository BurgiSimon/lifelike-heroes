// Koi geometry: every frame the simulated spines become ribbons (body, tail fin, two pectoral and two pelvic
// fins per koi) in one dynamic buffer. The shader turns the ribbons into round bodies and thin fins.
import * as THREE from 'three';
import { N, SEG, TAIL, TSEG, WID } from './pond.js';

// The snout: ring stations from the nose tip to the first spine point, and the head's width at each. A koi's
// head is blunt from above: it is already a third of its width one px behind the tip.
const CAP = [0, 0.03, 0.09, 0.2, 0.36, 0.56, 0.78];
const CAPW = [0, 0.33, 0.5, 0.65, 0.79, 0.9, 0.97];
const NOSE = 8.05;        // px at scale 1 from the nose tip to the first spine point
export const R0 = 7.5;    // body half-width, px at scale 1
export const LEN = NOSE + (N - 1) * SEG;
const BODY = CAP.length + (N - 1) * 2 + 1;
const FIN_T = TAIL * 2 + 1;
const FIN_U = [0, 0.1, 0.24, 0.42, 0.6, 0.76, 0.9, 1];     // ring stations along a paired fin
const FIN_P = FIN_U.length;
const RINGS = BODY + FIN_T + 4 * FIN_P;
const VERTS = RINGS * 2;
const EDGE = 1.5;         // px of ribbon beyond the true outline, for the shader's analytic edge
const MAXKOI = 8;
// Ring ranges of the parts, and the order they are drawn in (fins under the body).
const PARTS = [[0, BODY, 0], [BODY, FIN_T, 1], [BODY + FIN_T, FIN_P, 2], [BODY + FIN_T + FIN_P, FIN_P, 2], [BODY + FIN_T + 2 * FIN_P, FIN_P, 3], [BODY + FIN_T + 3 * FIN_P, FIN_P, 3]];
const ORDER = [4, 5, 2, 3, 1, 0];
// Paired fins: first ring, spine point they root at, px forward of it, how far out on the flank (share of the
// half-width), resting angle from the tailward direction, length, half-width, curl, part id.
const PAIRS = [[BODY + FIN_T, 2, 4.2, 0.74, 1.0, 17.5, 4.9, 0.5, 2], [BODY + FIN_T + 2 * FIN_P, 5, 0.5, 0.5, 0.52, 9, 3.3, 0.3, 3]];

const cr = (a, b, c, d) => (-a + 9 * b + 9 * c - d) / 16; // Catmull-Rom at the midpoint

export function createFish() {
  const pos = new Float32Array(MAXKOI * VERTS * 2);
  const A = new Float32Array(MAXKOI * VERTS * 4);
  const T = new Float32Array(MAXKOI * VERTS * 3);
  const C = new Float32Array(MAXKOI * VERTS * 4);
  // each koi's triangles, kept apart so the deepest koi can be drawn first
  const tris = Array.from({ length: MAXKOI }, (_, k) => {
    const list = [];
    for (const o of ORDER) {
      const [r0, n] = PARTS[o];
      for (let i = 0; i < n - 1; i++) { const a = (k * RINGS + r0 + i) * 2; list.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return list;
  });
  const PER = tris[0].length;
  const index = new Uint16Array(MAXKOI * PER); const order = []; let drawn = '';
  const geo = new THREE.BufferGeometry();
  const attr = (name, arr, size, dyn) => { const a = new THREE.BufferAttribute(arr, size); if (dyn) a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const aPos = attr('aPos', pos, 2, true); const aA = attr('aA', A, 4, true); const aT = attr('aT', T, 3, true); const aC = attr('aC', C, 4, false);
  const aIndex = new THREE.BufferAttribute(index, 1); aIndex.setUsage(THREE.DynamicDrawUsage); geo.setIndex(aIndex);

  // scratch, reused every frame
  const M = N + TAIL;
  const px = new Float32Array(M); const py = new Float32Array(M);
  const rx = new Float32Array(BODY); const ry = new Float32Array(BODY); const rw = new Float32Array(BODY); const rd = new Float32Array(BODY);
  const tx = new Float32Array(FIN_T); const ty = new Float32Array(FIN_T);

  // One ring: two vertices either side of c, EDGE px beyond the half-width w. (tx, ty) points down the part.
  let dive = 0;
  const ring = (v, cx, cy, tx_, ty_, u, w, extra) => {
    const l = Math.hypot(tx_, ty_) || 1; const ax = tx_ / l; const ay = ty_ / l; const e = w + EDGE;
    for (let s = -1; s <= 1; s += 2) {
      pos[v * 2] = cx - ay * e * s; pos[v * 2 + 1] = cy + ax * e * s;
      A[v * 4] = u; A[v * 4 + 1] = e * s; A[v * 4 + 2] = w; A[v * 4 + 3] = extra;
      T[v * 3] = ax; T[v * 3 + 1] = ay; T[v * 3 + 2] = dive;
      v++;
    }
  };

  // A paired fin: a fan rooted at (x, y) that leaves the body at angle phi from the tailward direction
  // (bx, by), on the side given by the lateral (lx, ly), and curls back along its length. Narrow at the root,
  // widest two thirds out, round at the tip.
  const fin = (v, x, y, bx, by, lx, ly, phi, len, wide, curl) => {
    let cx = x; let cy = y; let pu = 0;
    for (let i = 0; i < FIN_P; i++) {
      const u = FIN_U[i]; const a = phi - curl * u;
      const dx = bx * Math.cos(a) + lx * Math.sin(a); const dy = by * Math.cos(a) + ly * Math.sin(a);
      cx += dx * (u - pu) * len; cy += dy * (u - pu) * len; pu = u;
      ring(v + i * 2, cx, cy, dx, dy, u, wide * (0.22 * (1 - u) + Math.sin(Math.PI * u ** 1.7) ** 0.8), len);
    }
  };

  return {
    geo,
    // Variety, atlas strip and size never change while a koi lives: written once per stocking.
    stock(fish) {
      fish.forEach((f, k) => {
        for (const [r0, n, part] of PARTS) for (let i = 0; i < n * 2; i++) { const v = (k * RINGS + r0) * 2 + i; C[v * 4] = f.kind; C[v * 4 + 1] = k; C[v * 4 + 2] = f.z; C[v * 4 + 3] = part; }
      });
      aC.needsUpdate = true; drawn = '';
      geo.setDrawRange(0, fish.length * PER);
    },
    pose(fish, S) {
      order.length = fish.length;
      for (let k = 0; k < fish.length; k++) order[k] = k;
      order.sort((a, b) => fish[b].dive - fish[a].dive);
      if (order.join() !== drawn) { drawn = order.join(); order.forEach((k, slot) => index.set(tris[k], slot * PER)); aIndex.needsUpdate = true; }
      for (let k = 0; k < fish.length; k++) {
        const f = fish[k]; const s = S * f.z; const R = R0 * s; const sp = f.sp; const base = k * RINGS * 2;
        dive = f.dive;
        // the spine with its swimming wave: growing toward the tail and with speed
        const amp = (2.1 + f.v / (30 * f.z)) * s;
        for (let i = 0; i < M; i++) {
          const a = sp[Math.max(i, 1) - 1]; const b = sp[Math.max(i, 1)];
          const dx = a.x - b.x; const dy = a.y - b.y; const d = Math.hypot(dx, dy) || 1;
          const wig = Math.sin(f.swim - i * 0.7) * (i / N) ** 2 * amp * (i < N ? 1 : 1 - 0.12 * (i - N + 1));
          px[i] = sp[i].x - (dy / d) * wig; py[i] = sp[i].y + (dx / d) * wig;
        }
        // body rings: the snout's cap along the head's axis, then the spine points and the midpoints between them
        let hx = px[0] - px[1]; let hy = py[0] - py[1]; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
        const nx = px[0] + hx * NOSE * s; const ny = py[0] + hy * NOSE * s;
        let r = 0;
        for (; r < CAP.length; r++) { const c = CAP[r]; rx[r] = nx - hx * c * NOSE * s; ry[r] = ny - hy * c * NOSE * s; rw[r] = WID[0] * R * CAPW[r]; rd[r] = c * NOSE * s; }
        rx[0] += hx * EDGE; ry[0] += hy * EDGE;
        for (let j = 0; j <= (N - 1) * 2; j++, r++) {
          const i = j >> 1;
          if (j & 1) {
            const ax = i ? px[i - 1] : nx; const ay = i ? py[i - 1] : ny;
            rx[r] = cr(ax, px[i], px[i + 1], px[i + 2]); ry[r] = cr(ay, py[i], py[i + 1], py[i + 2]);
            rw[r] = R * cr(i ? WID[i - 1] : 0.62, WID[i], WID[i + 1], WID[Math.min(i + 2, N - 1)]);
          } else { rx[r] = px[i]; ry[r] = py[i]; rw[r] = R * WID[i]; }
          rd[r] = (NOSE + j * SEG * 0.5) * s;
        }
        for (let i = 0; i < BODY; i++) {
          const a = Math.max(i - 1, 0); const b = Math.min(i + 1, BODY - 1);
          const ex = i === BODY - 1 ? px[N] - rx[a] : rx[b] - rx[a]; const ey = i === BODY - 1 ? py[N] - ry[a] : ry[b] - ry[a];
          ring(base + i * 2, rx[i], ry[i], ex, ey, rd[i] / (LEN * s), rw[i], (rw[b] - rw[a]) / Math.max(rd[b] - rd[a], 1e-3));
        }
        // tail fin: an upright blade, so from above a sliver that only fans out where it flops over in a bend
        for (let j = 0; j < FIN_T; j++) {
          const i = N - 1 + (j >> 1);
          if (j & 1) { tx[j] = cr(px[i - 1], px[i], px[i + 1], px[Math.min(i + 2, M - 1)]); ty[j] = cr(py[i - 1], py[i], py[i + 1], py[Math.min(i + 2, M - 1)]); } else { tx[j] = px[i]; ty[j] = py[i]; }
        }
        const tl = TAIL * TSEG * s;
        const b0x = px[N - 1] - px[N - 3]; const b0y = py[N - 1] - py[N - 3]; const t0x = px[M - 1] - px[N - 1]; const t0y = py[M - 1] - py[N - 1];
        const flop = Math.min(1, 0.14 + 2.4 * Math.abs(b0x * t0y - b0y * t0x) / ((Math.hypot(b0x, b0y) || 1) * (Math.hypot(t0x, t0y) || 1)));
        for (let j = 0; j < FIN_T; j++) {
          const a = Math.max(j - 1, 0); const b = Math.min(j + 1, FIN_T - 1); const u = j / (FIN_T - 1);
          ring(base + (BODY + j) * 2, tx[j], ty[j], tx[b] - tx[a], ty[b] - ty[a], u, R * (0.2 + 0.3 * u ** 0.8 + 0.62 * flop * u), tl);
        }
        // paired fins: they scull at a cruise, fold back at speed, and the inside one opens in a turn
        const fast = Math.min(1, f.v / (24 * s * 3.2));
        for (const [ringAt, i, fwd, out, phi0, len, wide, curl, part] of PAIRS) {
          let bx = px[i + 1] - px[i - 1]; let by = py[i + 1] - py[i - 1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
          for (let side = -1; side <= 1; side += 2) {
            const lx = -by * side; const ly = bx * side;
            const scull = Math.sin(f.swim * 0.42 + side * 0.9 + part) * 0.2;
            const phi = phi0 + scull - 0.5 * fast + Math.max(-0.3, Math.min(0.45, -side * f.w * 0.55));
            const w = R * WID[i] * out;
            fin(base + (ringAt + (side > 0 ? FIN_P : 0)) * 2, px[i] - bx * fwd * s + lx * w, py[i] - by * fwd * s + ly * w, bx, by, lx, ly, phi, len * s, wide * s, curl);
          }
        }
      }
      aPos.needsUpdate = aA.needsUpdate = aT.needsUpdate = true;
    },
  };
}
