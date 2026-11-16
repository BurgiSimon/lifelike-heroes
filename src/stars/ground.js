// The land under the sky, as three skylines across the hero's width (px above its bottom edge): the far ridge
// across the fjord, the near hill, and the near hill with what stands on it (spruce, the observatory dome).
// Built on the CPU so the chart knows where the sky ends; the shader shades them and softens their edges.
import { rnd, clamp } from '../shared/kit.js';

const smooth = (t) => t * t * (3 - 2 * t);
// 1D value noise, seeded: the same land on every load.
const noise = (x, seed) => { const i = Math.floor(x); const f = x - i; return rnd(i * 7 + seed * 1013) * (1 - smooth(f)) + rnd((i + 1) * 7 + seed * 1013) * smooth(f); };
const fbm = (x, seed, oct = 4) => { let v = 0; let a = 0.5; let f = 1; for (let o = 0; o < oct; o++) { v += a * noise(x * f, seed + o * 17); a *= 0.5; f *= 2.07; } return v; };
// Peaks rather than hills: each octave folded about its middle.
const ridged = (x, seed, oct = 5) => { let v = 0; let a = 0.5; let f = 1; for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(2 * noise(x * f, seed + o * 31) - 1); v += a * n * n; a *= 0.48; f *= 2.13; } return v; };

export function buildGround(W, H) {
  const U = clamp(H * 0.105, 54, 112);          // one unit of ridge height; the land keeps its shape, a phone sees less of it
  const n = Math.min(4096, Math.ceil(W * 2) + 1);
  const data = new Float32Array(n * 4);         // far, near, cover, unused
  const step = W / (n - 1);
  const domeX = W - clamp(W * 0.17, 74, 250);   // the observatory, on the near hill to the right
  const domeR = U * 0.13;

  // Spruce along the near hill: clumps and gaps, no two alike.
  const trees = [];
  for (let x = -20, k = 0; x < W + 20; k++) {
    const s = (x - W) / U;
    const thick = smooth(clamp((fbm(s * 0.55 + 40, 5, 2) - 0.36) * 3.2, 0, 1));
    x += U * (0.035 + 0.16 * rnd(k * 3 + 1) * (1.6 - thick)) + (thick < 0.05 ? U * 0.5 : 0);
    if (thick < 0.05 || Math.abs(x - domeX) < domeR * 3.2) continue;
    const h = U * (0.07 + 0.2 * rnd(k * 3 + 2) ** 1.6) * (0.55 + 0.6 * thick);
    trees.push({ x, h, w: h * (0.2 + 0.1 * rnd(k * 3 + 3)), lean: (rnd(k * 5 + 9) - 0.5) * 0.12, tiers: 3 + Math.floor(rnd(k * 7 + 4) * 4), ph: rnd(k * 11 + 6) });
  }

  let top = 0;
  for (let i = 0; i < n; i++) {
    const x = i * step; const s = (x - W) / U;
    // Far ridge: alpine, lower to the left where the headline stands, a massif right of centre.
    const far = U * (0.34 + 0.72 * ridged(s * 0.21 + 3.1, 1) * (0.62 + 0.38 * smooth(clamp((s + 15) / 9, 0, 1))) + 0.06 * fbm(s * 2.3, 9, 3) + 0.018 * fbm(s * 11, 21, 3));
    // Near hill: rolling, rising toward the dome.
    const rise = Math.exp(-(((x - domeX) / (U * 3.4)) ** 2));
    const near = U * (0.2 + 0.2 * fbm(s * 0.33 + 11, 3) + 0.17 * rise + 0.012 * fbm(s * 7, 13, 2));
    data[i * 4] = far; data[i * 4 + 1] = near; data[i * 4 + 2] = near;
  }
  const nearAt = (x) => { const f = clamp(x / step, 0, n - 1.001); const i = Math.floor(f); return data[i * 4 + 1] + (data[(i + 1) * 4 + 1] - data[i * 4 + 1]) * (f - i); };
  for (const t of trees) {
    const base = nearAt(t.x) - 1.5;
    for (let i = Math.max(0, Math.floor((t.x - t.w - 2) / step)); i <= Math.min(n - 1, Math.ceil((t.x + t.w + 2) / step)); i++) {
      const d = Math.abs(i * step - t.x - t.lean * t.h) / t.w;
      if (d >= 1) continue;
      // A spruce: a spire whose boughs step out in tiers.
      const up = 1 - d; const tier = (up * t.tiers + t.ph) % 1;
      const y = base + t.h * clamp(up ** 0.85 - 0.11 * tier * (1 - up * 0.7), 0, 1);
      if (y > data[i * 4 + 2]) data[i * 4 + 2] = y;
    }
  }
  // The dome: a drum, a hemisphere, the raised lip of its shutter; a low annex beside it.
  const domeBase = nearAt(domeX) - 1;
  for (let i = Math.max(0, Math.floor((domeX - domeR * 4) / step)); i <= Math.min(n - 1, Math.ceil((domeX + domeR * 4) / step)); i++) {
    const dx = i * step - domeX; let y = 0;
    if (Math.abs(dx) < domeR) y = domeBase + domeR * 0.75 + Math.sqrt(domeR * domeR - dx * dx) + (dx > -domeR * 0.28 && dx < domeR * 0.1 ? domeR * 0.07 : 0);
    else if (Math.abs(dx) < domeR * 1.06) y = domeBase + domeR * 0.75;
    else if (dx > domeR * 1.06 && dx < domeR * 3.3) y = domeBase + domeR * 0.62;
    if (y > data[i * 4 + 2]) data[i * 4 + 2] = y;
  }
  for (let i = 0; i < n; i++) top = Math.max(top, data[i * 4], data[i * 4 + 2]);

  return {
    data, n, top, U,
    lamp: { x: domeX + domeR * 1.5, y: H - domeBase - domeR * 0.3 },  // the red work light by the door
    dome: { x: domeX, y: H - domeBase - domeR * 0.75, r: domeR },      // centre of the hemisphere, for its highlight
    // y (CSS px, down) where the sky ends at x.
    skyline(x) { const f = clamp(x / step, 0, n - 1.001); const i = Math.floor(f); const t = f - i; return H - Math.max(data[i * 4] + (data[(i + 1) * 4] - data[i * 4]) * t, data[i * 4 + 2] + (data[(i + 1) * 4 + 2] - data[i * 4 + 2]) * t); },
  };
}
