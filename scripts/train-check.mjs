// Self-check of the movement's rules: node scripts/train-check.mjs
// The train's numbers make a minute and an hour; it beats six times a second and keeps the clock's time through a
// stalled frame; the fork and the escape wheel follow the balance; every layout is a movement that could be built
// (arbors a wheel's reach apart, the centre wheel within reach of both its neighbours, nothing turning into a
// plate, the headline on plain bridge); winding takes up the ratchet and the spring, and stops when it is full.
import assert from 'node:assert/strict';

globalThis.location = { search: '' };   // the shared kit reads the page's query when it loads
const { createCaliber, sdf, BEAT, TEETH, REACH, Z, BALANCE, PRIMS } = await import('../src/movement/caliber.js');

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not ${b}`);
const TAU = 2 * Math.PI;

// ---- the train's arithmetic
assert.equal(TEETH.centre / TEETH.thirdP * TEETH.third / TEETH.fourthP, 60, 'the fourth wheel turns sixty times for the centre wheel\'s once');
assert.equal(TEETH.fourth / TEETH.escapeP * 2 * TEETH.escape, 60 * BEAT, 'a turn of the fourth wheel is a minute of beats');

// ---- time: step it as a page would, 60 frames a second, from a quarter to three
const cal = createCaliber(); const st = cal.st; cal.lay(1440, 900, { l: 330, t: 670, r: 1110, b: 745 });
const T0 = 14 * 3600 + 45 * 60 + 0.004; let t = T0; cal.step(0, t);
const start = { fourth: st.fourth, third: st.third, centre: st.centre, escape: st.escape };
let ticks = 0; let widest = 0; let flips = 0; let side = Math.sign(st.fork); let wrong = 0; let was = st.balance;
for (let i = 0; i < 60 * 60; i++) {
  t += 1 / 60; cal.step(1 / 60, t);
  for (const e of st.events) if (e.kind === 'tick') ticks += e.n;
  widest = Math.max(widest, Math.abs(st.balance));
  if (Math.sign(st.fork) !== side && Math.abs(st.fork) > 0.05) { side = Math.sign(st.fork); flips++; if (Math.sign(st.balance - was) === side) wrong++; }
  was = st.balance;
}
assert.equal(ticks, 60 * BEAT, `a minute holds ${60 * BEAT} beats, not ${ticks}`);
assert.equal(flips, 60 * BEAT, `the fork goes over once a beat (${flips} times in a minute)`);
assert.equal(wrong, 0, 'the fork is thrown the way the balance\'s jewel pushes it: against the balance\'s own turn');
const turned = (a, b) => ((b - a) % TAU + TAU) % TAU;
near(turned(start.fourth, st.fourth), 0, 1e-6, 'after a minute the fourth wheel is where it began');
near(turned(st.third, start.third), TAU * TEETH.fourthP / TEETH.third, 1e-6, 'the third wheel has turned a pinion\'s share, the other way');
near(turned(start.centre, st.centre), TAU / 60, 1e-6, 'the centre wheel has turned a minute of its hour');
near(turned(st.escape, start.escape), 0, 1e-6, 'the escape wheel has made whole turns');
assert.ok(widest > 2.6 && widest < 5.3, `the balance swings between 150° and 300° each way (${(widest * 180 / Math.PI).toFixed(0)}°)`);
// a frame that stalls for five seconds: the watch has kept time, and says so in one late burst of ticks, not five seconds of them
t += 5; cal.step(0.1, t);
{ const beats = Math.floor(t * BEAT) % (60 * BEAT); const lead = turned(beats / (60 * BEAT) * TAU, st.fourth); assert.ok(lead >= -1e-9 && lead <= TAU / (60 * BEAT) + 1e-9, 'after a stalled frame the train stands where the clock says, to the beat'); }
assert.ok(st.events.filter((e) => e.kind === 'tick').every((e) => e.n <= 12), 'and a stall is not answered with a roll of ticks');
// the balance passes its dead point on the beat
cal.step(0, 1000 / BEAT); near(st.balance, 0, 1e-9, 'the balance is at its dead point on the beat');

// ---- winding
const fresh = createCaliber(); fresh.lay(1440, 900, null); fresh.step(0, T0);
const before = fresh.st.wind; const said = []; let clicks = 0; let tt = T0;
for (let i = 0; i < 8; i++) { said.push(fresh.wind()); for (let k = 0; k < 60; k++) { tt += 1 / 60; fresh.step(1 / 60, tt); for (const e of fresh.st.events) if (e.kind === 'click') clicks += e.n; } }
assert.ok(fresh.st.wind > before && fresh.st.wind <= 1, 'winding winds it');
assert.ok(said.includes('topped') && said.at(-1) === 'full', `the crown stops when the spring is full (${said.join(', ')})`);
const strokes = said.filter((s) => s !== 'full').length;
assert.ok(clicks > 14 && clicks <= strokes * 7, `a turn of the crown takes up seven teeth, or what room the spring has left (${clicks} teeth in ${strokes} turns)`);
near(fresh.st.ratchet * TEETH.ratchet / TAU, clicks, 0.05, 'the click drops once behind every tooth that passes, and a refused turn leaves the ratchet where it was');
near(fresh.st.crown, -fresh.st.ratchet * TEETH.ratchet / TEETH.crown, 1e-9, 'the crown wheel is geared to the ratchet');
const full = fresh.st.swing;
for (let k = 0; k < 60 * 600; k++) { tt += 1 / 60; fresh.step(1 / 60, tt); }
assert.ok(fresh.st.wind >= 0.1 - 1e-9 && fresh.st.wind < 0.2, `left alone it runs down, but never out (${fresh.st.wind.toFixed(2)})`);
assert.ok(fresh.st.swing < full - 1 && fresh.st.swing > 2.6, 'and the balance swings narrower for it, without ever stopping');

// ---- layouts: the shapes of screen it is laid out for, each with the box the page's headline fills there (measured
// in a browser: left, top, right, bottom of the letters, CSS px)
const frames = [
  [1440, 900, [327, 676, 1124, 735]], [1920, 1080, [481, 836, 1452, 907]], [1280, 720, [291, 524, 999, 575]], [1100, 1000, [250, 787, 859, 831]], [1024, 768, [232, 578, 799, 619]], [1366, 768, [310, 561, 1066, 617]],
  [390, 844, [72, 515, 325, 601]], [360, 640, [66, 358, 300, 438]], [768, 1024, [162, 584, 618, 737]], [430, 932, [79, 575, 358, 670]], [1000, 1000, [72, 663, 940, 727]],
  [780, 280, [20, 152, 307, 174]], [844, 390, [21, 235, 420, 265]], [915, 412, [23, 260, 444, 291]], [3440, 1440, [40, 1219, 942, 1285]], [2560, 1080, [40, 859, 942, 925]],
];
const report = [];
for (const [W, H, [l, tp, r, b]] of frames) {
  const c = createCaliber(); const g = c.lay(W, H, { l, t: tp, r, b }); const at = g.at; const name = `${W} × ${H} (${g.kind})`;
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  near(d(at.balance, at.pallet), REACH.pallet, 1e-9, `${name}: balance to pallets`); near(d(at.pallet, at.escape), REACH.escape, 1e-9, `${name}: pallets to escape wheel`);
  near(d(at.escape, at.fourth), REACH.fourth, 1e-9, `${name}: escape pinion to fourth wheel`); near(d(at.fourth, at.third), REACH.third, 1e-9, `${name}: fourth pinion to third wheel`);
  assert.ok(g.reach[1] > g.reach[0] && g.reach[1] < g.reach[2], `${name}: the centre wheel can reach both the barrel and the third wheel (${g.reach.map((v) => v.toFixed(1)).join(' < ')})`);
  near(d(at.centre, at.third), REACH.centre, 1e-6, `${name}: centre wheel to third pinion`); near(d(at.centre, at.barrel), REACH.barrel, 1e-6, `${name}: barrel to centre pinion`);
  near(d(at.barrel, at.crown), REACH.wind, 1e-9, `${name}: ratchet to crown wheel`);
  assert.ok(g.prims.length <= PRIMS, `${name}: ${g.prims.length} bars fit the shader's ${PRIMS}`);
  // the balance swings clear of the bridge, and the wheels under the window clear of each other's arbors
  for (let a = 0; a < 64; a++) { const x = at.balance[0] + (BALANCE.rim + BALANCE.head + 0.25) * Math.cos(a / 64 * TAU); const y = at.balance[1] + (BALANCE.rim + BALANCE.head + 0.25) * Math.sin(a / 64 * TAU); assert.ok(sdf(g.prims, 0, x, y) > 0, `${name}: the balance's screws would foul the bridge`); }
  const [third, fourth] = g.wheels;
  assert.ok(d(at.third, at.fourth) > fourth.r + 0.3, `${name}: the fourth wheel clears the third's arbor`); assert.ok(third.z < fourth.z && g.escape.z < Z.balance, `${name}: what overlaps lies at different heights`);
  // the winding wheels stand wholly on the bridge
  for (const w of [g.ratchet, g.crown]) for (let a = 0; a < 48; a++) assert.ok(sdf(g.prims, 0, w.at[0] + w.r * Math.cos(a / 48 * TAU), w.at[1] + w.r * Math.sin(a / 48 * TAU)) < -0.2, `${name}: a winding wheel hangs over the bridge's edge`);
  // the headline lies on plain bridge: nothing cut away under it, nothing screwed or set into it, no wheel over it
  const box = g.title; let cutting = 0;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 6; j++) {
    const x = box.l + (box.r - box.l) * i / 24; const y = box.b + (box.t - box.b) * j / 6;
    if (sdf(g.prims, 0, x, y) > -0.25 || c.heightAt(x, y) !== Z.bridge) cutting++;
    for (const s of [...g.screws, ...g.jewels]) if (Math.hypot(x - s.x, y - s.y) < s.r * (s.chaton ? 1.9 : 1.15)) cutting++;
  }
  assert.equal(cutting, 0, `${name}: the headline is not on plain bridge at ${cutting} of the points tried`);
  assert.ok(g.screws.length <= 48 && g.jewels.length <= 48, `${name}: the screws and jewels fit their batches`);
  report.push(`${g.kind} ${g.ppm.toFixed(0)} px/mm`);
}
console.log(`train-check: all good (${60 * BEAT} beats a minute, ${strokes} turns of the crown to full, ${frames.length} layouts: ${[...new Set(report.map((r) => r.split(' ')[0]))].join(', ')})`);
