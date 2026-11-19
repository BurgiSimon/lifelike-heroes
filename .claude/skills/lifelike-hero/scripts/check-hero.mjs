// Holds a hero to the project's contract, and photographs it in every state for the eye to judge.
//
//   node .claude/skills/lifelike-hero/scripts/check-hero.mjs <id> [--out dir] [--timeout 60000]
//
// Needs the dev server (BASE, default http://localhost:5173) and runs from the project root. Renders in software, so
// it gives the same result on any machine; it is slow, and it says nothing about frame rates.
// Writes wide.png, acted.png, bare.png, still.png, phone.png, side.png, static.png and one sheet.jpg of them all to --out
// (default: check/<id>/ in the system's temp folder), prints every check, and exits 1 if one marked MUST failed.
//   MUST    the contract: a page that breaks one of these is not finished
//   SHOULD  the manner of the three scenes: fix it or know why not
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chromium, SOFT } from './browser.mjs';

const { values: o, positionals: [id] } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, timeout: { type: 'string', default: '60000' } } });
if (!id) { console.error('usage: check-hero.mjs <id> [--out dir]'); process.exit(2); }
const base = process.env.BASE || 'http://localhost:5173';
const out = path.resolve(o.out || path.join(os.tmpdir(), 'check', id)); fs.mkdirSync(out, { recursive: true });
const patience = Number(o.timeout);
let sharp = null; try { sharp = createRequire(path.join(process.cwd(), 'package.json'))('sharp'); } catch { /* no picture checks, no sheet */ }

// The class names the page chrome reads a scene's state from (src/shared/chrome.js): it lifts the opening picture on them.
const READY = /\b(is-live|is-ready|koi--ready)\b/; const STATIC = /\b(is-static|koi--static)\b/;

const lines = []; let failed = 0;
const say = (level, ok, what, note = '') => { if (!ok && level === 'MUST') failed++; lines.push(`${ok ? '  ok    ' : level === 'MUST' ? '  MUST  ' : '  SHOULD'} ${what}${note ? ` — ${note}` : ''}`); };
const must = (ok, what, note) => { say('MUST', !!ok, what, ok ? '' : note); return !!ok; };
const should = (ok, what, note) => { say('SHOULD', !!ok, what, ok ? '' : note); return !!ok; };
const part = async (name, fn) => { lines.push(`${name}`); try { await fn(); } catch (e) { must(false, `${name}: the check itself could not finish`, String(e.message || e).split('\n')[0]); } };

const browser = await chromium.launch({ args: SOFT });
// A page of the hero, with everything it logs kept. init runs before the page's own scripts.
async function open(context = {}, init = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...context });
  const p = await ctx.newPage(); const log = { thrown: [], errors: [], missing: [] };
  p.on('pageerror', (e) => log.thrown.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push(m.text().slice(0, 200)); });
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) log.missing.push(`${r.status()} ${r.url().replace(base, '')}`); });
  await p.addInitScript(() => {
    window.__audio = 0;
    if (window.AudioContext) window.AudioContext = class extends window.AudioContext { constructor(...a) { super(...a); window.__audio++; } };
  });
  if (init) await p.addInitScript(init);
  const res = await p.goto(`${base}/${id}.html?q=high`, { waitUntil: 'load' });
  await p.addStyleTag({ content: '.chrome { display: none !important; }' });   // the page's own furniture stays out of the pictures
  return { p, log, status: res?.status() ?? 0, close: () => ctx.close() };
}
const cls = (p) => p.evaluate(() => document.querySelector('.hero')?.className || '');
const until = async (p, re, ms = patience) => { const t0 = Date.now(); for (;;) { const c = await cls(p); if (re.test(c)) return true; if (Date.now() - t0 > ms) return false; await p.waitForTimeout(250); } };
// Drawn, and the opening picture lifted: two frames on, with nothing of the page still fading.
const settle = async (p) => {
  await p.waitForFunction(() => !document.querySelector('.poster'), null, { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 1600)))));   // and the scene's own fade-in
};
const shot = async (p, name) => { const buf = await p.screenshot({ timeout: 180000 }); if (name) fs.writeFileSync(path.join(out, `${name}.png`), buf); return buf; };
const grey = (buf) => sharp(buf).greyscale().raw().toBuffer();
const spread = async (buf) => (sharp ? (await sharp(buf).greyscale().stats()).channels[0].stdev : NaN);                 // 0: one flat colour
const differ = async (a, b) => { if (!sharp) return NaN; const [x, y] = await Promise.all([grey(a), grey(b)]); let n = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 2) n++; return n / x.length; };   // share of pixels that changed
// How the headline stands against what lies behind it: the still with its text and without, compared inside the
// headline's box. The pixels that change are the letters (drawn by the scene or by the DOM alike); the ratio is
// between their light and the light of what replaces them. WCAG's measure, taken from the picture.
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const standsOut = async (withText, bare, box) => {
  if (!sharp || box.w < 8 || box.h < 8) return null;
  const cut = (buf) => sharp(buf).extract({ left: Math.max(0, Math.floor(box.x)), top: Math.max(0, Math.floor(box.y)), width: Math.floor(box.w), height: Math.floor(box.h) }).removeAlpha().raw().toBuffer();
  const [x, y] = await Promise.all([cut(withText), cut(bare)]); let n = 0; let on = 0; let off = 0;
  for (let i = 0; i < x.length; i += 3) { const p = lum(x[i], x[i + 1], x[i + 2]); const q = lum(y[i], y[i + 1], y[i + 2]); if (Math.abs(p - q) > 0.03) { n++; on += p; off += q; } }
  if (n < 150) return null;
  on /= n; off /= n;
  return (Math.max(on, off) + 0.05) / (Math.min(on, off) + 0.05);
};
const quiet = (log, what) => { must(!log.thrown.length, `${what}: nothing throws`, log.thrown.slice(0, 3).join(' | ')); should(!log.errors.length, `${what}: the console stays free of errors`, log.errors.slice(0, 3).join(' | ')); must(!log.missing.length, `${what}: every file it asks for is there`, log.missing.slice(0, 4).join(', ')); };

// ---- 1. the live scene on a desktop
await part('live, 1440 × 900', async () => {
  const { p, log, status, close } = await open();
  must(status === 200, `${id}.html is served`, `the dev server answered ${status}; is ${id}.html in the project root?`);
  const ready = await until(p, READY);
  must(ready, 'the scene says when it is drawn', `its root never got one of the classes the page chrome waits for (is-ready, is-live); it has "${await cls(p)}"`);
  if (!ready) { quiet(log, 'loading'); await shot(p, 'wide'); await close(); return; }
  await settle(p);
  const wide = await shot(p, 'wide');
  if (sharp) must(await spread(wide) > 3, 'there is a picture', 'the page is one flat colour');

  const api = await p.evaluate(async (id) => {
    const m = await import(`/src/${id}/index.js`); const h = window.hero; const root = document.querySelector('.hero');
    const okControl = (c) => typeof c.id === 'string' && typeof c.label === 'string' && 'value' in c && (Array.isArray(c.options) ? c.options.includes(c.value) : [c.min, c.max, c.step].every(Number.isFinite) && c.value >= c.min && c.value <= c.max);
    return {
      hero: !!h && ['update', 'action', 'destroy'].every((k) => typeof h[k] === 'function'),
      mount: typeof m.default === 'function',
      controls: Array.isArray(m.controls) && m.controls.every(okControl) ? m.controls : null,
      actions: Array.isArray(m.actions) && m.actions.length > 0 && m.actions.every((a) => typeof a.id === 'string' && typeof a.label === 'string') ? m.actions : null,
      h1: [...root.querySelectorAll('h1')].map((e) => e.textContent.trim()),
      buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetWidth && getComputedStyle(b).visibility === 'visible').map((b) => b.textContent.trim()),
      status: !!root.querySelector('[role="status"]'),
      bareCanvas: [...root.querySelectorAll('canvas')].filter((c) => c.getAttribute('aria-hidden') !== 'true').length,
    };
  }, id);
  must(api.mount, 'src/' + id + '/index.js exports mount as its default');
  must(api.hero, 'mount returns { update, action, destroy }');
  must(api.controls, 'it exports controls: { id, label, value, and min, max, step or options }, each value inside its own range');
  must(api.actions, 'it exports at least one action: { id, label }');
  must(api.h1.length === 1 && api.h1[0], 'the headline is one real <h1> with text', `found ${api.h1.length}`);
  must(api.buttons.length >= 1, 'the main action has a real, visible <button>');
  must(api.status, 'there is a role="status" line for screen readers');
  must(api.bareCanvas === 0, 'every canvas is aria-hidden', `${api.bareCanvas} is not`);
  must(await p.evaluate(() => window.__audio) === 0, 'no sound is prepared before anyone asks for it', 'an AudioContext was built on load');

  // it lives, and it answers
  const said = () => p.evaluate(() => document.querySelector('.hero [role="status"]')?.textContent || '');
  const a = await shot(p); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))); const b = await shot(p);
  if (sharp) should(await differ(a, b) > 0.0005, 'it moves when nobody touches it', 'two frames, three apart, are the same picture');
  await p.mouse.move(430, 300); await p.mouse.move(900, 380, { steps: 14 }); await p.waitForTimeout(600);
  const before = await said(); const calm = await shot(p);
  await p.mouse.click(900, 380); await p.waitForTimeout(1500);
  const acted = await shot(p, 'acted');
  if (sharp) should(await differ(calm, acted) > 0.002, 'a click on the scene changes the picture', 'nothing visible happened');
  should(await said() !== before, 'a click is announced in the status line', `it still reads "${before}"`);
  await p.mouse.move(5, 5);
  await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Tab');
  const focus = await p.evaluate(() => { const e = document.activeElement; return { button: e?.tagName === 'BUTTON' && !!e.closest('.hero'), ring: !!e?.matches?.(':focus-visible') }; });
  must(focus.button, 'the keyboard reaches the scene\'s button first');
  const heard = await said(); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  should(await said() !== heard, 'Enter on the button acts, and the status line says so', `it still reads "${heard}"`);

  // options: whatever a page passes, the scene keeps to its ranges
  if (api.controls && api.actions) {
    await p.evaluate(({ controls, actions }) => {
      const h = window.hero;
      for (const c of controls) { for (const v of c.options ? [...c.options, 'no-such-option', 7, null] : [c.min, c.max, c.min - 1e9, c.max + 1e9, 'nonsense', NaN, null, undefined]) h.update({ [c.id]: v }); h.update({ [c.id]: c.value }); }
      h.update(); h.update({ nonsense: 1 });
      for (const a of actions) { h.action(a.id); h.action(a.id); } h.action('no-such-action');
    }, api);
    await p.waitForTimeout(1200);
  }
  await p.evaluate(() => window.hero.update({ text: false })); await p.waitForTimeout(1200);
  const hidden = await p.evaluate(() => [...document.querySelectorAll('.hero h1, .hero button, .hero p:not(.sr-only)')].every((e) => !e.offsetWidth || getComputedStyle(e).visibility === 'hidden' || +getComputedStyle(e).opacity === 0));
  must(hidden, 'update({ text: false }) leaves the scene alone: no headline, button or captions');
  await shot(p, 'bare');
  await p.evaluate(() => window.hero.update({ text: true })); await p.waitForTimeout(600);
  must((await p.evaluate(() => [...document.querySelectorAll('.hero button')].filter((b) => b.offsetWidth && getComputedStyle(b).visibility === 'visible').length)) >= 1, 'update({ text: true }) brings the button back');
  quiet(log, 'in use');

  // a lost graphics context, and its return
  const lose = await p.evaluate(() => { const c = document.querySelector('.hero canvas'); const gl = c.getContext('webgl2'); window.__lose = gl?.getExtension('WEBGL_lose_context'); if (window.__lose) window.__lose.loseContext(); return !!window.__lose; });
  if (lose) {
    await p.waitForTimeout(1200);
    should(STATIC.test(await cls(p)), 'a lost graphics context leaves the still ground and the headline', `the root has "${await cls(p)}"`);
    await p.evaluate(() => window.__lose.restoreContext());
    const back = await until(p, { test: (c) => READY.test(c) && !STATIC.test(c) }, 20000); await p.waitForTimeout(2500);
    should(back, 'and the scene comes back when the context does');
    if (back && sharp) should(await spread(await shot(p)) > 3, 'with its picture');
    must(!log.thrown.length, 'losing the context throws nothing', log.thrown.slice(0, 2).join(' | '));
  }

  // handed back clean, and mounted again
  const clean = await p.evaluate(() => { const root = document.querySelector('.hero'); window.hero.destroy(); return { html: root.innerHTML.trim(), cls: root.className.trim(), style: root.getAttribute('style') || '', attrs: [...root.attributes].map((a) => a.name).filter((n) => !['id', 'class', 'style'].includes(n)) }; });
  must(clean.html === '' && clean.cls === 'hero', 'destroy() hands the container back as it got it', `left: class "${clean.cls}", ${clean.html.length} characters of markup`);
  should(!clean.style && !clean.attrs.length, 'with no styles or attributes of its own left on it', `${clean.style} ${clean.attrs.join(' ')}`);
  log.thrown.length = 0;
  await p.evaluate(async (id) => { window.hero = (await import(`/src/${id}/index.js`)).default(document.querySelector('.hero')); }, id);
  must(await until(p, READY), 'and it mounts again in the same container');
  must(!log.thrown.length, 'destroy and a second mount throw nothing', log.thrown.slice(0, 2).join(' | '));
  await close();
});

// ---- 2. reduced motion: one still picture, drawn again only on input
await part('reduced motion', async () => {
  const { p, log, close } = await open({ reducedMotion: 'reduce' });
  if (!must(await until(p, READY), 'the scene is drawn')) { await close(); return; }
  await settle(p);
  const a = await shot(p, 'still'); await p.waitForTimeout(1500); const b = await shot(p);
  if (sharp) must(await differ(a, b) === 0, 'nothing moves', 'two pictures 1.5 s apart differ: something still runs (a loop, the grain, a CSS transition)');
  const box = await p.evaluate(() => { const r = document.querySelector('.hero h1').getBoundingClientRect(); return { x: r.left, y: r.top, w: Math.min(r.width, innerWidth - r.left), h: Math.min(r.height, innerHeight - r.top) }; });
  await p.evaluate(() => window.hero.update({ text: false })); await p.waitForTimeout(1500);
  const ratio = await standsOut(a, await shot(p), box);
  await p.evaluate(() => window.hero.update({ text: true })); await p.waitForTimeout(1500);
  if (ratio) should(ratio >= 1.7, `the headline can be read: it stands ${ratio.toFixed(1)} to 1 against what lies behind it (koi 2.0, meadow 2.9, stars 8.0)`, 'that is fainter than the headline of any of the three scenes; large type is usually asked 3 to 1');
  else lines.push('  note   the headline\'s contrast could not be measured (too little of the picture changes when the text is switched off)');
  const act = await p.evaluate(async (id) => { const m = await import(`/src/${id}/index.js`); window.hero.action(m.actions[0].id); return m.actions[0].id; }, id);
  await p.waitForTimeout(1500);
  if (sharp) should(await differ(a, await shot(p)) > 0.0005, `action('${act}') redraws the still with its result`, 'the picture did not change');
  quiet(log, 'standing still');
  await close();
});

// ---- 3. a phone
await part('phone, 390 × 844, touch', async () => {
  const { p, log, close } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  must(await until(p, READY), 'the scene is drawn'); await settle(p);
  const m = await p.evaluate(() => {
    const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const h1 = document.querySelector('.hero h1').getBoundingClientRect();
    const touch = []; for (let e = top; e && e !== document.documentElement; e = e.parentElement) touch.push(getComputedStyle(e).touchAction);
    const cue = document.querySelector('.hero button')?.getBoundingClientRect();
    return { touch, wide: document.documentElement.scrollWidth - innerWidth, h1: [h1.left, h1.right, innerWidth], cue: cue ? Math.min(cue.width, cue.height) : 0 };
  });
  must(!m.touch.includes('none') && !m.touch.includes('pan-x'), 'a finger that starts on the scene can still scroll the page', `touch-action there is ${m.touch.join(' > ')}`);
  must(m.wide <= 0, 'the page is no wider than the phone', `${m.wide} px too wide`);
  should(m.h1[0] >= 0 && m.h1[1] <= m.h1[2] + 1, 'the headline fits the phone', `it runs from ${m.h1[0].toFixed(0)} to ${m.h1[1].toFixed(0)} of ${m.h1[2]} px`);
  should(m.cue >= 43.5, 'a finger can hit the cue (44 px on a touch screen)', `it is ${m.cue.toFixed(0)} px at its narrowest`);
  await p.touchscreen.tap(200, 400); await p.waitForTimeout(1500);
  await shot(p, 'phone');
  quiet(log, 'on the phone');
  await close();
});

// ---- 3b. a phone on its side: a 360 dp Android under Chrome's bars is 780 × 280, the shortest screen a scene meets
// (base.css lifts the hero's 420 px floor there, so the scene takes the screen's height).
await part('phone on its side, 780 × 280, touch', async () => {
  const { p, log, close } = await open({ viewport: { width: 780, height: 280 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  must(await until(p, READY), 'the scene is drawn'); await settle(p);
  const m = await p.evaluate(() => {
    const r = (q) => document.querySelector(q)?.getBoundingClientRect();
    const out = [['the headline', r('.hero h1')], ['the cue', r('.hero button')], ['the plate line', r('.hero h1 ~ p:not(.sr-only)')]].filter(([, b]) => b && b.width && (b.top < -1 || b.bottom > innerHeight + 1 || b.left < -1 || b.right > innerWidth + 1)).map(([n]) => n);
    // The headline's letters, line by line: each line's box less the room above the capitals and below the baseline.
    const range = document.createRange(); range.selectNodeContents(document.querySelector('.hero h1'));
    const ink = [...range.getClientRects()].map((q) => ({ l: q.left, r: q.right, t: q.top + q.height * 0.18, b: q.bottom - q.height * 0.2 }));
    const hit = (q, b) => b && q.l < b.right && q.r > b.left && q.t < b.bottom && q.b > b.top;
    const cue = r('.hero button'); const menu = { left: 0, top: 0, right: 56, bottom: 56 };   // the page chrome's menu button, 12 to 56 px in (chrome.css)
    return { tall: document.documentElement.scrollHeight - innerHeight, wide: document.documentElement.scrollWidth - innerWidth, out, cue: ink.some((q) => hit(q, cue)), menu: ink.some((q) => hit(q, menu)) };
  });
  should(m.tall <= 0 && m.wide <= 0, 'the scene fits the screen, with nothing below the fold', `the page is ${m.tall} px taller and ${m.wide} px wider than the screen`);
  should(!m.out.length, 'its type and its cue are all on the screen', `off it: ${m.out.join(', ')}`);
  should(!m.cue, 'the cue keeps off the headline', 'on a screen this short the button lies over the letters');
  should(!m.menu, 'the headline keeps clear of the menu button in the top left corner', 'its first letters lie under where the page puts its menu');
  await shot(p, 'side');
  quiet(log, 'on its side');
  await close();
});

// ---- 4. no WebGL at all
await part('without WebGL', async () => {
  const { p, log, close } = await open({}, () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/.test(type) ? null : get.call(this, type, ...a); }; });
  must(await until(p, STATIC, 20000), 'the scene says that it cannot draw', `its root never got is-static; it has "${await cls(p)}"`);
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => { const h = document.querySelector('.hero h1'); const c = getComputedStyle(h); return { seen: !!h.offsetWidth && c.visibility === 'visible' && +c.opacity > 0.5, poster: !!document.querySelector('.poster:not(.is-gone)') }; });
  must(s.seen, 'the headline stands on a still ground');
  should(!s.poster, 'the opening picture has lifted');
  must(!log.thrown.length, 'nothing throws', log.thrown.slice(0, 3).join(' | '));
  await shot(p, 'static');
  await close();
});
await browser.close();

// ---- 5. what is on disk
lines.push('files');
const here = (f) => fs.existsSync(path.join(process.cwd(), f)); const read = (f) => (here(f) ? fs.readFileSync(path.join(process.cwd(), f), 'utf8') : '');
must(new RegExp(`['"\`]${id}\\.html['"\`]`).test(read('vite.config.js')), `${id}.html is one of the build's pages (vite.config.js)`);
const dir = `public/assets/${id}`; const assets = here(dir) ? fs.readdirSync(path.join(process.cwd(), dir)).filter((f) => f !== 'CREDITS.md' && !f.startsWith('.')) : [];
const credits = read(`${dir}/CREDITS.md`); const uncredited = assets.filter((f) => !credits.includes(f));
must(!uncredited.length, `every file in ${dir}/ is credited in its CREDITS.md`, `not named there: ${uncredited.join(', ')}`);
const weight = assets.reduce((n, f) => n + fs.statSync(path.join(process.cwd(), dir, f)).size, 0);
should(weight < 4.5e6, `its assets stay light (${(weight / 1e6).toFixed(1)} MB in ${assets.length} files; the three scenes carry 1.3 to 3.1 MB)`);
const src = `src/${id}`; const starters = here(src) ? fs.readdirSync(path.join(process.cwd(), src)).flatMap((f) => (/\.(js|css)$/.test(f) ? read(`${src}/${f}`).split('\n').filter((l) => l.includes('STARTER')).map(() => f) : [])) : [];
should(!starters.length, 'nothing of the stand-in scene is left', `${starters.length} lines are still marked STARTER (${[...new Set(starters)].join(', ')})`);
const card = new RegExp(`data-id=["']${id}["']`).test(read('index.html'));
if (card) must(here(`public/assets/gallery/${id}-wide.jpg`) && here(`public/assets/gallery/${id}-tall.jpg`), 'its gallery card has its two stills');
else lines.push('  note   not in the gallery yet (add-to-gallery.mjs, once it has stills)');

// ---- the sheet: every picture on one page, for one look
if (sharp) {
  const cells = [['wide', 'live'], ['acted', 'after a hover and a click'], ['bare', 'text: false'], ['still', 'reduced motion'], ['static', 'without WebGL'], ['phone', 'phone'], ['side', 'phone on its side']].filter(([f]) => fs.existsSync(path.join(out, `${f}.png`)));
  const CW = 720; const CH = 450; const LAB = 26; const cols = 3; const rows = Math.ceil(cells.length / cols);
  const layers = [];
  for (const [i, [file, label]] of cells.entries()) {
    const x = (i % cols) * CW; const y = Math.floor(i / cols) * (CH + LAB);
    layers.push({ input: await sharp(path.join(out, `${file}.png`)).resize(CW - 8, CH - 8, { fit: 'contain', background: '#111' }).toBuffer(), left: x + 4, top: y + LAB + 4 });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${LAB}"><text x="6" y="19" font-family="monospace" font-size="15" fill="#ddd">${id}: ${label}</text></svg>`), left: x, top: y });
  }
  if (layers.length) await sharp({ create: { width: cols * CW, height: rows * (CH + LAB), channels: 3, background: '#111' } }).composite(layers).jpeg({ quality: 88 }).toFile(path.join(out, 'sheet.jpg'));
}

console.log(`check-hero: ${id}\n${lines.join('\n')}`);
console.log(`\npictures: ${out}${sharp ? `\nsheet:    ${path.join(out, 'sheet.jpg')}` : ''}`);
console.log(failed ? `\n${failed} MUST ${failed === 1 ? 'check' : 'checks'} failed.` : '\nThe contract holds. Whether it is a photograph is for the eye: open the sheet, then wide.png at full size.');
process.exit(failed ? 1 : 0);
