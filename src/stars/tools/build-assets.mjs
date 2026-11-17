// Builds the hero's data assets from their public sources (see public/assets/stars/CREDITS.md):
//   stars.bin  the star catalogue (d3-celestial stars.8.json: RA, Dec, V magnitude, B–V), brightest first,
//              four Uint16 per star: RA/360, (Dec+90)/180 (both × 65535), (mag+2) × 1000, (B–V+1) × 1000
//   sky.webp   NASA SVS Deep Star Maps 2020, reprojected from plate carrée to the hero's own projection: azimuthal
//              equidistant about the north celestial pole, RA clockwise, edge of the square = SKY_SPAN degrees
//              from the pole. Gamma 2.2 encoded so the faint Milky Way keeps its steps in 8 bits.
//   land.webp  the horizon of a Poly Haven panorama (stierberg_sunrise_8k.hdr: snow field, spruce, clear sky),
//              mirrored so the open slope lies to the right: LAND.span degrees of azimuth by LAND.top − LAND.bottom of
//              altitude, luminance only (gamma 2.2), the sky keyed out into alpha. The hero relights it for the night.
// Run from the project root:
//   node src/stars/tools/build-assets.mjs --catalog stars.8.json --starmap starmap_2020_8k.exr --horizon stierberg_sunrise_8k.hdr --out public/assets/stars
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { FloatType } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export const SKY_SPAN = 150; // degrees from the pole at the middle of the texture's edge; shaders.js holds the same number
export const LAND = { from: -2, span: 168, bottom: -3, top: 11, width: 2560 }; // degrees; ground.js holds the same numbers

const { values: o } = parseArgs({ options: { catalog: { type: 'string' }, starmap: { type: 'string' }, horizon: { type: 'string' }, out: { type: 'string' }, size: { type: 'string', default: '4096' }, quality: { type: 'string', default: '90' }, gain: { type: 'string', default: '1' } } });
fs.mkdirSync(o.out, { recursive: true });

if (o.catalog) {
  const stars = JSON.parse(fs.readFileSync(o.catalog, 'utf8')).features
    .map((f) => ({ ra: (f.geometry.coordinates[0] + 360) % 360, dec: f.geometry.coordinates[1], mag: f.properties.mag, bv: Number.parseFloat(f.properties.bv) }))
    .sort((a, b) => a.mag - b.mag);
  const bin = new Uint16Array(stars.length * 4);
  stars.forEach((s, i) => {
    bin[i * 4] = Math.round((s.ra / 360) * 65535);
    bin[i * 4 + 1] = Math.round(((s.dec + 90) / 180) * 65535);
    bin[i * 4 + 2] = Math.round((s.mag + 2) * 1000);
    bin[i * 4 + 3] = Math.round(((Number.isFinite(s.bv) ? Math.min(2.5, Math.max(-0.5, s.bv)) : 0.6) + 1) * 1000); // no colour index: a sun-like white
  });
  fs.writeFileSync(path.join(o.out, 'stars.bin'), Buffer.from(bin.buffer));
  console.log(`stars.bin: ${stars.length} stars, mag ${stars[0].mag} … ${stars.at(-1).mag}`);
}

if (o.starmap) {
  const buf = fs.readFileSync(o.starmap);
  const { data, width: W, height: H } = new EXRLoader().setDataType(FloatType).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ch = data.length / (W * H); const S = Number(o.size); const gain = Number(o.gain);
  const out = Buffer.alloc(S * S * 3); const px = [0, 0, 0];
  // Bilinear tap of the source at (RA, polar distance), both in degrees. The loader hands the rows over bottom-up.
  const tap = (ra, pd) => {
    const x = ((0.5 - ra / 360) % 1 + 1) % 1 * W - 0.5; const y = Math.min(H - 1.001, Math.max(0, (Math.min(pd, 180) / 180) * H - 0.5));
    const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = x - x0; const fy = y - y0;
    const xa = ((x0 % W) + W) % W; const xb = (xa + 1) % W; const ya = (H - 1 - y0) * W; const yb = (H - 2 - y0) * W;
    for (let c = 0; c < 3; c++) {
      px[c] += (data[(ya + xa) * ch + c] * (1 - fx) + data[(ya + xb) * ch + c] * fx) * (1 - fy) + (data[(yb + xa) * ch + c] * (1 - fx) + data[(yb + xb) * ch + c] * fx) * fy;
    }
  };
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      px[0] = px[1] = px[2] = 0;
      for (let s = 0; s < 4; s++) { // 2 × 2 taps per texel: the source's stars are a texel wide
        const u = ((i + 0.25 + (s & 1) * 0.5) / S) * 2 - 1; const v = ((j + 0.25 + (s >> 1) * 0.5) / S) * 2 - 1;
        tap((Math.atan2(v, u) * 180) / Math.PI, Math.hypot(u, v) * SKY_SPAN);
      }
      // No dither here: it would turn with the sky. The film grain in the post pass breaks up the steps instead.
      for (let c = 0; c < 3; c++) out[(j * S + i) * 3 + c] = Math.round(Math.min(1, Math.max(0, (px[c] / 4) * gain)) ** (1 / 2.2) * 255);
    }
  }
  const file = path.join(o.out, 'sky.webp');
  await sharp(out, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: Number(o.quality), effort: 5 }).toFile(file);
  console.log(`sky.webp: ${S}² from ${W}×${H}, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}

if (o.horizon) {
  const buf = fs.readFileSync(o.horizon);
  const { data, width: W, height: H } = new HDRLoader().setDataType(FloatType).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ch = data.length / (W * H); const perDeg = W / 360;
  const w = Math.round(LAND.span * perDeg); const h = Math.round((LAND.top - LAND.bottom) * perDeg);
  const x0 = Math.round(LAND.from * perDeg); const y0 = Math.round(H / 2 - LAND.top * perDeg);
  const at = (x, y) => ((y0 + y) * W + (((x0 + x) % W) + W) % W) * ch;
  const lum = new Float32Array(w * h); const hue = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { const p = at(x, y); lum[y * w + x] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]; hue[y * w + x] = data[p + 2] / (data[p] + data[p + 2] + 1e-6); }
  }
  // Sky is what can be reached from the top edge without crossing an edge: a clear sky pales toward the horizon
  // smoothly, while snow, spruce and the far treeline all begin with a step. Nothing under the horizon is sky.
  const open = new Uint8Array(w * h); const stack = []; const floor = Math.round((LAND.top + 0.4) * perDeg);
  for (let x = 0; x < w; x++) { open[x] = 1; stack.push(x); }
  while (stack.length) {
    const i = stack.pop(); const x = i % w; const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= floor) continue;
      const n = ny * w + nx;
      if (!open[n] && Math.abs(lum[n] - lum[i]) < 0.045 * Math.max(lum[n], lum[i]) && Math.abs(hue[n] - hue[i]) < 0.012 && hue[n] > 0.5) { open[n] = 1; stack.push(n); }
    }
  }
  // Sky seen through the trees is cut off from the rest but looks like it: as blue, as bright, and with dark
  // wood close by on both sides (which a blue shadow on open snow has not).
  for (let y = 1; y < floor; y++) {
    const gap = new Uint8Array(w); let seen = -99;
    for (let x = 0; x < w; x++) { if (lum[y * w + x] < 0.3 * lum[x]) seen = x; if (x - seen < 12) gap[x] = 1; }
    seen = w + 99;
    for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (lum[i] < 0.3 * lum[x]) seen = x; if (gap[x] && seen - x < 12 && hue[i] > 0.52 && lum[i] > 0.75 * lum[x]) open[i] = 1; }
  }
  // Then it grows two pixels into the land, which takes the lens's blur of sky into the treetops out of the picture.
  let grown = open;
  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(grown);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (grown[i - 1] || grown[i + 1] || grown[i - w] || grown[i + w]) next[i] = 1; }
    grown = next;
  }
  // Mirrored, luminance against sunlit snow (about 1.05 here), gamma 2.2; sharp resizes in premultiplied alpha,
  // so no sky bleeds back into the edge.
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + (w - 1 - x); const v = Math.round(Math.min(1, lum[i] / 1.05) ** (1 / 2.2) * 255); const p = (y * w + x) * 4;
      out[p] = out[p + 1] = out[p + 2] = grown[i] ? 0 : v; out[p + 3] = grown[i] ? 0 : 255;
    }
  }
  const file = path.join(o.out, 'land.webp'); const hh = Math.round((LAND.width * h) / w);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).resize(LAND.width, hh, { kernel: 'lanczos3' }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(file);
  console.log(`land.webp: ${LAND.width}×${hh} from ${w}×${h}, ${(fs.statSync(file).size / 1e3).toFixed(0)} kB`);
}
