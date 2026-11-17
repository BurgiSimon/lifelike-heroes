// Self-check of the koi pond's rules: node scripts/pond-check.mjs
// A pellet falls before it splashes, the koi leave it alone until it is in the water, and one that comes down on a
// lily pad rolls off the rim into open water inside the frame. Idle koi keep off the headline on the bed, without
// getting stuck, and still take a pellet dropped on it.
import assert from 'node:assert/strict';

globalThis.location = { search: '' };   // the shared kit reads the page's query when it loads
const { createPond } = await import('../src/koi/pond.js');

const pond = createPond({ count: 6, pads: 6, speed: 1, reach: 220, ripple: 260 }); const st = pond.st;
pond.fit(1280, 800); pond.place();
const run = (s) => { for (let i = 0; i < s * 60; i++) pond.step(1 / 60); };
const onPad = (p) => st.pads.some((q) => Math.hypot(p.x - q.u * st.W - q.ox, p.y - q.v * st.H - q.oy) < q.r * st.S);

// open water: in the air first, nothing splashes; then one splash where it was aimed
const a = pond.drop(640, 400);
run(0.2);
assert.ok(!a.wet && a.h > 0 && a.h < 1, 'still falling after 0.2 s');
assert.equal(st.splash.filter((s) => s.kind === 'pellet').length, 0, 'no splash while it is in the air');
run(0.2);
assert.ok(a.wet && a.h === 0, 'in the water after 0.4 s');
assert.deepEqual(st.splash.filter((s) => s.kind === 'pellet').map((s) => [s.x, s.y]), [[640, 400]], 'one splash, where it came down');

// every pad, at its middle and toward each side (also the sides that are out of the frame)
let rolled = 0;
for (const q of [...st.pads]) {
  for (const [ux, uy] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
    st.pellets.length = 0; st.splash.length = 0;
    const p = pond.drop(q.u * st.W + q.ox + ux * q.r * st.S, q.v * st.H + q.oy + uy * q.r * st.S);
    run(0.4);
    if (!onPad(p) && p.wet) continue;   // the aim was clamped into the frame and missed the pad
    assert.ok(!p.wet && p.roll, `pad ${q.i} [${ux},${uy}]: lies dry on the pad and rolls`);
    assert.equal(st.splash.filter((s) => s.kind === 'pellet').length, 0, 'no splash on a pad');
    for (let i = 0; i < 120 && !p.wet; i++) pond.step(1 / 60);
    assert.ok(p.wet, `pad ${q.i} [${ux},${uy}]: in the water within 2 s`);
    rolled++;
    assert.ok(!onPad(p), `pad ${q.i} [${ux},${uy}]: clear of every pad`);
    assert.ok(p.x >= 14 && p.x <= st.W - 14 && p.y >= 14 && p.y <= st.H - 14, `pad ${q.i} [${ux},${uy}]: inside the frame (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
  }
}
assert.ok(rolled >= 20, `only ${rolled} of 30 drops met a pad`);

// the headline's box, on a desktop frame and on a phone: three minutes of idle koi
const idle = (W, H, box) => {
  const q = createPond({ count: 6, pads: 6, speed: 1, reach: 220, ripple: 260 }); const s = q.st;
  q.fit(W, H); q.place(); q.setKeep(box);
  const over = (f) => box && f.x > box.l && f.x < box.r && f.y > box.t && f.y < box.b;
  for (let i = 0; i < 600; i++) q.step(1 / 60);   // let them leave their starting spots
  let hit = 0; let n = 0; const far = s.fish.map(() => 0); const was = s.fish.map((f) => [f.x, f.y]);
  for (let i = 0; i < 180 * 60; i++) {
    q.step(1 / 60); n++;
    if (s.fish.some(over)) hit++;
    s.fish.forEach((f, k) => { far[k] += Math.hypot(f.x - was[k][0], f.y - was[k][1]); was[k] = [f.x, f.y]; assert.ok(f.x > -40 && f.x < W + 40 && f.y > -40 && f.y < H + 40, 'a koi left the frame'); });
  }
  return { share: hit / n, slowest: Math.min(...far) / 180, pond: q };
};
const report = [];
for (const [name, W, H, box] of [['desktop', 1280, 800, { l: 415, t: 290, r: 865, b: 455 }], ['phone', 390, 780, { l: 90, t: 320, r: 300, b: 400 }]]) {
  const free = idle(W, H, null); const kept = idle(W, H, box);
  // (free.share is 0 by construction: with no box nothing counts as over it; measure it against the same box)
  const base = (() => { const q = createPond({ count: 6, pads: 6, speed: 1, reach: 220, ripple: 260 }); q.fit(W, H); q.place(); let hit = 0; for (let i = 0; i < 190 * 60; i++) { q.step(1 / 60); if (i >= 600 && q.st.fish.some((f) => f.x > box.l && f.x < box.r && f.y > box.t && f.y < box.b)) hit++; } return hit / (180 * 60); })();
  report.push(`${name}: a koi over the headline ${(base * 100).toFixed(0)}% of the time without the rule, ${(kept.share * 100).toFixed(1)}% with it; slowest koi ${kept.slowest.toFixed(0)} px/s (${free.slowest.toFixed(0)} without)`);
  assert.ok(kept.share < 0.1, `${name}: idle koi are over the headline ${(kept.share * 100).toFixed(0)}% of the time`);
  assert.ok(kept.slowest > 0.6 * free.slowest, `${name}: a koi is stuck (${kept.slowest.toFixed(1)} px/s)`);
  // food on the headline is still taken
  const q = kept.pond; q.drop((box.l + box.r) / 2, (box.t + box.b) / 2);
  for (let i = 0; i < 12 * 60 && q.st.pellets.length; i++) q.step(1 / 60);
  assert.equal(q.st.pellets.length, 0, `${name}: a pellet on the headline is taken within 12 s`);
}
console.log(`pond-check: ok (${rolled} pellets rolled off a pad)\n  ${report.join('\n  ')}`);
