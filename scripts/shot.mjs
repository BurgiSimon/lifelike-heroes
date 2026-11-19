// Screenshot a hero in headless Chromium and print what the page logged.
//   node scripts/shot.mjs <page> [--out file.png] [--size 1440x900] [--wait 3000] [--dpr 1] [--reduced] [--mobile]
//                         [--q high|low|auto] [--query "a=1&b=2"] [--soft]
//                         [--steps "move:0.5,0.6;wait:400;click:0.3,0.7;drag:0.2,0.5>0.6,0.5;key:Tab;eval:hero.action('gust');fps:3000;shot:mid.png"]
// <page> is meadow | koi | stars | mist | light | roost | index. Step coordinates are shares of the viewport. fps:<ms> prints the frame
// times measured over that long. q=high is passed unless --q says otherwise, so the governor holds full resolution.
// Renders on this machine's real GPU (Intel Iris Xe through WSL's D3D12); --soft falls back to SwiftShader.
// Needs the dev server (BASE, default http://localhost:5173).
import { chromium } from 'playwright';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: o, positionals: [page = 'index'] } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, size: { type: 'string', default: '1440x900' }, wait: { type: 'string', default: '3000' }, dpr: { type: 'string', default: '1' }, reduced: { type: 'boolean' }, soft: { type: 'boolean' }, q: { type: 'string', default: 'high' }, mobile: { type: 'boolean' }, query: { type: 'string', default: '' }, steps: { type: 'string', default: '' } },
});
const [w, h] = (o.mobile ? '390x844' : o.size).split('x').map(Number);
const out = path.resolve(o.out || `${page}.png`);
const base = process.env.BASE || 'http://localhost:5173';

// GALLIUM_DRIVER=d3d12 is what puts Mesa on the GPU; without it gl-egl lands on llvmpipe.
const browser = await chromium.launch({ env: { ...process.env, GALLIUM_DRIVER: 'd3d12' }, args: o.soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(o.dpr), hasTouch: !!o.mobile, isMobile: !!o.mobile, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() !== 'debug') console.log(`[${m.type()}] ${m.text()}`); });
p.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
p.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
p.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });

await p.goto(`${base}/${page}.html?q=${o.q}${o.query ? `&${o.query}` : ''}`, { waitUntil: 'load' });
await p.waitForTimeout(Number(o.wait));
const xy = (s) => { const [x, y] = s.split(',').map(Number); return [x * w, y * h]; };
const shoot = (file) => p.screenshot({ path: file, timeout: 120000 }).then(() => console.log(`shot ${file}`));
// Steps split only at a semicolon that a step name follows, so an eval body may hold its own semicolons.
for (const step of o.steps.split(/;\s*(?=(?:wait|move|click|drag|key|eval|fps|shot):)/).filter(Boolean)) {
  const [kind, ...rest] = step.split(':'); const arg = rest.join(':');
  if (kind === 'wait') await p.waitForTimeout(Number(arg));
  else if (kind === 'move') await p.mouse.move(...xy(arg), { steps: 12 });
  else if (kind === 'click') await p.mouse.click(...xy(arg));
  else if (kind === 'drag') { const [a, b] = arg.split('>'); await p.mouse.move(...xy(a)); await p.mouse.down(); await p.mouse.move(...xy(b), { steps: 16 }); await p.mouse.up(); }
  else if (kind === 'key') await p.keyboard.press(arg);
  else if (kind === 'eval') console.log(`eval → ${JSON.stringify(await p.evaluate(arg))}`);
  else if (kind === 'fps') {
    const ms = await p.evaluate((span) => new Promise((done) => { const d = []; let last = 0; const t0 = performance.now(); const f = (now) => { if (last) d.push(now - last); last = now; if (now - t0 < span) requestAnimationFrame(f); else done(d); }; requestAnimationFrame(f); }), Number(arg));
    ms.sort((a, b) => a - b); const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    if (!ms.length) console.log(`fps → fewer than two frames in ${arg} ms`);
    else console.log(`fps → avg ${(1000 / avg).toFixed(1)} (frame ${avg.toFixed(1)} ms, median ${ms[ms.length >> 1].toFixed(1)}, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(1)}) over ${ms.length} frames at ${w}x${h} dpr ${o.dpr}`);
  }
  else if (kind === 'shot') await shoot(path.resolve(path.dirname(out), arg));
  else throw new Error(`unknown step: ${kind}`);
}
await shoot(out);
await browser.close();
