// The fine spray between the drops: thousands of beads too small to follow one by one, laid out once into a tile
// that repeats across the pane. Per texel: r, g the bead's surface normal (y down, 0.5 = flat), b its coverage, a the
// share of mist that has to have settled before this bead is there, so a swept pane beads over again one by one.
import { rnd } from '../shared/kit.js';

export const MIST = { size: 1024, density: 2 };   // texels a side, and texels per CSS px: one repeat is glsl.js's TILE

export function mistTile() {
  const S = MIST.size; const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = data[i * 4 + 1] = 128; data[i * 4 + 3] = 255; }
  const MIN = 0.6 * MIST.density; const MAXR = 2.7 * MIST.density;
  // Laid large ones first, none touching: beads that touch have long since run together, which is why the big
  // ones stand in a clearing.
  const CELL = Math.ceil(MAXR * 2.4); const G = Math.ceil(S / CELL); const grid = Array.from({ length: G * G }, () => []);
  const TRIES = 30000;
  for (let k = 0; k < TRIES; k++) {
    const r = MIN + (MAXR - MIN) * (1 - k / TRIES) ** 4.5; const x = rnd(k * 3 + 1) * S; const y = rnd(k * 3 + 2) * S;
    const gx = Math.floor(x / CELL); const gy = Math.floor(y / CELL); let free = true;
    for (let j = -1; j <= 1 && free; j++) for (let i = -1; i <= 1 && free; i++) {
      for (const b of grid[((gy + j + G) % G) * G + ((gx + i + G) % G)]) {
        let dx = Math.abs(b.x - x); let dy = Math.abs(b.y - y); if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy;
        if (dx * dx + dy * dy < ((b.r + r) * 1.3 + 1.2) ** 2) { free = false; break; }
      }
    }
    if (!free) continue;
    grid[gy * G + gx].push({ x, y, r });
    const due = Math.round(255 * Math.min(0.96, 0.08 + 0.52 * rnd(k * 3 + 3) + 0.4 * (r - MIN) / (MAXR - MIN)));   // the large ones are the last to form
    const squash = 0.86 + 0.3 * rnd(k * 3 + 7); const pad = Math.ceil(r * 1.2 + 2);
    for (let j = -pad; j <= pad; j++) for (let i = -pad; i <= pad; i++) {
      const px = Math.floor(x) + i; const py = Math.floor(y) + j;
      const dx = (px + 0.5 - x) * squash; const dy = (py + 0.5 - y) / squash; const d = Math.hypot(dx, dy) / r;
      const at = ((((py % S) + S) % S) * S + (((px % S) + S) % S)) * 4;
      if (d >= 1 + 0.5 / r) { if (data[at + 2] === 0 && d < 1 + 2 / r) data[at + 3] = due; continue; }   // around it: only its turn, so a soft edge does not bring it early
      const cov = Math.min(1, Math.max(0, (1 - d) * r + 0.5)); if (cov * 255 < data[at + 2]) continue;
      data[at] = Math.round(127.5 + 127.5 * (dx / r) / Math.max(d, 1)); data[at + 1] = Math.round(127.5 + 127.5 * (dy / r) / Math.max(d, 1));
      data[at + 2] = Math.round(cov * 255); data[at + 3] = due;
    }
  }
  return data;
}
