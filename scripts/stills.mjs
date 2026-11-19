// The gallery's stills (and each scene page's opening picture): every scene without its text, as one settled frame,
// wide (1600x1000) and tall (900x1600), written to public/assets/gallery/.
//   node scripts/stills.mjs [meadow koi stars mist light]      needs the dev server, as shot.mjs does; software rendering, so slow
import { chromium } from 'playwright';

const base = process.env.BASE || 'http://localhost:5173';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['meadow', 'koi', 'stars', 'mist', 'light'];
const SIZES = { wide: { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }, tall: { viewport: { width: 450, height: 800 }, deviceScaleFactor: 2 } };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const id of ids) {
  for (const [name, size] of Object.entries(SIZES)) {
    const p = await (await browser.newContext({ ...size, reducedMotion: 'reduce' })).newPage();
    p.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
    await p.goto(`${base}/${id}.html?q=high`, { waitUntil: 'load' });
    await p.addStyleTag({ content: '.chrome, .poster { display: none !important; }' });   // the page's own furniture stays out of the picture
    await p.waitForTimeout(7000);
    await p.evaluate(() => window.hero.update({ text: false }));
    await p.waitForTimeout(4000);
    const path = `public/assets/gallery/${id}-${name}.jpg`;
    await p.screenshot({ path, type: 'jpeg', quality: 76, timeout: 180000 });
    console.log(`still ${path}`);
    await p.context().close();
  }
}
await browser.close();
