// Starts a new hero: a running scene that already keeps the project's contract, so the work can go into the picture.
//
//   node .claude/skills/lifelike-hero/scripts/new-hero.mjs <id> [--name "Tide pool"] [--title "Low Water"]
//        [--client "Saltmarsh"] [--line "home hero"] [--place "Tórshavn · 2026"] [--cue "Drop a pebble"] [--action drop]
//
// <id> is the folder, the page and the CSS block: lowercase letters, digits, hyphens. Run from the project root.
// Writes src/<id>/ (index.js, render.js, shaders.js, sound.js, style.css), <id>.html and public/assets/<id>/CREDITS.md,
// and adds the page to vite.config.js. Existing files are never overwritten. The gallery card comes later, once the
// scene has stills: add-to-gallery.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values: o, positionals: [id] } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, title: { type: 'string' }, client: { type: 'string' }, line: { type: 'string' }, place: { type: 'string' }, cue: { type: 'string' }, action: { type: 'string' } },
});
const fail = (msg) => { console.error(`new-hero: ${msg}`); process.exit(1); };
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) fail('give the hero an id of lowercase letters, digits and hyphens, e.g. "tidepool".');
if (['shared', 'gallery', 'index', 'hero'].includes(id)) fail(`"${id}" is taken by the project itself.`);

// The project root: here or above, where the shared kit and the Vite config are.
let root = process.cwd();
while (!(fs.existsSync(path.join(root, 'src/shared/kit.js')) && fs.existsSync(path.join(root, 'vite.config.js')))) {
  const up = path.dirname(root);
  if (up === root) fail('this is not the lifelike-heroes project (no src/shared/kit.js and vite.config.js here or above). The scaffold builds on its shared kit; see references/contract.md for what a scene needs if you are working elsewhere.');
  root = up;
}

const cap = (s) => s.replace(/(^|-)([a-z])/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase());
const v = {
  id, Name: o.name || cap(id), title: o.title || o.name || cap(id), client: o.client || 'Client', line: o.line || 'home hero',
  place: o.place || String(new Date().getFullYear()), cue: o.cue || 'Leave a mark', action: o.action || 'mark',
};
if (!/^[a-z][a-zA-Z0-9]*$/.test(v.action)) fail('--action is the word a page passes to hero.action(): letters and digits, e.g. "drop".');
for (const [k, s] of Object.entries(v)) if (/[\r\n]/.test(s)) fail(`--${k.toLowerCase()} must be one line.`);

// A value is written into HTML, into a JS string or into a JS template literal that becomes HTML: each has its own escapes.
const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// (plain: a comment), html, js (a single-quoted string), tpl (HTML inside a template literal)
const forms = { '': (s) => s.replace(/\*\//g, '* /'), html, js: (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"), tpl: (s) => html(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') };
const fill = (text) => text.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (all, key, form = '') => (key in v && form in forms ? forms[form](v[key]) : all));

const template = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/template');
const files = [
  ['index.js', `src/${id}/index.js`], ['render.js', `src/${id}/render.js`], ['shaders.js', `src/${id}/shaders.js`], ['sound.js', `src/${id}/sound.js`],
  ['style.css', `src/${id}/style.css`], ['page.html', `${id}.html`], ['CREDITS.md', `public/assets/${id}/CREDITS.md`],
];
const taken = files.map(([, to]) => to).filter((to) => fs.existsSync(path.join(root, to)));
if (taken.length) fail(`these exist already and are left alone: ${taken.join(', ')}. Pick another id, or remove them first.`);
for (const [from, to] of files) {
  const file = path.join(root, to);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fill(fs.readFileSync(path.join(template, from), 'utf8')));
  console.log(`  wrote ${to}`);
}

// One page per hero in the build.
const config = path.join(root, 'vite.config.js'); const before = fs.readFileSync(config, 'utf8');
const after = before.replace(/(input:\s*\[)([^\]]*)(\])/, (all, a, list, z) => (list.includes(`'${id}.html'`) ? all : `${a}${list.trimEnd()}, '${id}.html'${z}`));
if (after !== before) { fs.writeFileSync(config, after); console.log(`  added ${id}.html to the build (vite.config.js)`); }
else if (!before.includes(`'${id}.html'`)) console.log(`  BY HAND: add '${id}.html' to build.rollupOptions.input in vite.config.js (its list was not where this script looks)`);

// The skill's other scripts, as they are best typed from the project root.
const shown = (file) => { const abs = path.join(path.dirname(fileURLToPath(import.meta.url)), file); const rel = path.relative(root, abs); return rel.startsWith('..') ? abs : rel; };
console.log(`
${v.Name} is running as a stand-in scene (damp sand under a low sun):
  npm run dev                      then open http://localhost:5173/${id}.html
  node ${shown('check-hero.mjs')} ${id}

Now make it the real picture: the subject in src/${id}/shaders.js, its rules and input in src/${id}/index.js.
Every line marked STARTER is the stand-in's and is yours to replace.`);
