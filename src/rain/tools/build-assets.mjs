// Builds the hero's three pictures from one Poly Haven panorama (see public/assets/rain/CREDITS.md):
//   bokeh.webp  the city as the camera sees it past the glass: a VIEW.fov° view of the panorama in linear light,
//               thrown out of focus with the lens's own blur (every source pixel becomes a disc BOKEH.radius of the
//               frame's width across, a little brighter at its rim, clipped to a cat's eye towards the corners).
//               Blurring the high-dynamic-range data is what makes a lamp a bright disc and a wall a soft wash.
//   haze.webp   the same view through condensation: a wide Gaussian of it, small.
//   lens.webp   what a drop on the glass shows: the scene as a fisheye about the same axis (LENS.span° from it at
//               the middle of the square's edge, dark beyond), nearly sharp, since a drop is a lens of its own. The
//               file is an atlas: the 512² picture on the left and, in a column to its right, every smaller level
//               of it, each averaged from the linear light before it is encoded. A drop a few pixels across reads
//               a small level, and a lamp is still a spark there instead of an average of clipped texels.
// All three are stored as cbrt(value / MAX): 8 bits then keep both the night and the lamps. glsl.js holds MAX too.
// Run from the project root (the lens blur is exact, not sampled: it takes a minute or two):
//   node src/rain/tools/build-assets.mjs --pano shanghai_bund_8k.hdr --out public/assets/rain [--preview dir]
// --preview writes each picture as a screen would show it, to choose a view by (--yaw, --pitch, --fov, in degrees;
// a negative value needs the form --pitch=-4). --lens-only leaves bokeh.webp and haze.webp as they are.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export const MAX = { bokeh: 6, haze: 4, lens: 32 };   // glsl.js holds the same numbers

const { values: o } = parseArgs({ options: {
  pano: { type: 'string' }, out: { type: 'string' }, preview: { type: 'string' },
  yaw: { type: 'string', default: '28' }, pitch: { type: 'string', default: '1' }, fov: { type: 'string', default: '52' },
  gain: { type: 'string', default: '0.8' }, radius: { type: 'string', default: '0.031' }, width: { type: 'string', default: '2048' }, height: { type: 'string', default: '1400' },
  floor: { type: 'string', default: '2' }, sat: { type: 'string', default: '1.1' }, exposure: { type: 'string', default: '1' }, knee: { type: 'string', default: '60' }, 'lens-floor': { type: 'string', default: '0.3' }, 'lens-only': { type: 'boolean' },
} });
const VIEW = { yaw: +o.yaw, pitch: +o.pitch, fov: +o.fov };
const BOKEH = { radius: +o.radius, rim: 0.34, eye: 0.5 };   // radius: share of the frame's width; rim: how much of a disc's light sits in its outer ring
const LENS = { size: 512, span: 96, fade: [58, 90] };
const W = +o.width; const H = +o.height; const gain = +o.gain;

const buf = fs.readFileSync(o.pano);
const { data, width: PW, height: PH } = new HDRLoader().setDataType(FloatType).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const ch = data.length / (PW * PH);
console.log(`panorama ${PW}×${PH}`);

// ---- the camera: yaw to the right, pitch up, both in degrees
const rad = Math.PI / 180;
const cy = Math.cos(VIEW.yaw * rad); const sy = Math.sin(VIEW.yaw * rad); const cp = Math.cos(VIEW.pitch * rad); const sp = Math.sin(VIEW.pitch * rad);
const px = [0, 0, 0];
// Adds the panorama's light from the camera-space direction (x right, y up, z forward) to px. Bilinear.
const FLOOR = +o.floor; const sat = +o.sat; const knee = +o.knee;
function tap(x, y, z, k) {
  const y1 = y * cp + z * sp; const z1 = z * cp - y * sp;        // pitch
  const x2 = x * cy + z1 * sy; const z2 = z1 * cy - x * sy;      // yaw
  const lon = Math.atan2(x2, z2); const lat = Math.asin(y1 / Math.hypot(x2, y1, z2));
  const u = (((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1 * PW - 0.5; const v = Math.min(PH - 1.001, Math.max(0, (0.5 - lat / Math.PI) * PH - 0.5));
  const x0 = Math.floor(u); const y0 = Math.floor(v); const fx = u - x0; const fy = v - y0;
  const xa = ((x0 % PW) + PW) % PW; const xb = (xa + 1) % PW; const ya = y0 * PW; const yb = (y0 + 1) * PW;
  const w00 = (1 - fx) * (1 - fy) * k; const w10 = fx * (1 - fy) * k; const w01 = (1 - fx) * fy * k; const w11 = fx * fy * k;
  for (let c = 0; c < 3; c++) px[c] += data[(ya + xa) * ch + c] * w00 + data[(ya + xb) * ch + c] * w10 + data[(yb + xa) * ch + c] * w01 + data[(yb + xb) * ch + c] * w11;
}
// The night as a camera set for the lamps sees it: what is merely lit (walls, sky, pavement) sinks, and colour
// deepens a little, as it does on an exposure this short.
function grade(out, i, held = true, floor = FLOOR) {
  const l = 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
  let k = gain * (l / (l + floor));   // floor: the luminance below which the picture falls away to black
  // and the nearest lamps are held back (a logarithmic knee), or their discs are flat white with nothing in them
  const lit = l * k; if (held && lit > knee) k *= (knee * (1 + Math.log(lit / knee))) / lit;
  for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, l + (px[c] - l) * sat) * k;
}

// ---- 1. the sharp view, in linear light
const t0 = Date.now();
const f = 1 / Math.tan((VIEW.fov * rad) / 2);   // focal length in half-widths
const view = new Float32Array(W * H * 3);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    px[0] = px[1] = px[2] = 0;
    for (let s = 0; s < 4; s++) tap(((i + 0.25 + (s & 1) * 0.5) / W) * 2 - 1, -(((j + 0.25 + (s >> 1) * 0.5) / H) * 2 - 1) * (H / W), f, 0.25);
    grade(view, (j * W + i) * 3);
  }
}
console.log(`view ${W}×${H} in ${Date.now() - t0} ms`);

// ---- 2. the lens blur. A disc is a stack of rows, and a row of a picture is two look-ups in its running sums.
function discBlur(src, w, h, R, { rim = 0, eye = 0 } = {}) {
  const sum = new Float64Array((w + 1) * h * 3);   // sum[y][x] = everything left of x in row y
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) sum[(y * (w + 1) + x + 1) * 3 + c] = sum[(y * (w + 1) + x) * 3 + c] + src[(y * w + x) * 3 + c];
  const out = new Float32Array(w * h * 3); const acc = [0, 0, 0, 0];
  const Ri = R * (1 - 0.16);   // the ring is the outer sixth of the radius
  // rows of one disc about (x, y), cut by a second, larger disc about (x + ox, y + oy): the lens barrel's shadow
  const run = (x, y, r, ox, oy, r2, sign) => {
    for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
      const yy = Math.min(h - 1, Math.max(0, y + dy));
      let a = -Math.sqrt(r * r - dy * dy); let b = -a;
      if (r2) { const q = r2 * r2 - (dy - oy) * (dy - oy); if (q <= 0) continue; const hw = Math.sqrt(q); a = Math.max(a, ox - hw); b = Math.min(b, ox + hw); if (b <= a) continue; }
      const xa = Math.min(w, Math.max(0, Math.round(x + a))); const xb = Math.min(w, Math.max(0, Math.round(x + b) + 1));
      const pa = (yy * (w + 1) + xa) * 3; const pb = (yy * (w + 1) + xb) * 3; const n = Math.round(b) - Math.round(a) + 1;
      // past the picture's edge the edge repeats: the count is of the whole row, the sum of what lies inside, scaled up
      const inside = xb - xa; const k = inside > 0 ? (n / inside) * sign : 0;
      acc[0] += (sum[pb] - sum[pa]) * k; acc[1] += (sum[pb + 1] - sum[pa + 1]) * k; acc[2] += (sum[pb + 2] - sum[pa + 2]) * k; acc[3] += n * sign;
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ex = (x / w - 0.5) * 2; const ey = ((y - h / 2) / w) * 2; const e = eye * Math.hypot(ex, ey) ** 2;
      const r2 = e > 0.004 ? R * 1.2 : 0; const ox = -ex * e * R * 1.5; const oy = -ey * e * R * 1.5;
      acc[0] = acc[1] = acc[2] = acc[3] = 0; run(x, y, R, ox, oy, r2, 1);
      const all = [acc[0], acc[1], acc[2], acc[3]];
      let ring = all;
      if (rim > 0) { acc[0] = acc[1] = acc[2] = acc[3] = 0; run(x, y, R, ox, oy, r2, 1); run(x, y, Ri, ox, oy, r2, -1); ring = [acc[0], acc[1], acc[2], Math.max(1, acc[3])]; }
      const p = (y * w + x) * 3;
      // normalised by the whole disc's area, not the clipped one: a cat's eye is a darker disc, as on a real lens
      const area = Math.PI * R * R; const ringArea = Math.PI * (R * R - Ri * Ri);
      for (let c = 0; c < 3; c++) out[p + c] = Math.max(0, (1 - rim) * all[c] / area + rim * ring[c] / ringArea);
    }
  }
  return out;
}
const t1 = Date.now();
const R = o['lens-only'] ? 2 : BOKEH.radius * W;
// Two discs a hair apart, averaged: the edge of a real one is not a knife cut.
const a = discBlur(view, W, H, R, BOKEH); const b = discBlur(view, W, H, R * 0.965, BOKEH);
const bokeh = new Float32Array(W * H * 3); for (let i = 0; i < bokeh.length; i++) bokeh[i] = (a[i] + b[i]) / 2;
console.log(`lens blur, radius ${R.toFixed(1)} px, in ${Date.now() - t1} ms`);

// ---- 3. the haze: the blurred view again, small, under a wide Gaussian (three box blurs)
function shrink(src, w, h, k) {
  const sw = Math.floor(w / k); const sh = Math.floor(h / k); const out = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += src[((y * k + j) * w + x * k + i) * 3 + c];
    out[(y * sw + x) * 3 + c] = s / (k * k);
  }
  return { data: out, w: sw, h: sh };
}
function box(src, w, h, r) {
  const tmp = new Float32Array(src.length); const out = new Float32Array(src.length); const n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) { let s = 0; for (let i = -r; i <= r; i++) s += src[(y * w + Math.min(w - 1, Math.max(0, i))) * 3 + c]; for (let x = 0; x < w; x++) { tmp[(y * w + x) * 3 + c] = s / n; s += src[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - src[(y * w + Math.max(0, x - r)) * 3 + c]; } }
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[(Math.min(h - 1, Math.max(0, i)) * w + x) * 3 + c]; for (let y = 0; y < h; y++) { out[(y * w + x) * 3 + c] = s / n; s += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c]; } }
  return out;
}
const small = shrink(bokeh, W, H, 8);
let haze = small.data; for (let i = 0; i < 3; i++) haze = box(haze, small.w, small.h, Math.round(small.w * 0.016));

// ---- 4. what a drop shows: an equidistant fisheye about the camera's axis, rendered large and averaged down so a
// lamp keeps its light, then softened by a texel or two (the camera's own aperture, seen from the glass)
const LS = LENS.size; const K = 6; const big = new Float32Array(LS * LS * 3);
for (let j = 0; j < LS; j++) {
  for (let i = 0; i < LS; i++) {
    px[0] = px[1] = px[2] = 0;
    for (let s = 0; s < K * K; s++) {
      const u = ((i + ((s % K) + 0.5) / K) / LS) * 2 - 1; const v = -(((j + (Math.floor(s / K) + 0.5) / K) / LS) * 2 - 1);
      const d = Math.hypot(u, v); const th = d * LENS.span * rad; if (th > Math.PI * 0.6) continue;
      const sn = Math.sin(th) / (d || 1); tap(u * sn, v * sn, Math.cos(th), 1 / (K * K));
    }
    const d = Math.hypot((i + 0.5) / LS * 2 - 1, (j + 0.5) / LS * 2 - 1) * LENS.span;
    const fade = 1 - Math.min(1, Math.max(0, (d - LENS.fade[0]) / (LENS.fade[1] - LENS.fade[0]))) ** 1.5;
    // a lamp at full strength: in a drop it is a spark. And more of the dark kept than the camera's view keeps:
    // the wet ground and what stands on it are most of what a drop has to show
    grade(big, (j * LS + i) * 3, false, +o['lens-floor']); for (let c = 0; c < 3; c++) big[(j * LS + i) * 3 + c] *= fade;
  }
}
// the atlas: level 0, then each level half the one before, down to a single texel
const lens = new Float32Array(LS * 1.5 * LS * 3); const AW = LS * 1.5;
let level = { data: discBlur(big, LS, LS, 1.6), w: LS, h: LS }; let top = 0;
for (let n = 0; level.w >= 1; n++) {
  const x0 = n ? LS : 0; const y0 = n ? top : 0;
  for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) for (let c = 0; c < 3; c++) lens[((y0 + y) * AW + x0 + x) * 3 + c] = level.data[(y * level.w + x) * 3 + c];
  if (n) top += level.h;
  if (level.w === 1) break;
  level = shrink(level.data, level.w, level.h, 2);
}

// ---- write
const encode = (src, max) => { const out = Buffer.alloc(src.length); for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.cbrt(Math.min(1, src[i] / max)) * 255); return out; };
const stats = (name, src) => { const l = []; for (let i = 0; i < src.length; i += 3 * 7) l.push(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]); l.sort((p, q) => p - q); console.log(`${name}: median ${l[l.length >> 1].toFixed(4)}, 99% ${l[Math.floor(l.length * 0.99)].toFixed(3)}, 99.9% ${l[Math.floor(l.length * 0.999)].toFixed(3)}, max ${l.at(-1).toFixed(2)}`); };
stats('view', view); stats('bokeh', bokeh); stats('haze', haze); stats('lens', level.data.length > 3 ? level.data : lens);
if (o.out) {
  fs.mkdirSync(o.out, { recursive: true });
  const save = async (name, src, w, h, max, quality) => {
    const file = path.join(o.out, name);
    await sharp(encode(src, max), { raw: { width: w, height: h, channels: 3 } }).webp({ quality, effort: 6, smartSubsample: false }).toFile(file);
    console.log(`${name}: ${w}×${h}, ${(fs.statSync(file).size / 1e3).toFixed(0)} kB`);
  };
  if (!o['lens-only']) {
    await save('bokeh.webp', bokeh, W, H, MAX.bokeh, 92);
    await save('haze.webp', haze, small.w, small.h, MAX.haze, 92);
  }
  await save('lens.webp', lens, AW, LS, MAX.lens, 92);
}
// --preview: each picture as a screen would show it (a filmic shoulder, gamma 2.2), to choose the view by
if (o.preview) {
  fs.mkdirSync(o.preview, { recursive: true });
  const show = (src, w, h, name, exposure = +o.exposure) => { const out = Buffer.alloc(src.length); for (let i = 0; i < src.length; i++) { const x = src[i] * exposure; out[i] = Math.round(Math.min(1, (x * (1 + x / 16)) / (1 + x)) ** (1 / 2.2) * 255); } return sharp(out, { raw: { width: w, height: h, channels: 3 } }).resize(1200).jpeg({ quality: 82 }).toFile(path.join(o.preview, name)); };
  await show(view, W, H, 'view.jpg'); await show(bokeh, W, H, 'bokeh.jpg'); await show(haze, small.w, small.h, 'haze.jpg'); await show(lens, AW, LS, 'lens.jpg');
}
