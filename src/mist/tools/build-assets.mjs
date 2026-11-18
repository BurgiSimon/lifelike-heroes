// Builds the city behind the glass from one photographed night panorama (a Poly Haven HDRI, which keeps the true
// brightness of every lamp). The scene's lens is focused on the pane half a metre away, so the city is far out of
// focus: every lamp is a disc as wide as the aperture looks from the glass. That blur is made here, in linear
// light, from the lamps' real energy; a tone-mapped JPG could not do it, because its lamps are clipped to white.
//
//   city_base.webp   the defocused city up to paper white (sRGB), in the lens's own projection: x and y are the
//                    tangent of the angle off axis, ±TX by ±TY, so one picture serves every shape of frame
//   city_glow.webp   what is brighter than that: the discs of the lamps, (c - 1) / GLOW, square-root encoded
//   city_wide.webp   the same view in focus and very wide (±LON by ±LAT, longitude by latitude), for the drops:
//                    each one is a small strong lens that shows the whole city upside down. (c / WIDE) ^ (1 / 2.2)
//
//   node src/mist/tools/build-assets.mjs --hdr hansaplatz_4k.hdr --out public/assets/mist [--preview dir]
//
// The numbers a shader needs to read these back are exported from ../optics.js; this file imports them too.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { TX, TY, DISC, GLOW, WIDE, LON, LAT, YAW, PITCH, GAIN } from '../optics.js';

const { values: o } = parseArgs({ options: { hdr: { type: 'string' }, out: { type: 'string' }, preview: { type: 'string' }, width: { type: 'string', default: '2048' }, yaw: { type: 'string' }, pitch: { type: 'string' }, gain: { type: 'string' } } });
if (!o.hdr || !(o.out || o.preview)) { console.error('usage: build-assets.mjs --hdr <panorama.hdr> --out <dir> [--preview <dir>]'); process.exit(1); }
const yaw = Number(o.yaw ?? YAW) * Math.PI / 180; const pitch = Number(o.pitch ?? PITCH) * Math.PI / 180; const gain = Number(o.gain ?? GAIN);

const buf = fs.readFileSync(o.hdr);
const { data: pano, width: PW, height: PH } = new HDRLoader().setDataType(FloatType).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const C = pano.length / (PW * PH);   // 4 (rgba) in current three, 3 in older

// The panorama's light arriving from longitude lon (0: its centre, east positive) and latitude lat, bilinear.
const sky = (lon, lat, out, k) => {
  let u = (lon / (2 * Math.PI) + 0.5) * PW - 0.5; const v = Math.min(PH - 1.001, Math.max(0, (0.5 - lat / Math.PI) * PH - 0.5));
  u = ((u % PW) + PW) % PW;
  const x0 = Math.floor(u); const y0 = Math.floor(v); const fx = u - x0; const fy = v - y0; const x1 = (x0 + 1) % PW; const y1 = y0 + 1;
  for (let c = 0; c < 3; c++) {
    const a = pano[(y0 * PW + x0) * C + c]; const b = pano[(y0 * PW + x1) * C + c]; const d = pano[(y1 * PW + x0) * C + c]; const e = pano[(y1 * PW + x1) * C + c];
    out[k + c] = gain * ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
  }
};

// ---- the view through the lens, in focus: a pinhole looking along (yaw, pitch)
const W = Number(o.width); const H = Math.round(W * TY / TX); const pxPerTan = W / (2 * TX);
const view = new Float32Array(W * H * 3);
const cp = Math.cos(pitch); const sp = Math.sin(pitch);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const tx = (x + 0.5) / pxPerTan - TX; const ty = TY - (y + 0.5) / pxPerTan;
  // camera space: x right, y up, z forward; pitched up, then turned
  const dy = ty * cp + sp; const dz = cp - ty * sp; const len = Math.hypot(tx, dy, dz);
  sky(yaw + Math.atan2(tx, dz), Math.asin(dy / len), view, (y * W + x) * 3);
}
// A lamp's core can be thousands of times paper white, and a handful of them would wash the frame out once they are
// spread into discs. A sensor would have clipped them long before: hold each pixel to what makes a disc of CORE.
const R = DISC / 2 * pxPerTan; const area = Math.PI * R * R; const CORE = 9;
for (let i = 0; i < view.length; i += 3) { const m = Math.max(view[i], view[i + 1], view[i + 2]); const cap = CORE * area / 6; if (m > cap) { const k = cap / m; view[i] *= k; view[i + 1] *= k; view[i + 2] *= k; } }

// ---- out of focus: every point becomes the aperture's disc. A disc is a stack of rows of different lengths, so
// with running sums along each row this costs the disc's height per pixel, not its area.
const sums = new Float64Array((W + 1) * H * 3);
for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) { let s = 0; sums[(y * (W + 1)) * 3 + c] = 0; for (let x = 0; x < W; x++) { s += view[(y * W + x) * 3 + c]; sums[(y * (W + 1) + x + 1) * 3 + c] = s; } }
const disc = (radius) => {
  const out = new Float32Array(W * H * 3); const r = Math.ceil(radius); let n = 0;
  const half = []; for (let dy = -r; dy <= r; dy++) { const h = Math.sqrt(Math.max(0, radius * radius - dy * dy)); half.push(h); n += 2 * h + 1; }
  for (let y = 0; y < H; y++) for (let dy = -r; dy <= r; dy++) {
    const yy = Math.min(H - 1, Math.max(0, y + dy)); const h = half[dy + r]; const hi = Math.floor(h); const f = h - hi; const row = yy * (W + 1);
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, x - hi); const b = Math.min(W, x + hi + 1); const a2 = Math.max(0, a - 1); const b2 = Math.min(W, b + 1);
      const k = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) out[k + c] += (sums[(row + b) * 3 + c] - sums[(row + a) * 3 + c]) + f * ((sums[(row + b2) * 3 + c] - sums[(row + b) * 3 + c]) + (sums[(row + a) * 3 + c] - sums[(row + a2) * 3 + c]));   // the row's two ends are part-covered
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
};
// A fast lens wide open draws its discs a little brighter toward the rim (over-corrected spherical aberration).
const RIM = 0.16; const INNER = 0.84;
const full = disc(R); const core = disc(R * INNER);
const lens = new Float32Array(W * H * 3);
for (let i = 0; i < lens.length; i++) lens[i] = ((1 + RIM) * full[i] - RIM * INNER * INNER * core[i]) / (1 + RIM - RIM * INNER * INNER);

// ---- in focus and wide, for the drops
const WW = 1024; const WH = Math.round(WW * LAT / LON);
const wide = new Float32Array(WW * WH * 3);
for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
  // four taps a pixel: a lamp is smaller than a pixel here and must not fall between them
  const acc = [0, 0, 0]; const t = [0, 0, 0];
  for (let s = 0; s < 4; s++) {
    const lon = (((x + 0.25 + 0.5 * (s & 1)) / WW) * 2 - 1) * LON * Math.PI / 180; const lat = (1 - ((y + 0.25 + 0.5 * (s >> 1)) / WH) * 2) * LAT * Math.PI / 180;
    sky(yaw + lon, pitch + lat, t, 0); acc[0] += t[0] / 4; acc[1] += t[1] / 4; acc[2] += t[2] / 4;
  }
  wide.set(acc, (y * WW + x) * 3);
}

// ---- write
const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const bytes = (n, f) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = Math.round(255 * Math.min(1, Math.max(0, f(i)))); return b; };
const save = (data, w, h, file, quality) => sharp(data, { raw: { width: w, height: h, channels: 3 } }).webp({ quality, effort: 5, smartSubsample: true }).toFile(file).then(() => console.log(`${file}: ${(fs.statSync(file).size / 1e3).toFixed(0)} kB`));
const lum = []; for (let i = 0; i < lens.length; i += 3 * 97) lum.push(0.2126 * lens[i] + 0.7152 * lens[i + 1] + 0.0722 * lens[i + 2]);
lum.sort((a, b) => a - b); const pct = (p) => lum[Math.floor(p * (lum.length - 1))].toFixed(3);
console.log(`defocused view ${W}x${H}, disc ${(2 * R).toFixed(1)} px; luminance p10 ${pct(0.1)} p50 ${pct(0.5)} p90 ${pct(0.9)} p99 ${pct(0.99)} max ${pct(1)}`);
if (o.out) {
  fs.mkdirSync(o.out, { recursive: true });
  await save(bytes(lens.length, (i) => srgb(Math.min(1, lens[i]))), W, H, path.join(o.out, 'city_base.webp'), 86);
  await save(bytes(lens.length, (i) => Math.sqrt(Math.max(0, lens[i] - 1) / GLOW)), W, H, path.join(o.out, 'city_glow.webp'), 84);
  await save(bytes(wide.length, (i) => (wide[i] / WIDE) ** (1 / 2.2)), WW, WH, path.join(o.out, 'city_wide.webp'), 88);
}
if (o.preview) {
  // for the eye, while choosing where the camera points: a plain film curve, no grade
  fs.mkdirSync(o.preview, { recursive: true });
  const film = (v) => srgb(1 - Math.exp(-1.1 * v));
  const tag = path.basename(o.hdr, '.hdr');
  await sharp(bytes(lens.length, (i) => film(lens[i])), { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(o.preview, `${tag}_lens.png`));
  await sharp(bytes(view.length, (i) => film(view[i])), { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(o.preview, `${tag}_view.png`));
  await sharp(bytes(wide.length, (i) => film(wide[i])), { raw: { width: WW, height: WH, channels: 3 } }).png().toFile(path.join(o.preview, `${tag}_wide.png`));
}
