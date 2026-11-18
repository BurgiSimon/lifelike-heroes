// Real ingredients from Poly Haven (polyhaven.com): scanned surfaces, photographed skies. Everything there is CC0.
//
//   node .claude/skills/lifelike-hero/scripts/find-asset.mjs search wet sand            [--type textures|hdris|models]
//   node .claude/skills/lifelike-hero/scripts/find-asset.mjs files <asset>              what it offers: maps, sizes, formats
//   node .claude/skills/lifelike-hero/scripts/find-asset.mjs get <asset> <map> --out public/assets/<hero>/<file>.webp
//                                                            [--res 2k] [--width 2048] [--quality 82] [--grey]
//
// <map> is a name from `files`: Diffuse, nor_gl, Rough, AO, Displacement, arm (AO, roughness and metal in r, g, b)
// for a texture; `tonemapped` (an 8-bit panorama, for backdrops and mirrors) or `hdr` (the light itself, kept as it
// is: bake what you need from it, do not ship it) for a sky.
// `get` downloads, resizes and re-encodes by the --out extension (webp, jpg, png), and prints the row for CREDITS.md.
// Colour maps: webp quality 80-85. Normal maps: quality 90 or more, their errors show as lumps in the light.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const API = 'https://api.polyhaven.com';
const { values: o, positionals: [cmd, ...rest] } = parseArgs({
  allowPositionals: true,
  options: { type: { type: 'string' }, res: { type: 'string', default: '2k' }, out: { type: 'string' }, width: { type: 'string' }, quality: { type: 'string', default: '82' }, grey: { type: 'boolean' }, limit: { type: 'string', default: '14' } },
});
const fail = (msg) => { console.error(`find-asset: ${msg}`); process.exit(1); };
const json = async (url) => { const r = await fetch(url, { headers: { 'user-agent': 'hero-asset-tool' } }); if (!r.ok) fail(`${url} answered ${r.status}`); return r.json(); };
const authors = (a) => Object.keys(a.authors || {}).join(', ');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

if (cmd === 'search') {
  if (!rest.length) fail('search for what? e.g. search wet sand');
  const words = rest.map((w) => w.toLowerCase());
  const found = [];
  for (const type of o.type ? [o.type] : ['textures', 'hdris']) {
    const all = await json(`${API}/assets?t=${type}`);
    for (const [id, a] of Object.entries(all)) {
      const name = `${id} ${a.name}`.toLowerCase(); const tags = [...(a.tags || []), ...(a.categories || [])].join(' ').toLowerCase();
      const score = words.reduce((n, w) => n + (name.includes(w) ? 3 : tags.includes(w) ? 1 : 0), 0);
      if (words.every((w) => name.includes(w) || tags.includes(w))) found.push({ id, a, type, score: score + Math.log10(1 + (a.download_count || 0)) / 10 });
    }
  }
  if (!found.length) fail(`nothing on Poly Haven carries all of: ${words.join(', ')}. Try fewer or plainer words (their categories: outdoor, night, sand, rock, wood, snow, urban ...).`);
  for (const { id, a, type } of found.sort((x, y) => y.score - x.score).slice(0, Number(o.limit))) {
    console.log(`${id}   [${type.replace(/s$/, '')}]  ${a.name} — ${authors(a)}\n    ${(a.categories || []).join(', ')} | ${(a.tags || []).slice(0, 8).join(', ')}\n    https://polyhaven.com/a/${id}`);
  }
  console.log(`\n${found.length} found. Look at a page before choosing: the picture decides, not the name.`);
} else if (cmd === 'files') {
  const [id] = rest; if (!id) fail('files of which asset?');
  const f = await json(`${API}/files/${id}`);
  for (const [map, by] of Object.entries(f)) {
    if (['blend', 'gltf', 'mtlx', 'usd', 'fbx'].includes(map)) continue;
    if (by.url) { console.log(`${map}: ${path.extname(by.url).slice(1)} ${mb(by.size)}`); continue; }
    const sizes = Object.entries(by).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)).map(([res, fmts]) => `${res} (${Object.entries(fmts).filter(([, v]) => v.url).map(([k, v]) => `${k} ${mb(v.size)}`).join(', ')})`);
    console.log(`${map}: ${sizes.join('  ')}`);
  }
} else if (cmd === 'get') {
  const [id, map] = rest; if (!id || !map || !o.out) fail('usage: get <asset> <map> --out public/assets/<hero>/<file>.webp');
  const [f, info] = await Promise.all([json(`${API}/files/${id}`), json(`${API}/info/${id}`)]);
  const key = Object.keys(f).find((k) => k.toLowerCase() === map.toLowerCase());
  let pick = null; let made = '';
  if (map === 'hdr' || map === 'exr') { pick = f.hdri?.[o.res]?.[map]; made = `${o.res} ${map.toUpperCase()}`; }
  else if (key && f[key].url) { pick = f[key]; made = 'tonemapped JPG'; }
  else if (key) { const fmts = f[key][o.res]; if (!fmts) fail(`${id} has no ${map} at ${o.res}; it has ${Object.keys(f[key]).join(', ')}`); pick = fmts.jpg || fmts.png; made = `${map} map (${o.res} ${fmts.jpg ? 'JPG' : 'PNG'})`; }
  if (!pick) fail(`${id} has no "${map}". Run: files ${id}`);
  const res = await fetch(pick.url); if (!res.ok) fail(`${pick.url} answered ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  const ext = path.extname(o.out).slice(1).toLowerCase();
  if (map === 'hdr' || map === 'exr') { fs.writeFileSync(o.out, raw); made += ', as downloaded'; }
  else {
    let sharp; try { sharp = createRequire(path.join(process.cwd(), 'package.json'))('sharp'); } catch { fail('sharp is not installed here: run this from the project root, after npm install.'); }
    let img = sharp(raw, { limitInputPixels: false });
    if (o.width) { img = img.resize({ width: Number(o.width), kernel: 'lanczos3' }); made += `, resized to ${o.width} px`; }
    if (o.grey) { img = img.greyscale(); made += ', one channel'; }
    const q = Number(o.quality);
    if (ext === 'webp') img = img.webp({ quality: q, effort: 5 }); else if (ext === 'jpg' || ext === 'jpeg') img = img.jpeg({ quality: q, mozjpeg: true }); else if (ext === 'png') img = img.png(); else fail('--out ends in .webp, .jpg or .png');
    await img.toFile(o.out); made += ', recompressed';
  }
  console.log(`${o.out}: ${mb(fs.statSync(o.out).size)} (from ${mb(raw.length)})`);
  console.log(`\nRow for the hero's CREDITS.md:\n| \`${path.basename(o.out)}\` | ${info.name}, ${made} | https://polyhaven.com/a/${id} | ${authors(info) || 'Poly Haven'} (Poly Haven) | CC0 1.0 |`);
} else {
  fail('commands: search <words>, files <asset>, get <asset> <map> --out <file>');
}
