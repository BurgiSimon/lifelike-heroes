// Self-check of the scenes' sound: node scripts/sound-check.mjs   (needs the dev server, as shot.mjs does)
// 1. Every scene's bed and every voice is rendered offline and held to "calm": a quiet bed, voices that are soft
//    and gone again, and nothing near clipping even with every voice at once.
// 2. On each page nothing makes a sound until the Sound tab is clicked; then the context runs, the actions are
//    heard, and a second click puts it back to sleep.
// 3. The gallery's switch is the scenes' default: a scene opened after it comes up with its sound on.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE || 'http://localhost:5173';
const SCENES = {
  meadow: { room: 1.6, bed: (v) => v.air(1, 0, 0), voices: { sow: (v) => v.sow(0.3), gust: (v) => v.air(1, 1, 0), brush: (v) => v.air(1, 0, 2) }, actions: ['sow', 'gust'] },
  koi: { room: 1.2, voices: { pellet: (v) => v.pellet(0), gulp: (v) => v.gulp(0.4), skim: (v) => v.skim(-0.4), drip: (v) => v.drip(0) }, actions: ['feed'] },
  stars: { room: 3.2, voices: { pin: (v) => v.pin(7, 1, 0.2, 0.09), tick: (v) => v.tick(3, 0), clear: (v) => v.clear(), twinkle: (v) => v.twinkle() }, actions: ['pin', 'clear'] },
  mist: { room: 0.9, voices: { tick: (v) => v.tick(0.2, 6), slip: (v) => v.slip(-0.3), drip: (v) => v.drip(0), run: (v) => v.run(0.1), wipe: (v) => v.wipe(-0.2, 500) }, actions: ['drip'] },
  light: { room: 1.4, voices: { hang: (v) => v.hang(0.2, 1), tap: (v) => v.tap(-0.3, 0.3), rush: (v) => v.rush(0.4), rustle: (v) => v.rustle(0.1, 500) }, actions: ['hang', 'gust'] },
  roost: { room: 2.2, voices: { clap: (v) => v.clap(0.1), lift: (v) => v.lift(-0.2, 80), land: (v) => v.land(0.3), wave: (v) => v.wave(-0.4), chatter: (v) => v.chatter(0.2) }, actions: ['clap', 'falcon'] },
  movement: { room: 0.9, voices: { tick: (v) => v.tick(0, 0, 0.7), click: (v) => v.click(3, -0.4), crown: (v) => v.crown(-0.4), stop: (v) => v.stop(-0.4) }, actions: ['wind'] },
};
const dB = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const problems = []; const check = (ok, what) => { if (!ok) { problems.push(what); console.log(`  NOT OK: ${what}`); } };   // every level is printed before anything fails

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/three\.js/.test(m.text())) errors.push(m.text()); }); };

// ---- 1. offline: levels
const lab = await ctx.newPage(); watch(lab);
await lab.goto(`${base}/src/shared/sound.js`, { waitUntil: 'load' });   // any same-origin document the dev server will not reload
for (const [id, scene] of Object.entries(SCENES)) {
  // 8 s of sound → { peak, rms from 2 s on, rms of the last second }, with `play` run on the voices at the start.
  // alone: the bed is left unplugged, so a soft voice can be measured by itself.
  const render = (play, alone = false) => lab.evaluate(async ([id, room, play, alone]) => {
    const seconds = 8;
    const { rig } = await import('/src/shared/sound.js'); const { voices } = await import(`/src/${id}/sound.js`);
    const off = new OfflineAudioContext(2, 48000 * seconds, 48000);
    const kit = rig(off, room);
    const v = voices(alone ? { ...kit, dry: off.createGain(), wet: off.createGain() } : kit, 1);
    for (const fn of play) (0, eval)(`(${fn})`)(v);
    const buf = await off.startRendering(); const a = buf.getChannelData(0); const b = buf.getChannelData(1);
    let peak = 0; let sum = 0; let tail = 0; let bad = 0;
    for (let i = 0; i < a.length; i++) {
      const m = Math.max(Math.abs(a[i]), Math.abs(b[i])); const e = (a[i] * a[i] + b[i] * b[i]) / 2;
      if (!Number.isFinite(m)) bad++;
      peak = Math.max(peak, m); if (i >= 96000) sum += e; if (i >= a.length - 48000) tail += e;
    }
    return { peak, rms: Math.sqrt(sum / (a.length - 96000)), tail: Math.sqrt(tail / 48000), bad };
  }, [id, scene.room, play.map(String), alone]);

  const bed = await render(scene.bed ? [scene.bed] : []);
  console.log(`${id}: bed ${dB(bed.rms)} dBFS rms, peak ${dB(bed.peak)}`);
  assert.equal(bed.bad, 0, `${id}: the bed has samples that are not numbers`);
  check(bed.rms > 10 ** (-46 / 20) && bed.rms < 10 ** (-30 / 20), `${id}: bed at ${dB(bed.rms)} dBFS, wanted -46 to -30`);
  for (const [name, fn] of Object.entries(scene.voices)) {
    const lasting = name === 'gust' || name === 'brush';   // these are the bed itself, risen: they hold as long as their cause
    const r = await render([fn], !lasting);
    assert.equal(r.bad, 0, `${id}.${name}: samples that are not numbers`);
    if (lasting) {
      console.log(`  ${name}: ${dB(r.rms)} dBFS rms while it lasts`);
      check(r.rms > bed.rms * 1.4 && r.rms < bed.rms * 4, `${id}.${name}: ${dB(r.rms)} dBFS, wanted 3 to 12 dB over the bed`);
    } else {
      console.log(`  ${name}: peak ${dB(r.peak)} dBFS on its own, last second ${dB(r.tail)} rms`);
      check(r.peak > 10 ** (-44 / 20) && r.peak < 10 ** (-14 / 20), `${id}.${name}: peak ${dB(r.peak)} dBFS, wanted -44 to -14`);
      check(r.tail < 10 ** (-70 / 20), `${id}.${name}: still sounding after 7 s (${dB(r.tail)} dBFS)`);
    }
  }
  const all = await render(Object.values(scene.voices));
  console.log(`  all at once: peak ${dB(all.peak)} dBFS`);
  check(all.peak < 0.5, `${id}: every voice at once peaks at ${dB(all.peak)} dBFS`);
}
await lab.close();

// ---- 2. on the pages: silent until asked
for (const [id, scene] of Object.entries(SCENES)) {
  const p = await ctx.newPage(); watch(p);
  await p.addInitScript(() => {
    window.__made = [];
    window.AudioContext = class extends window.AudioContext { constructor(...a) { super(...a); window.__made.push(this); this.__tap = this.createAnalyser(); } };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (to, ...rest) { if (to === this.context.destination && this.context.__tap) connect.call(this, this.context.__tap); return connect.call(this, to, ...rest); };
    window.__level = () => { const c = window.__made[0]; const d = new Float32Array(c.__tap.fftSize); let most = 0; c.__tap.getFloatTimeDomainData(d); for (const x of d) most = Math.max(most, Math.abs(x)); return most; };
  });
  await p.goto(`${base}/${id}.html?q=low`, { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  assert.equal(await p.evaluate(() => window.__made.length), 0, `${id}: an AudioContext before anyone asked for sound`);
  await p.click('.chrome__tab[data-sound]');
  await p.waitForTimeout(2500);
  assert.equal(await p.textContent('.chrome__tab[data-sound]'), 'Sound: on');
  assert.equal(await p.evaluate(() => window.__made[0].state), 'running', `${id}: the context runs after the click`);
  let heard = 0;
  for (const a of scene.actions) {
    await p.evaluate((a) => window.hero.action(a), a);
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(150); heard = Math.max(heard, await p.evaluate(() => window.__level())); }
  }
  console.log(`${id} page: running after the click, heard up to ${dB(heard)} dBFS`);
  check(heard > 10 ** (-60 / 20) && heard < 0.5, `${id}: heard ${dB(heard)} dBFS on the page`);
  await p.click('.chrome__tab[data-sound]');
  await p.waitForTimeout(1500);
  assert.equal(await p.evaluate(() => window.__made[0].state), 'suspended', `${id}: asleep again once switched off`);
  await p.close();
}
// ---- 3. the gallery's switch
const g = await ctx.newPage(); watch(g);
await g.goto(`${base}/index.html`, { waitUntil: 'load' });
assert.equal(await g.textContent('.sound'), 'Sound: off');
await g.click('.sound');
assert.equal(await g.textContent('.sound'), 'Sound: on');
await g.click('a[href="koi.html"]');
await g.waitForSelector('.chrome__tab[data-sound]');
await g.waitForTimeout(5000);
assert.equal(await g.textContent('.chrome__tab[data-sound]'), 'Sound: on', 'the pond opens with its sound on');
await g.mouse.click(300, 300);   // if the browser held the sound back for want of a click, this is one
await g.waitForTimeout(1000);
assert.equal(await g.evaluate(() => new Promise((done) => { const c = new AudioContext(); done(c.state); c.close(); })), 'running', 'sound runs on the pond');
await g.click('.chrome__tab[data-sound]');
await g.goBack(); await g.waitForSelector('.sound');
assert.equal(await g.textContent('.sound'), 'Sound: off', 'switched off on the pond, off on the gallery');
console.log('gallery: its switch carries to a scene and back');
await browser.close();
assert.deepEqual(errors, [], 'the pages logged errors');
assert.deepEqual(problems, []);
console.log('sound-check: ok');
