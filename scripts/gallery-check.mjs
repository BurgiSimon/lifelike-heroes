// Self-check of the gallery's endless line: node scripts/gallery-check.mjs   (needs the dev server, as shot.mjs does)
// However the line is moved (wheel, drag, arrow keys, its own drift), the screen stays filled with cards in the
// scenes' order with no hole and no overlap; the keyboard's focus is always on one of the page's own five cards,
// in the middle; a drag opens nothing and a click opens the card under it; on a phone the line is a plain strip.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE || 'http://localhost:5173';
const W = 1440; const H = 900;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${base}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(400);

// the cards on screen, left to right
const seen = () => p.evaluate(() => [...document.querySelectorAll('.list a')].map((a) => { const r = a.getBoundingClientRect(); return { id: a.dataset.id, left: r.left, right: r.right, copy: a.classList.contains('is-copy') }; }).filter((c) => c.right > 0 && c.left < innerWidth).sort((a, b) => a.left - b.left));
const ORDER = ['meadow', 'koi', 'stars', 'rain', 'mist'];
async function whole(when) {
  const c = await seen();
  assert.ok(c[0].left <= 20.5 && c.at(-1).right >= W - 20.5, `${when}: the line reaches both edges (${c[0].left.toFixed(0)} to ${c.at(-1).right.toFixed(0)})`);
  for (let i = 1; i < c.length; i++) {
    assert.ok(Math.abs(c[i].left - c[i - 1].right - 20) < 1, `${when}: card ${i} is a gap after the one before (${(c[i].left - c[i - 1].right).toFixed(1)})`);
    assert.equal(c[i].id, ORDER[(ORDER.indexOf(c[i - 1].id) + 1) % ORDER.length], `${when}: the scenes keep their order`);
  }
  return c;
}
const first = await whole('at rest');
// (with five cards the screen no longer holds them all at once: those on it are the page's own, from the first)
const own = first.filter((c) => !c.copy).map((c) => c.id);
assert.deepEqual(own, ORDER.slice(0, own.length), 'the page opens on its own cards, from the first');
assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.list a:not(.is-copy)')].map((a) => a.dataset.id)), ORDER, 'the page holds its own five cards');

// the wheel, far both ways
await p.mouse.move(W / 2, H / 2);
for (let i = 0; i < 12; i++) await p.mouse.wheel(0, 700);
await p.waitForTimeout(900); await whole('after the wheel, forward');
for (let i = 0; i < 30; i++) await p.mouse.wheel(-700, 0);
await p.waitForTimeout(900); await whole('after the wheel, back');

// a drag moves the line and opens nothing
const before = (await seen())[1].left;
await p.mouse.down(); await p.mouse.move(W / 2 - 320, H / 2, { steps: 10 }); await p.waitForTimeout(150); await p.mouse.up();
await p.waitForTimeout(800);
assert.match(p.url(), /index\.html/, 'a drag opens nothing');
assert.ok(Math.abs((await whole('after a drag'))[1].left - before) > 100, 'a drag moves the line');

// the arrow keys: always onto one of the page's own cards, brought to the middle, in order
let at = null;
for (const [key, d] of [...Array(7).fill(['ArrowRight', 1]), ...Array(5).fill(['ArrowLeft', -1])]) {
  await p.keyboard.press(key);
  await p.waitForFunction(() => { const r = document.activeElement.getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 1; }, null, { timeout: 8000 }).catch(() => {});   // the slide, however slow the machine
  const f = await p.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.dataset.id, copy: a.classList.contains('is-copy') || a.hasAttribute('aria-hidden'), off: (r.left + r.right) / 2 - innerWidth / 2, lit: a.classList.contains('is-on'), scrolled: document.scrollingElement.scrollLeft }; });
  assert.ok(f.id && !f.copy, `${key}: the focus is on one of the page's own cards`);
  assert.ok(Math.abs(f.off) < 2 && f.lit && !f.scrolled, `${key}: that card is in the middle and lit (${f.off.toFixed(1)} off)`);
  if (at) assert.equal(f.id, ORDER[(ORDER.indexOf(at) + d + ORDER.length) % ORDER.length], `${key}: the next scene in that direction`);
  at = f.id; await whole(`after ${key}`);
}

// left alone, the line drifts; a card under the pointer holds it. Measured on the card nearest the middle: the
// second card on screen is another card once the first has drifted off the edge.
const middle = () => p.evaluate(() => [...document.querySelectorAll('.list a')].map((a) => a.getBoundingClientRect()).sort((q, r) => Math.abs(q.left + q.width / 2 - innerWidth / 2) - Math.abs(r.left + r.width / 2 - innerWidth / 2))[0].left);
await p.evaluate(() => document.activeElement.blur()); await p.mouse.move(5, 5);
await p.waitForTimeout(5200);
const a = await middle(); await p.waitForTimeout(1000); await whole('drifting'); const b = await middle();
assert.ok(b - a < -2, `left alone, the line drifts on (${(b - a).toFixed(1)} px in a second)`);
await p.mouse.move(W / 2, H / 2); await p.waitForTimeout(5200);
const c = await middle(); await p.waitForTimeout(1000);
assert.ok(Math.abs((await middle()) - c) < 0.5, 'a card under the pointer holds the line');
assert.equal(await p.evaluate(() => document.querySelectorAll('.list a.is-on').length), 1, 'and is the one lit card');

// a click opens the card under it
const href = await p.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('.list a').getAttribute('href'), [W / 2, H / 2]);
await p.mouse.click(W / 2, H / 2);
await p.waitForURL(`**/${href}`, { waitUntil: 'commit', timeout: 15000 });   // the scene itself may take its time on a slow machine

// a phone: a plain strip, the page's five cards, nothing moved by the script
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
m.on('pageerror', (e) => errors.push(e.message));
await m.goto(`${base}/index.html`, { waitUntil: 'load' }); await m.waitForTimeout(600);
const strip = await m.evaluate(() => { const l = document.querySelector('.list'); const all = [...l.querySelectorAll('a')]; return { loop: l.classList.contains('is-loop'), shown: all.filter((a) => a.offsetWidth).length, moved: all.filter((a) => a.style.transform).length, scrolls: l.scrollWidth > l.clientWidth }; });
assert.deepEqual(strip, { loop: false, shown: 5, moved: 0, scrolls: true }, 'the phone strip');

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('gallery-check: ok');
