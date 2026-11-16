// Builds the hero's two data assets from their public sources (see public/assets/stars/CREDITS.md):
//   stars.bin  the star catalogue (d3-celestial stars.8.json: RA, Dec, V magnitude, B–V), brightest first,
//              four Uint16 per star: RA/360, (Dec+90)/180 (both × 65535), (mag+2) × 1000, (B–V+1) × 1000
//   sky.webp   NASA SVS Deep Star Maps 2020, reprojected from plate carrée to the hero's own projection: azimuthal
//              equidistant about the north celestial pole, RA clockwise, edge of the square = SKY_SPAN degrees
//              from the pole. Gamma 2.2 encoded so the faint Milky Way keeps its steps in 8 bits.
// Run from the project root:
//   node src/stars/tools/build-assets.mjs --catalog stars.8.json --starmap starmap_2020_8k.exr --out public/assets/stars
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { FloatType } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

export const SKY_SPAN = 150; // degrees from the pole at the middle of the texture's edge; index.js holds the same number

const { values: o } = parseArgs({ options: { catalog: { type: 'string' }, starmap: { type: 'string' }, out: { type: 'string' }, size: { type: 'string', default: '4096' }, quality: { type: 'string', default: '86' }, gain: { type: 'string', default: '1' } } });
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
      for (let c = 0; c < 3; c++) {
        const e = Math.min(1, Math.max(0, (px[c] / 4) * gain)) ** (1 / 2.2) * 255 + Math.random() - 0.5; // dithered: no bands in the glow
        out[(j * S + i) * 3 + c] = Math.min(255, Math.max(0, Math.round(e)));
      }
    }
  }
  const file = path.join(o.out, 'sky.webp');
  await sharp(out, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: Number(o.quality), effort: 5 }).toFile(file);
  console.log(`sky.webp: ${S}² from ${W}×${H}, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}
