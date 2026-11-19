// Builds the hero's sky from its public source (see public/assets/roost/CREDITS.md):
//   sky.webp   Poly Haven's Belfast Sunset (Pure Sky), 16k HDR, as this hero's lens sees it: reprojected from the
//              panorama to a flat picture whose x and y are the tangents of the angle off the lens's axis and above
//              the horizon (SKY in optics.js holds the same numbers), exposed for the cloud, rolled off toward the
//              glow on the horizon the way film does, sRGB.
// The source is 200 MB and is not kept in the repo:
//   node .claude/skills/lifelike-hero/scripts/find-asset.mjs get belfast_sunset_puresky hdr --res 16k --out belfast_sunset_puresky_16k.hdr
// Run from the project root:
//   node src/roost/tools/build-assets.mjs --sky belfast_sunset_puresky_16k.hdr --out public/assets/roost
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { SKY } from '../optics.js';

const { values: o } = parseArgs({ options: { sky: { type: 'string' }, out: { type: 'string' }, exposure: { type: 'string', default: String(SKY.exposure) }, quality: { type: 'string', default: '84' } } });
if (!o.sky || !o.out) { console.error('usage: build-assets.mjs --sky <16k .hdr> --out public/assets/roost'); process.exit(2); }
fs.mkdirSync(o.out, { recursive: true });

// A Radiance .hdr is run-length coded a row at a time, so rows cannot be jumped to: every row is walked, and only
// the ones this view can see (a band above the horizon) are kept, as the four bytes (r, g, b, exponent) they come as.
const buf = fs.readFileSync(o.sky);
let at = buf.indexOf('\n\n') + 2; const dims = /-Y (\d+) \+X (\d+)/.exec(buf.subarray(at, buf.indexOf('\n', at)).toString());
if (!dims) throw new Error('not a top-down Radiance picture');
const H = Number(dims[1]); const W = Number(dims[2]); at = buf.indexOf('\n', at) + 1;
const DEG = Math.PI / 180;
const up = Math.atan(SKY.top) / DEG + 1.5; const down = Math.atan(SKY.bottom) / DEG - 1.5;   // degrees above the horizon the view reaches, and a margin
const r0 = Math.max(0, Math.floor((90 - up) / 180 * H)); const r1 = Math.min(H, Math.ceil((90 - down) / 180 * H));
const rows = new Uint8Array((r1 - r0) * W * 4); const line = new Uint8Array(W * 4);
for (let y = 0; y < r1; y++) {
  if (buf[at] !== 2 || buf[at + 1] !== 2 || ((buf[at + 2] << 8) | buf[at + 3]) !== W) throw new Error(`row ${y}: not the run-length coding this reads`);
  at += 4;
  for (let c = 0; c < 4; c++) {
    for (let x = 0; x < W;) {
      let n = buf[at++];
      if (n > 128) { n -= 128; const v = buf[at++]; if (y >= r0) line.fill(v, c * W + x, c * W + x + n); x += n; }
      else { if (y >= r0) line.set(buf.subarray(at, at + n), c * W + x); at += n; x += n; }
    }
  }
  if (y >= r0) { const to = (y - r0) * W * 4; for (let x = 0; x < W; x++) { rows[to + x * 4] = line[x]; rows[to + x * 4 + 1] = line[W + x]; rows[to + x * 4 + 2] = line[2 * W + x]; rows[to + x * 4 + 3] = line[3 * W + x]; } }
}
const px = [0, 0, 0];
// Bilinear tap of the kept rows at (column, row) of the whole panorama, added to px in linear light.
const tap = (x, y, w) => {
  const yy = Math.min(r1 - r0 - 1.001, Math.max(0, y - r0)); const x0 = Math.floor(x); const y0 = Math.floor(yy); const fx = x - x0; const fy = yy - y0;
  for (let k = 0; k < 4; k++) {
    const i = ((y0 + (k >> 1)) * W + (((x0 + (k & 1)) % W) + W) % W) * 4; const e = rows[i + 3];
    if (!e) continue;
    const s = 2 ** (e - 136) * ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy) * w;
    px[0] += rows[i] * s; px[1] += rows[i + 1] * s; px[2] += rows[i + 2] * s;
  }
};
const OW = SKY.width; const OH = SKY.height; const out = Buffer.alloc(OW * OH * 3); const gain = Number(o.exposure);
const oetf = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
let sum = 0;
for (let j = 0; j < OH; j++) {
  for (let i = 0; i < OW; i++) {
    px[0] = px[1] = px[2] = 0;
    // Sixteen taps under a tent two texels wide. Fewer, and the picture comes out sharp where a texel happens to
    // fall on one of the panorama's and soft where it falls between: a faint lattice all over the cloud.
    for (let s = 0; s < 16; s++) {
      const dx = ((s & 3) + 0.5) / 2 - 1; const dy = ((s >> 2) + 0.5) / 2 - 1; const w = (1 - Math.abs(dx)) * (1 - Math.abs(dy)) / 4;
      const tx = ((i + 0.5 + dx) / OW * 2 - 1) * SKY.half; const ty = SKY.top - (j + 0.5 + dy) / OH * (SKY.top - SKY.bottom);
      const yaw = SKY.yaw * 360 + Math.atan(tx) / DEG; const alt = Math.atan2(ty, Math.hypot(tx, 1)) / DEG;
      tap(((yaw / 360) % 1 + 1) % 1 * W - 0.5, (90 - alt) / 180 * H - 0.5, w);
    }
    // Film's shoulder: the cloud keeps its contrast, and the glow on the horizon goes to pale gold, not to a flat white.
    for (let c = 0; c < 3; c++) { const v = px[c] * gain; const d = v < SKY.knee ? v : SKY.knee + (1 - SKY.knee) * (1 - Math.exp(-(v - SKY.knee) / (1 - SKY.knee))); out[(j * OW + i) * 3 + c] = Math.round(255 * oetf(Math.min(1, d))); if (c === 1) sum += d; }
  }
}
const file = path.join(o.out, 'sky.webp');
await sharp(out, { raw: { width: OW, height: OH, channels: 3 } }).webp({ quality: Number(o.quality), effort: 5 }).toFile(file);
console.log(`${file}: ${OW} × ${OH}, ${(fs.statSync(file).size / 1e3).toFixed(0)} KB, mean green ${(sum / (OW * OH)).toFixed(3)} (linear), from rows ${r0} to ${r1} of ${H}`);
