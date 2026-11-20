// Builds the hero's light from its public source (see public/assets/movement/CREDITS.md):
//   studio.webp   Poly Haven's Studio Small 09 (2k HDR), as the movement on the bench sees it: the half of the room
//                 the plates can mirror, flattened about the lens's axis, at seven widths of blur (ENV in optics.js
//                 says how it is laid out and coded). Lossless: a lamp's edge in a polished bevel shows every error.
// The source is not kept in the repo:
//   node .claude/skills/lifelike-hero/scripts/find-asset.mjs get studio_small_09 hdr --res 2k --out studio_small_09_2k.hdr
// Run from the project root:
//   node src/movement/tools/build-assets.mjs --studio studio_small_09_2k.hdr --out public/assets/movement
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { ENV, ENV_K } from '../optics.js';

const { values: o } = parseArgs({ options: { studio: { type: 'string' }, out: { type: 'string' }, zenith: { type: 'string' }, roll: { type: 'string' }, exposure: { type: 'string' }, preview: { type: 'string' } } });
if (!o.studio || !o.out) { console.error('usage: build-assets.mjs --studio <2k .hdr> --out public/assets/movement'); process.exit(2); }
fs.mkdirSync(o.out, { recursive: true });
const zen = o.zenith ? o.zenith.split(',').map(Number) : ENV.zenith; const roll = Number(o.roll ?? ENV.roll) * Math.PI / 180; const gain = Number(o.exposure ?? ENV.exposure);

// A Radiance .hdr, run-length coded a row at a time, to linear RGB floats.
const buf = fs.readFileSync(o.studio);
let at = buf.indexOf('\n\n') + 2; const dims = /-Y (\d+) \+X (\d+)/.exec(buf.subarray(at, buf.indexOf('\n', at)).toString());
if (!dims) throw new Error('not a top-down Radiance picture');
const H = Number(dims[1]); const W = Number(dims[2]); at = buf.indexOf('\n', at) + 1;
const src = new Float32Array(W * H * 3); const line = new Uint8Array(W * 4);
for (let y = 0; y < H; y++) {
  if (buf[at] !== 2 || buf[at + 1] !== 2 || ((buf[at + 2] << 8) | buf[at + 3]) !== W) throw new Error(`row ${y}: not the run-length coding this reads`);
  at += 4;
  for (let c = 0; c < 4; c++) for (let x = 0; x < W;) {
    let n = buf[at++];
    if (n > 128) { n -= 128; const v = buf[at++]; line.fill(v, c * W + x, c * W + x + n); x += n; } else { line.set(buf.subarray(at, at + n), c * W + x); at += n; x += n; }
  }
  for (let x = 0; x < W; x++) { const e = line[3 * W + x]; const s = e ? 2 ** (e - 136) * gain : 0; const i = (y * W + x) * 3; src[i] = line[x] * s; src[i + 1] = line[W + x] * s; src[i + 2] = line[2 * W + x] * s; }
}
// The panorama at halving sizes: a wide blur reads a small copy, so its taps do not fall between the lamps.
const pyr = [{ w: W, h: H, d: src }];
while (pyr.at(-1).w > 32) {
  const a = pyr.at(-1); const w = a.w >> 1; const h = a.h >> 1; const d = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) d[(y * w + x) * 3 + c] = 0.25 * (a.d[(2 * y * a.w + 2 * x) * 3 + c] + a.d[(2 * y * a.w + 2 * x + 1) * 3 + c] + a.d[((2 * y + 1) * a.w + 2 * x) * 3 + c] + a.d[((2 * y + 1) * a.w + 2 * x + 1) * 3 + c]);
  pyr.push({ w, h, d });
}
const px = [0, 0, 0];
// Bilinear tap of one copy in the direction (x, y, z) of the panorama's own frame (y up), added to px.
const tap = (p, x, y, z, wt) => {
  const u = (Math.atan2(z, x) / (2 * Math.PI) + 1) % 1 * p.w - 0.5; const v = Math.min(p.h - 1.001, Math.max(0, Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI * p.h - 0.5));
  const x0 = Math.floor(u); const y0 = Math.floor(v); const fx = u - x0; const fy = v - y0;
  for (let k = 0; k < 4; k++) {
    const i = ((y0 + (k >> 1)) * p.w + (((x0 + (k & 1)) % p.w) + p.w) % p.w) * 3; const s = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy) * wt;
    px[0] += p.d[i] * s; px[1] += p.d[i + 1] * s; px[2] += p.d[i + 2] * s;
  }
};
// The movement's frame, written in the panorama's: Z leaves the plates toward the lens, Y is up the picture.
const dir = (u, v) => { const az = 2 * Math.PI * u; const el = Math.PI / 2 - Math.PI * v; return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const Z = dir(zen[0], zen[1]);
let Y = norm([0 - Z[0] * Z[1], 1 - Z[1] * Z[1], 0 - Z[2] * Z[1]]); let X = cross(Y, Z);
{ const c = Math.cos(roll); const s = Math.sin(roll); const x2 = X.map((v, i) => v * c + Y[i] * s); const y2 = Y.map((v, i) => Y[i] * c - X[i] * s); X = x2; Y = y2; }

// A fixed spray of points under a bell curve one unit wide, for the blurs.
const N = 192; const spray = [];
for (let i = 0; i < N; i++) { const r = Math.sqrt(-2 * Math.log(1 - (i + 0.5) / N * 0.985)); const a = i * 2.39996323; spray.push([r * Math.cos(a), r * Math.sin(a)]); }

const sizes = Array.from({ length: ENV.levels }, (_, k) => ENV.size >> k); const AW = sizes.reduce((a, b) => a + b, 0); const AH = ENV.size;
const out = Buffer.alloc(AW * AH * 2 * 3); let x0 = 0; let peak = 0;
const previews = [];
for (let k = 0; k < ENV.levels; k++) {
  const s = sizes[k]; const sigma = ENV.blur[k] * Math.PI / 180; const lin = new Float32Array(s * s * 3);
  // the copy of the panorama whose texels are about a third of the blur wide
  const want = Math.max(sigma / 3, 2 * Math.PI / W); const p = pyr[Math.min(pyr.length - 1, Math.max(0, Math.round(Math.log2(want / (2 * Math.PI / W)))))];
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    px[0] = px[1] = px[2] = 0;
    const taps = k ? N : 16;
    for (let n = 0; n < taps; n++) {
      // level 0: sixteen taps under a tent two texels wide, so a lamp's edge is neither stair-stepped nor doubled
      let qx; let qy; let wt;
      if (k) { qx = ((i + 0.5) / s * 2 - 1) * ENV_K; qy = (1 - (j + 0.5) / s * 2) * ENV_K; wt = 1 / N; } else {
        const dx = ((n & 3) + 0.5) / 2 - 1; const dy = ((n >> 2) + 0.5) / 2 - 1; wt = (1 - Math.abs(dx)) * (1 - Math.abs(dy)) / 4;
        qx = ((i + 0.5 + dx) / s * 2 - 1) * ENV_K; qy = (1 - (j + 0.5 + dy) / s * 2) * ENV_K;
      }
      const r2 = Math.min(qx * qx + qy * qy, ENV_K * ENV_K * 1.02); const q = Math.sqrt(r2 / Math.max(1e-9, qx * qx + qy * qy)); qx *= q; qy *= q;   // past the edge: the edge, again
      let d = [2 * qx / (1 + r2), 2 * qy / (1 + r2), (1 - r2) / (1 + r2)];
      if (k) {
        const t1 = norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0])); const t2 = cross(d, t1); const [a, b] = spray[n];
        d = norm([d[0] + sigma * (a * t1[0] + b * t2[0]), d[1] + sigma * (a * t1[1] + b * t2[1]), d[2] + sigma * (a * t1[2] + b * t2[2])]);
      }
      tap(p, d[0] * X[0] + d[1] * Y[0] + d[2] * Z[0], d[0] * X[1] + d[1] * Y[1] + d[2] * Z[1], d[0] * X[2] + d[1] * Y[2] + d[2] * Z[2], wt);
    }
    lin.set(px, (j * s + i) * 3);
  }
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const r = lin[(j * s + i) * 3]; const g = lin[(j * s + i) * 3 + 1]; const b = lin[(j * s + i) * 3 + 2];
    const m = Math.min(ENV.max, Math.max(r, g, b, 1e-4)); peak = Math.max(peak, Math.max(r, g, b));
    const m8 = Math.min(255, Math.ceil(255 * (m / ENV.max) ** 0.25)); const mq = ENV.max * (m8 / 255) ** 4;
    const a = ((j) * AW + x0 + i) * 3; const e = ((AH + j) * AW + x0 + i) * 3;
    out[a] = Math.round(255 * Math.sqrt(Math.min(1, r / mq))); out[a + 1] = Math.round(255 * Math.sqrt(Math.min(1, g / mq))); out[a + 2] = Math.round(255 * Math.sqrt(Math.min(1, b / mq)));
    out[e] = out[e + 1] = out[e + 2] = m8;
  }
  if (k === 3) {
    // Where the light comes from, as a flat plate facing the lens gets it: every direction weighed by how bright
    // it is and how squarely it falls on the plate. optics.js keeps the answer (KEY); the shadows are thrown by it.
    let sx = 0; let sy = 0; let sz = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const qx = ((i + 0.5) / s * 2 - 1) * ENV_K; const qy = (1 - (j + 0.5) / s * 2) * ENV_K; const r2 = qx * qx + qy * qy; const dz = (1 - r2) / (1 + r2);
      if (r2 > ENV_K * ENV_K || dz <= 0) continue;
      const l = (0.2126 * lin[(j * s + i) * 3] + 0.7152 * lin[(j * s + i) * 3 + 1] + 0.0722 * lin[(j * s + i) * 3 + 2]) * dz / (1 + r2) ** 2;   // a texel's share of the sky shrinks toward the map's edge
      sx += l * 2 * qx / (1 + r2); sy += l * 2 * qy / (1 + r2); sz += l * dz;
    }
    const flat = Math.hypot(sx, sy);
    console.log(`the light leans toward (${(sx / flat).toFixed(2)}, ${(sy / flat).toFixed(2)}) of the picture, ${(Math.atan2(flat, sz) * 180 / Math.PI).toFixed(0)}° off the lens's axis (tangent ${(flat / sz).toFixed(2)})`);
  }
  if (o.preview) {
    const img = Buffer.alloc(s * s * 3);
    for (let i = 0; i < s * s * 3; i++) { const v = lin[i] * 0.6; img[i] = Math.round(255 * Math.min(1, v / (1 + v)) ** (1 / 2.2)); }
    previews.push(sharp(img, { raw: { width: s, height: s, channels: 3 } }).resize(512, 512, { kernel: 'nearest' }).png().toFile(`${o.preview}-${k}.png`));
  }
  x0 += s;
}
await Promise.all(previews);
const file = path.join(o.out, 'studio.webp');
await sharp(out, { raw: { width: AW, height: AH * 2, channels: 3 } }).webp({ lossless: true, effort: 6 }).toFile(file);
console.log(`${file}: ${AW} × ${AH * 2}, ${(fs.statSync(file).size / 1e3).toFixed(0)} KB, brightest ${peak.toFixed(1)} (kept to ${ENV.max}), lens axis at ${zen.join(', ')} of the panorama, roll ${(roll * 180 / Math.PI).toFixed(0)}°`);
