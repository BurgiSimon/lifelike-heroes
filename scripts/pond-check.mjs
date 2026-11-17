// Self-check of the koi pond's pellet rules: node scripts/pond-check.mjs
// A pellet falls before it splashes, the koi leave it alone until it is in the water, and one that comes down on a
// lily pad rolls off the rim into open water inside the frame.
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
console.log(`pond-check: ok (${rolled} pellets rolled off a pad)`);
