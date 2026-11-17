// Real-GPU probe. WSL's own Chromium cannot hold a WebGL context on this machine (its GPU process segfaults), so the
// page is opened in the Windows host's Edge, headless, through a small proxy in front of the dev server. The proxy
// injects a script that runs --eval, measures frame times, grabs the hero's canvases and posts the report back.
//
//   node scripts/gpu.mjs <page> [--size 1440x900] [--q high|low|auto] [--query "a=1&b=2"] [--wait 3000] [--ms 4000]
//                        [--eval "js, may return a promise"] [--uncapped] [--out file.png] [--burst 4x300]
//
// Order in the page: wait, eval, measure frames for --ms, then capture. Prints one JSON line: gpu, canvas sizes, fps
// {avg, median, p95ms}, eval result, console errors. --out saves the hero's canvases (not the DOM text above them; use
// shot.mjs --soft for that); --burst 4x300 saves four frames 300 ms apart as file-0.png .. file-3.png, to judge motion.
// The eval can drive the page with probe.sleep(ms), probe.ptr('pointermove', x, y) and probe.click(x, y).
// Runs are serialised with a lock so two probes never share the GPU and the frame times stay honest.
import http from 'node:http';
import fs from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';

if (!process.env.GPU_LOCKED) {
  const r = spawnSync('flock', ['/tmp/hero-gpu.lock', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, GPU_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
const page = argv[0];
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
if (!page || page.startsWith('--')) { console.error('usage: node scripts/gpu.mjs <page> [--size WxH] [--q high] [--wait ms] [--ms ms] [--eval js] [--uncapped] [--out file.png]'); process.exit(2); }
const [w, h] = opt('size', '1440x900').split('x').map(Number);
const wait = Number(opt('wait', 3000)); const ms = Number(opt('ms', 4000));
const pre = opt('eval', ''); const out = opt('out', ''); const query = opt('query', '');
const [burstN, burstMs] = opt('burst', '1x0').split('x').map(Number);
const PORT = 5200 + (process.pid % 300);
const POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const EDGE = '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TAG = `hero-probe-${PORT}`;
const PROFILE = `${execFileSync('/mnt/c/Windows/System32/cmd.exe', ['/c', 'echo %TEMP%'], { cwd: '/mnt/c' }).toString().trim()}\\${TAG}`;

const head = `<script>
window.__out = { errors: [] };
setTimeout(() => window.close(), ${wait + ms + 60000}); // whatever happens to the probe, this browser does not outlive it
addEventListener('error', (e) => __out.errors.push('pageerror: ' + e.message));
const at = (x, y) => document.elementFromPoint(x, y) || document.body;
window.probe = {
  sleep: (t) => new Promise((r) => setTimeout(r, t)),
  ptr(type, x, y, o = {}) { at(x, y).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...o })); },
  click(x, y) { this.ptr('pointerdown', x, y, { buttons: 1 }); this.ptr('pointerup', x, y); at(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })); },
};
for (const k of ['error', 'warn']) { const f = console[k]; console[k] = (...a) => { const s = a.map(String).join(' ').slice(0, 400); if (!/vite|WebSocket/i.test(s)) __out.errors.push(k + ': ' + s); f.apply(console, a); }; }
</script>`;
const tail = `<script type="module">
const out = window.__out; const sleep = (t) => new Promise((r) => setTimeout(r, t));
try {
  const hero = document.querySelector('#hero');
  const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info');
  out.gpu = g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'no debug info') : 'no webgl2';
  for (let i = 0; i < 300 && !hero.querySelector('canvas'); i++) await sleep(100);
  await sleep(${wait});
  if (${JSON.stringify(pre)}) out.eval = String(await (0, eval)(${JSON.stringify(pre)}));
  const d = await new Promise((done) => { const d = []; let last = 0; const t0 = performance.now(); const f = (now) => { if (last) d.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(f); else done(d); }; requestAnimationFrame(f); });
  d.sort((a, b) => a - b); const avg = d.reduce((a, b) => a + b, 0) / d.length;
  out.fps = { avg: +(1000 / avg).toFixed(1), median: +(1000 / d[d.length >> 1]).toFixed(1), p95ms: +d[Math.floor(d.length * 0.95)].toFixed(1), frames: d.length };
  const cs = [...hero.querySelectorAll('canvas')];
  out.cls = hero.className; out.inner = [innerWidth, innerHeight, devicePixelRatio]; out.canvas = cs.map((c) => [c.width, c.height]);
  // A WebGL canvas only holds its picture until the frame is presented, so it is copied inside a frame callback.
  const grab = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const k = document.createElement('canvas'); k.width = innerWidth; k.height = innerHeight; const x = k.getContext('2d');
    for (const c of cs) { const b = c.getBoundingClientRect(); x.drawImage(c, b.left, b.top, b.width, b.height); }
    r(k.toDataURL('image/png'));
  })));
  if (${JSON.stringify(!!out)} && cs.length) { out.png = []; for (let i = 0; i < ${burstN}; i++) { if (i) await sleep(${burstMs}); out.png.push(await grab()); } }
} catch (err) { out.errors.push('probe: ' + err.message); }
await fetch('/__report', { method: 'POST', body: JSON.stringify(out) });
window.close();
</script>`;

let child; let done = false;
const finish = (code) => {
  if (done) return; done = true;
  try { child?.kill(); } catch {}
  // The page closes its own window, which ends the browser. This sweep is the fallback for a page that never loaded:
  // the interop stub does not take the Windows process tree with it. It is not waited for (the host can be slow).
  spawn(POWERSHELL, ['-NoProfile', '-Command', `Start-Sleep -Seconds 2; Get-CimInstance Win32_Process -Filter "name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${TAG}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue '${PROFILE}'`], { cwd: '/mnt/c', stdio: 'ignore', detached: true }).unref();
  setTimeout(() => process.exit(code), 500);
};
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => finish(1));

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__report') {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      res.end('ok');
      const report = JSON.parse(body);
      if (report.png) report.png = report.png.map((data, i) => { const f = report.png.length > 1 ? out.replace(/(\.png)?$/, `-${i}.png`) : out; fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); return f; });
      console.log(JSON.stringify(report));
      finish(0);
    });
    return;
  }
  const up = http.request({ host: 'localhost', port: 5173, path: req.url, method: req.method, headers: { ...req.headers, host: 'localhost:5173' } }, (r) => {
    if (req.url.startsWith(`/${page}.html`)) {
      let html = ''; r.setEncoding('utf8'); r.on('data', (c) => { html += c; }); r.on('end', () => {
        html = html.replace('<head>', `<head>${head}`).replace('</body>', `${tail}</body>`);
        const hd = { ...r.headers }; delete hd['content-length']; delete hd['content-encoding'];
        res.writeHead(r.statusCode, hd); res.end(html);
      });
    } else { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
  });
  up.on('error', () => { res.statusCode = 502; res.end(); });
  req.pipe(up);
});
server.listen(PORT, '0.0.0.0', () => {
  child = spawn(EDGE, ['--headless=new', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-component-update', '--disable-background-mode',
    `--window-size=${w + 24},${h + 126}`, '--force-device-scale-factor=1', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(argv.includes('--uncapped') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
    `http://localhost:${PORT}/${page}.html?q=${opt('q', 'high')}${query ? `&${query}` : ''}`], { cwd: '/mnt/c', stdio: 'ignore' });
  setTimeout(() => { console.log('timeout: no report'); finish(1); }, wait + ms + 90000);
});
