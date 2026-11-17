// Self-check of the pond's rules, no browser needed: node src/koi/pond.check.mjs
import assert from 'node:assert/strict';

globalThis.location = { search: '' }; // kit.js reads the query string on import
const { createPond, N, TAIL } = await import('./pond.js');

const cfg = { count: 6, pads: 6, speed: 1, reach: 220, ripple: 260 };
const make = (W, H, c = cfg) => { const p = createPond(c); p.fit(W, H); p.place(); return p; };
const run = (p, seconds, each) => { for (let i = 0; i < seconds * 60; i++) { p.step(1 / 60); each?.(); p.st.splash.length = 0; } };
// total turn along the backbone, radians
const bend = (f) => { let sum = 0; for (let k = 2; k < N; k++) { const a = f.sp[k - 2]; const b = f.sp[k - 1]; const c = f.sp[k]; sum += Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y))); } return sum; };

// a minute of wandering: every koi stays in the water (a head may leave the frame by a head's length), and bodies arc gently instead of curling into hooks
{
  const p = make(1440, 900); const { st } = p; let hooked = 0; let frames = 0;
  run(p, 60, () => {
    for (const f of st.fish) {
      const out = 10 * st.S * f.z;
      assert.ok(f.x >= -out && f.x <= st.W + out && f.y >= -out && f.y <= st.H + out && Number.isFinite(f.a), 'koi left the water');
      assert.equal(f.sp.length, N + TAIL);
      frames++; if (bend(f) > 0.9) hooked++;
    }
  });
  assert.ok(hooked / frames < 0.06, `koi curl too often: ${(100 * hooked / frames).toFixed(1)}% of frames`);
  console.log(`wander: bent past 0.9 rad in ${(100 * hooked / frames).toFixed(1)}% of koi-frames`);
}
// a pellet is raced to and taken; a ninth pellet pushes the oldest out
{
  const p = make(1440, 900); const { st } = p; run(p, 3);
  p.drop(400, 300); assert.equal(st.splash.at(-1).kind, 'pellet');
  let gulp = false; let top = 0;
  run(p, 12, () => { gulp ||= st.splash.some((s) => s.kind === 'gulp'); for (const f of st.fish) top = Math.max(top, f.v / (24 * st.S * f.z)); });
  assert.equal(st.pellets.length, 0, 'pellet never taken'); assert.ok(gulp, 'no gulp ripple');
  assert.ok(top > 2 && top < 6, `race speed ${top.toFixed(2)}x cruise`);
  for (let i = 0; i < 9; i++) p.drop(100 + i * 120, 450);
  assert.equal(st.pellets.length, 8);
  console.log(`feed: taken, top speed ${top.toFixed(2)}x cruise`);
}
// a slow pointer draws over the koi that pass within reach (they loiter a body's length off); a fast one startles those near it and skims the surface
{
  const p = make(1440, 900); const { st } = p; let ts = 0;
  const near = () => st.fish.filter((f) => Math.hypot(f.x - 900, f.y - 640) < 130 * st.K).length;
  run(p, 20, () => p.pointer(900, 640, ts += 16.7));
  const drawn = near(); assert.ok(drawn >= 2, `only ${drawn} koi came to a still pointer`);
  let skims = 0;
  for (let i = 0; i < 12; i++) { p.pointer(900 + i * 30, 640, ts += 16.7); p.step(1 / 60); skims += st.splash.filter((s) => s.kind === 'skim').length; st.splash.length = 0; }
  assert.ok(st.fish.some((f) => f.scare > 0), 'nobody startled'); assert.ok(skims >= 4, `skims ${skims}`);
  console.log(`pointer: ${drawn} koi drawn over, startled ${st.fish.filter((f) => f.scare > 0).length}, skims ${skims}`);
}
// a phone gets at most four koi and four pads; the still poses and settles without a loop
{
  const p = make(390, 844, { ...cfg, count: 8, pads: 7 }); const { st } = p;
  assert.equal(st.fish.length, 4); assert.equal(st.pads.length, 4);
  p.pose(); const d = p.drop(...p.seeded()); p.settle(d);
  assert.equal(st.pellets.length, 0); assert.equal(st.rips.length, 1);
}
console.log('pond: ok');
