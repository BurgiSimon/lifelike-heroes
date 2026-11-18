// Gives a finished hero its card on the gallery, and its page the opening picture the card closes on.
//
//   node .claude/skills/lifelike-hero/scripts/add-to-gallery.mjs <id> --label "Tide pool" --sub "Saltmarsh · Low Water"
//
// Run from the project root, after the scene's stills exist (scripts/stills.mjs <id> writes them). Edits index.html,
// src/gallery/style.css, scripts/stills.mjs and <id>.html, each only where it finds the place it expects; what it
// cannot place, and what is a matter of judgment, it lists to be done by hand. Running it twice changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: o, positionals: [id] } = parseArgs({ allowPositionals: true, options: { label: { type: 'string' }, sub: { type: 'string' } } });
const fail = (msg) => { console.error(`add-to-gallery: ${msg}`); process.exit(1); };
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) fail('which hero? Give its id, e.g. "tidepool".');
const root = process.cwd();
const at = (f) => path.join(root, f);
if (!fs.existsSync(at('src/gallery/index.js')) || !fs.existsSync(at('index.html'))) fail('run this from the project root (index.html and src/gallery/ are not here).');
if (!fs.existsSync(at(`${id}.html`))) fail(`there is no ${id}.html. Start the hero with new-hero.mjs first.`);
// The skill's other scripts, as they are best typed from here.
const shown = (file) => { const abs = path.join(import.meta.dirname, file); const rel = path.relative(root, abs); return rel.startsWith('..') ? abs : rel; };
const stills = ['wide', 'tall'].map((k) => `public/assets/gallery/${id}-${k}.jpg`);
const missing = stills.filter((f) => !fs.existsSync(at(f)));
if (missing.length) fail(`the card shows the scene's stills, and these are not there yet: ${missing.join(', ')}.\n  Make them once the scene is finished:  node scripts/stills.mjs ${id}\n  (in a sandbox without Playwright's own browser: node --import ${shown('browser.mjs')} scripts/stills.mjs ${id})`);

const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const label = o.label || id[0].toUpperCase() + id.slice(1); const sub = o.sub || '';
const byHand = [];
// One edit: unless `done` already holds, replace `find` with `put`; if the place is not there, say what to do by hand.
const edit = (file, done, find, put, hand) => {
  const text = fs.readFileSync(at(file), 'utf8');
  if (done.test(text)) { console.log(`  as it was   ${file}`); return; }
  const next = text.replace(find, put);
  if (next === text) { byHand.push(`${file}: ${hand}`); return; }
  fs.writeFileSync(at(file), next); console.log(`  edited      ${file}`);
};

// the card, last in the line
edit('index.html', new RegExp(`data-id=["']${id}["']`), /(\n)([ \t]*)(<\/main>)/,
  `$1$2  <a href="${id}.html" data-id="${id}">${html(label)}${sub ? ` <span>${html(sub)}</span>` : ''}</a>$1$2$3`,
  `add <a href="${id}.html" data-id="${id}">${label} <span>${sub}</span></a> as the last card in <main class="list">`);
// its stills, wide and (in a portrait window) tall
for (const k of ['wide', 'tall']) {
  edit('src/gallery/style.css', new RegExp(`--${id}: url\\('/assets/gallery/${id}-${k}\\.jpg'\\)`), new RegExp(`(:root \\{[^}\\n]*-${k}\\.jpg'\\);)( \\})`),
    `$1 --${id}: url('/assets/gallery/${id}-${k}.jpg');$2`, `add --${id}: url('/assets/gallery/${id}-${k}.jpg'); to the :root rule that holds the ${k} stills`);
}
edit('src/gallery/style.css', new RegExp(`\\[data-id='${id}'\\]`), /((?:\[data-id='[\w-]+'\] \{ --still: var\(--[\w-]+\); \}\n)+)/,
  `$1[data-id='${id}'] { --still: var(--${id}); }\n`, `add [data-id='${id}'] { --still: var(--${id}); } after the other cards' rules`);
// the stills tool renders every scene by default
edit('scripts/stills.mjs', new RegExp(`\\[[^\\]]*'${id}'[^\\]]*\\]`), /(: \[)('[\w-]+'(?:, '[\w-]+')*)(\];)/, `$1$2, '${id}'$3`, `add '${id}' to the default list of ids`);
// the page opens on the picture the card closed on
edit(`${id}.html`, /class="poster"/, /(\n)([ \t]*)(<\/head>)/,
  `$1$2  <style>$1$2    /* The scene's still: what the gallery closed on, and what the page shows until the scene itself is drawn. */$1$2    .poster { background-image: url('/assets/gallery/${id}-wide.jpg'); }$1$2    @media (orientation: portrait) { .poster { background-image: url('/assets/gallery/${id}-tall.jpg'); } }$1$2  </style>$1$2$3`,
  'add the .poster rules to <head> (see koi.html)');
edit(`${id}.html`, /<div class="poster"/, /(<main id="hero" class="hero"><\/main>)(\n)([ \t]*)/, `$1$2$3<div class="poster" aria-hidden="true"></div>$2$3`, 'add <div class="poster" aria-hidden="true"></div> after <main id="hero">');

console.log(`
Still to do by hand (each is a judgment, or a file this script will not guess at):${byHand.map((s) => `\n  - ${s}`).join('')}
  - src/gallery/index.js: the lit card gets a trace in its scene's own manner (grass that parts, rings, a pencilled
    line). draw() has one block per scene, by its place in the line; give ${id} one of its own, or it has none.
  - scripts/gallery-check.mjs counts three scenes: ORDER, the "% 3" beside it, and "shown: 3" for the phone strip.
    Its drift test also compares "the second card on screen" a second apart, which is another card once the first
    has left the edge (it fails that way on a slow machine even with three): make it follow one card.
  - scripts/sound-check.mjs: add ${id} to SCENES (its room, its bed, one call per voice, its actions), then run it.
  - README.md: its section under "Three scenes to play with" (and that heading's count), its rows in the options
    and credits tables, a picture in docs/readme/, "How each scene works", the project layout.
  - package.json's description and index.html's <title> still say "three".
Then: node scripts/gallery-check.mjs   and   node ${shown('check-hero.mjs')} ${id}`);
