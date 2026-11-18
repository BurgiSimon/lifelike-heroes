// Self-check of the night rain's rules: node scripts/rain-check.mjs
// The pane the page opens on has rain on it and the trails of its last drops. Left to rain, it neither empties nor
// fills up, on a phone or on a large screen, and every drop stays a drop (a place, a size). A drop that is sent runs
// down, takes what is in its way and leaves beads behind it. With no motion it is run to its end at once, and nothing
// else on the pane changes meanwhile. Without rain nothing lands.
import assert from 'node:assert/strict';

globalThis.location = { search: '' };   // the shared kit reads the page's query when it loads
const { createRain, STRIDE, CAPACITY } = await import('../src/rain/drops.js');

const sound = (r, when) => { for (const d of r.st.drops) assert.ok(Number.isFinite(d.x + d.y + d.r) && d.r > 0 && d.r < 40, `${when}: a drop that is no drop (${d.x}, ${d.y}, ${d.r})`); assert.ok(r.st.drops.length <= CAPACITY, `${when}: more drops than the buffer holds`); };
const report = [];

// the pane it opens on, and a minute of rain after that
for (const [name, W, H, rain] of [['desktop', 1440, 900, 1], ['downpour', 1440, 900, 2], ['phone', 390, 844, 1], ['large', 2560, 1440, 1]]) {
  const r = createRain(); r.fit(W, H);
  const stamps = r.soak(26, rain, 14);
  sound(r, `${name}, opening`);
  assert.ok(r.st.drops.length > 60 * (W * H) / 1e6, `${name}: the pane opens nearly dry (${r.st.drops.length} drops)`);
  assert.ok(stamps.length % STRIDE === 0 && stamps.length > 0 && stamps.length <= CAPACITY * STRIDE, `${name}: the opening trails (${stamps.length / STRIDE} stamps)`);
  for (let i = 0; i < stamps.length; i += STRIDE) assert.ok(stamps[i + 5] < 0 && stamps[i + 5] >= -1, `${name}: a stamp's strength is ${stamps[i + 5]}`);
  const counts = []; let ran = 0;
  for (let s = 0; s < 60; s++) { for (let i = 0; i < 60; i++) r.advance(1 / 60, rain); counts.push(r.st.drops.length); ran = Math.max(ran, r.st.drops.filter((d) => d.run).length); }
  sound(r, `${name}, after a minute`);
  const least = Math.min(...counts); const most = Math.max(...counts);
  assert.ok(least > 0.5 * counts[0] && most < 2 * counts[0] + 50, `${name}: the pane does not hold its rain (${least} to ${most} drops from ${counts[0]})`);
  assert.ok(ran >= 1, `${name}: nothing ran in a minute`);
  assert.equal(r.write(), r.st.drops.length, `${name}: the buffer holds every drop`);
  report.push(`${name}: ${least} to ${most} drops over a minute, up to ${ran} running at once`);
}

// a sent drop
{
  const r = createRain(); r.fit(1440, 900); r.soak(26, 1, 14);
  const below = () => r.st.drops.filter((d) => !d.run && !d.bead && Math.abs(d.x - 700) < 14 && d.y > 220).length;
  const before = below();
  const d = r.send(700, 200);
  assert.ok(d.run && d.r >= 10, 'a sent drop is heavy and runs');
  const y0 = d.y; for (let i = 0; i < 150; i++) r.advance(1 / 60, 0);
  assert.ok(d.y - y0 > 150 || !r.st.drops.includes(d), `a sent drop runs down (${(d.y - y0).toFixed(0)} px in 2.5 s)`);
  for (let i = 0; i < 600 && d.run && r.st.drops.includes(d); i++) r.advance(1 / 60, 0);
  const beads = r.st.drops.filter((e) => e.bead && Math.abs(e.x - d.x) < 120 && e.y > y0).length;
  assert.ok(beads >= 4, `it leaves beads behind it (${beads})`);
  assert.ok(below() < before || before === 0, `and takes what was in its way (${before} drops before, ${below()} after)`);
  report.push(`a sent drop: ${beads} beads left, ${before - below()} of ${before} drops in its way taken`);
}

// no motion: run to its end at once, the rest of the pane as it was
{
  const r = createRain(); r.fit(1440, 900); r.soak(26, 1, 14);
  const far = r.st.drops.filter((d) => Math.abs(d.x - 400) > 200).map((d) => [d, d.x, d.y, d.r]);
  const d = r.send(400, 150); const stamps = r.settle(d);
  assert.ok(!d.run || !r.st.drops.includes(d), 'settled: the drop has stopped or left the pane');
  assert.ok(stamps.length / STRIDE > 20, `settled: its way is stamped (${stamps.length / STRIDE} stamps)`);
  for (const [e, x, y, rad] of far) assert.ok(r.st.drops.includes(e) && e.x === x && e.y === y && e.r === rad, 'settled: a drop elsewhere on the pane changed');
}

// no rain
{
  const r = createRain(); r.fit(1440, 900); r.soak(26, 0, 14);
  for (let i = 0; i < 600; i++) r.advance(1 / 60, 0);
  assert.equal(r.st.drops.length, 0, 'without rain nothing lands');
}
console.log(`rain-check: ok\n  ${report.join('\n  ')}`);
