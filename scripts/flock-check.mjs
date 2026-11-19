// Self-check of the roost's rules, no browser needed: node scripts/flock-check.mjs
// The flock is the same on every load. Each bird minds its seven nearest neighbours; together they fly as one
// body, keep their distance from each other, and stay in the sky over the sign for minutes on end, near or far. A
// fright crosses the flock faster than its birds fly. A clap empties the sign, and its birds come back, a few at
// first and nearly all within a minute and a half. A falcon that is led into the flock opens a hole in it, and
// leaves when it is no longer led; left alone long enough, one comes through by itself.
import assert from 'node:assert/strict';
import { createFlock, SEVEN, MAXI } from '../src/roost/flock.js';

const TITLE = { l: 290, t: 615, r: 1150, b: 746, em: 131 };   // the headline as a 1440 × 900 page lays it out
const SLOTS = Array.from({ length: 130 }, (_, i) => ({ x: 250 + i * 7.2, y: 640 - (i % 9) * 3 }));
const make = (W = 1440, H = 900, title = TITLE, birds = 3000) => { const f = createFlock({ birds, reach: 180 }); f.fit(W, H, title); f.setPerches(SLOTS); return f; };
const run = (f, s, ptr = null) => { for (let i = 0; i < s * 60; i++) f.step(1 / 60, typeof ptr === 'function' ? ptr() : ptr); };
const look = (f, W = 1440, H = 900) => {
  const b = f.birds(); const n = b.n; let ax = 0; let ay = 0; let az = 0; let inside = 0; let close = 0; let nn = 0; let slow = 1e9; let fast = 0; let rolling = 0; let bad = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.hypot(b.vx[i], b.vy[i], b.vz[i]); ax += b.vx[i] / s; ay += b.vy[i] / s; az += b.vz[i] / s; slow = Math.min(slow, s); fast = Math.max(fast, s);
    if (!Number.isFinite(b.px[i] + b.py[i] + b.pz[i] + s)) bad++;
    const p = f.toScreen(b.px[i], b.py[i], b.pz[i]); if (p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) inside++;
    const j = b.near[i * SEVEN]; const d = Math.hypot(b.px[j] - b.px[i], b.py[j] - b.py[i], b.pz[j] - b.pz[i]); nn += d; if (d < 0.15) close++;
    if (b.roll[i] > 0) rolling++;
  }
  return { together: Math.hypot(ax, ay, az) / n, inside: inside / n, close: close / n, nn: nn / n, slow, fast, rolling: rolling / n, bad };
};

// the same flock twice
const a = make(); const b = make(); const A = a.birds(); const B = b.birds();
assert.equal(A.n, 3000, 'the flock is as many birds as asked for');
assert.deepEqual([...A.px.slice(0, 300)], [...B.px.slice(0, 300)], 'the same flock on every load');
assert.deepEqual(a.st.roost.map((r) => [r.slot, r.state]), b.st.roost.map((r) => [r.slot, r.state]), 'and the same birds on the sign');
assert.ok(a.st.perched > 60 && a.st.perched < a.st.roost.length, `the sign opens with most of its birds on it (${a.st.perched} of ${a.st.roost.length})`);
assert.ok(a.st.count <= MAXI && a.st.count === A.n + a.st.roost.length - a.st.perched, 'every bird is either in the air or on the sign');
{ let whole = 0; for (let i = 0; i < A.n; i++) { const set = new Set(A.near.slice(i * SEVEN, i * SEVEN + SEVEN)); if (set.size === SEVEN && !set.has(-1) && !set.has(i)) whole++; }
  assert.ok(whole >= A.n * 0.998, `every bird minds seven others (${whole} of ${A.n})`); }
assert.equal(a.fit(1440, 900, TITLE), false, 'the same box is not a new one');
const first = look(a);
assert.ok(first.inside > 0.98 && first.bad === 0, 'the scene opens with the whole flock in the frame');

// three minutes left alone: one body, in the frame, at a starling's speed, each bird with room
let together = 0; let least = 1; let tight = 0; let nearest = 0; let slowest = 1e9; let fastest = 0; let ticks = 0; let hunted = 0; let nearZ = 1e9; let farZ = 0;
for (let s = 0; s < 180; s++) {
  run(a, 1); const k = look(a); ticks++;
  together += k.together; least = Math.min(least, k.inside); tight = Math.max(tight, k.close); nearest += k.nn; slowest = Math.min(slowest, k.slow); fastest = Math.max(fastest, k.fast);
  assert.equal(k.bad, 0, 'the flock stays where numbers are');
  if (a.st.falcon.on) hunted++;
  nearZ = Math.min(nearZ, a.st.mid[2]); farZ = Math.max(farZ, a.st.mid[2]);
}
assert.ok(together / ticks > 0.72, `it flies as one body (its birds agree on a heading ${(together / ticks).toFixed(2)} of the way, on average)`);
assert.ok(least > 0.8, `it keeps to the sky over the sign (never less than ${(least * 100).toFixed(0)}% of it in the frame)`);
assert.ok(nearest / ticks > 0.5 && nearest / ticks < 1.6 && tight < 0.03, `each bird keeps its room (${(nearest / ticks).toFixed(2)} m to its nearest neighbour on average; at worst ${(tight * 100).toFixed(1)}% of them crowded)`);
assert.ok(slowest >= 6.4 && fastest <= 16.6, `at a starling's speed (${slowest.toFixed(1)} to ${fastest.toFixed(1)} m/s)`);
assert.ok(farZ - nearZ > 18, `it comes nearer and goes further off as it wheels (${nearZ.toFixed(0)} to ${farZ.toFixed(0)} m)`);
assert.ok(hunted > 2, `a falcon comes through by itself (in the frame for ${hunted} s of the three minutes)`);
const kinds = a.st.events.reduce((m, e) => { m[e.kind] = (m[e.kind] || 0) + 1; return m; }, {});
assert.ok(kinds.lift > 3 && kinds.land > 3, `birds leave the sign and come back by themselves (${kinds.lift} went, ${kinds.land} came)`);
a.st.events.length = 0;

// a fright runs through the flock as a wave: faster than its birds fly, slow enough to be watched
{
  const speeds = []; let flying = 0;
  for (const warm of [4, 12, 24]) {
    const f = make(); f.setPerches([]); run(f, warm); const q = f.birds(); const n = q.n;
    // the bird nearest the middle of the flock takes fright, and its seven with it; every other bird is timed
    let c = 0; let best = 1e9; let fly = 0;
    for (let i = 0; i < n; i++) { const d = Math.hypot(q.px[i] - f.st.cen[0], q.py[i] - f.st.cen[1], q.pz[i] - f.st.cen[2]); if (d < best) { best = d; c = i; } fly += Math.hypot(q.vx[i], q.vy[i], q.vz[i]) / n; }
    f.fright(c); for (let k = 0; k < SEVEN; k++) f.fright(q.near[c * SEVEN + k]);
    const pace = []; const seen = new Uint8Array(n); let took = 0;
    for (let t = 1 / 60; t < 2.5; t += 1 / 60) {
      f.step(1 / 60, null);
      for (let i = 0; i < n; i++) if (q.roll[i] > 0 && !seen[i]) { seen[i] = 1; took++; const d = Math.hypot(q.px[i] - q.px[c], q.py[i] - q.py[c], q.pz[i] - q.pz[c]); if (d > 5) pace.push(d / t); }
    }
    pace.sort((x, y) => x - y); const mid = pace[pace.length >> 1];
    assert.ok(took > 0.85 * n, `a fright in the middle of the flock reaches nearly every bird (${took} of ${n})`);
    assert.ok(mid > fly * 1.3, `it runs outward at ${mid.toFixed(0)} m/s, faster than the birds fly (${fly.toFixed(0)} m/s)`);
    speeds.push(mid); flying += fly / 3;
  }
  const mean = speeds.reduce((x, y) => x + y, 0) / speeds.length;
  assert.ok(mean > 15 && mean < 40, `and at a pace the eye can follow: ${mean.toFixed(0)} m/s`);
  console.log(`  a fright crosses the flock at ${mean.toFixed(0)} m/s (${speeds.map((v) => v.toFixed(0)).join(', ')}); its birds fly at ${flying.toFixed(0)} m/s`);
}

// a clap: the sign empties, and fills again
{
  const f = make(); run(f, 2); const before = f.st.perched;
  const up = f.clap(700, 640, false);
  assert.equal(up, before, 'a clap puts up every bird on the sign');
  run(f, 1.2); assert.equal(f.st.perched, 0, 'within a second or so the sign is bare');
  assert.ok(f.st.events.some((e) => e.kind === 'clap') && f.st.events.some((e) => e.kind === 'lift'), 'and the clap and the wings are heard');
  let firstBack = 0; let t = 1.2; while (t < 40 && !f.st.perched) { f.step(1 / 60, null); t += 1 / 60; } firstBack = t;
  assert.ok(firstBack > 3 && firstBack < 20, `the first bird is back after ${firstBack.toFixed(0)} s`);
  run(f, 90 - t);
  assert.ok(f.st.perched > 0.8 * before, `a minute and a half on, most are back (${f.st.perched} of ${before})`);
  const q = make(); const gone = q.clap(700, 640, true);
  assert.ok(gone > 60 && q.st.perched === 0 && q.st.count === q.birds().n + q.st.roost.length, 'with nothing moving, a clap simply shows the sign bare and its birds with the flock');
}

// the falcon: led into the flock, it opens it; no longer led, it goes
{
  const f = make(); run(f, 3); const q = f.birds();
  const around = (m, r) => { let n = 0; for (let i = 0; i < q.n; i++) if (Math.hypot(q.px[i] - m[0], q.py[i] - m[1], q.pz[i] - m[2]) < r) n++; return n; };
  const packed = around(f.st.cen, 4);   // how many birds the middle of the flock holds within four metres, undisturbed
  const lead = () => { const m = f.toScreen(...f.st.cen); return { x: m[0], y: m[1], vx: 0, vy: 0 }; };
  run(f, 0.1, lead); assert.ok(f.st.falcon.on && f.st.falcon.mode === 'hunt', 'a pointer on the scene brings a falcon');
  let rolled = 0; let closest = 1e9; let hole = 0; let holes = 0;
  for (let i = 0; i < 60 * 8; i++) {
    f.step(1 / 60, lead()); const m = f.st.falcon; const d = Math.hypot(m.x - f.st.cen[0], m.y - f.st.cen[1], m.z - f.st.cen[2]);
    closest = Math.min(closest, d); if (i % 10 === 0) { rolled = Math.max(rolled, look(f).rolling); if (d < 8) { hole += around([m.x, m.y, m.z], 4); holes++; } }
  }
  assert.ok(closest < 12, `it reaches the middle of the flock (${closest.toFixed(0)} m from it)`);
  assert.ok(rolled > 0.15, `and the flock rolls away from it (${(rolled * 100).toFixed(0)}% of its birds at once)`);
  assert.ok(holes > 3 && hole / holes < 0.5 * packed, `it opens a hole where it flies (${(hole / holes).toFixed(0)} birds within four metres of it, where the flock's middle held ${packed})`);
  assert.ok(look(f).inside > 0.7, 'the flock is harried, not driven out of the picture');
  let t = 0; while (f.st.falcon.on && t < 30) { f.step(1 / 60, null); t += 1 / 60; }
  assert.ok(!f.st.falcon.on, `when the pointer goes, the falcon goes (${t.toFixed(0)} s)`);
}

// a phone: a narrower sky, a smaller flock, still in the picture
{
  const f = make(390, 844, { l: 20, t: 660, r: 370, b: 705, em: 45 }, 1400); let least2 = 1;
  for (let s = 0; s < 90; s++) { run(f, 1); least2 = Math.min(least2, look(f, 390, 844).inside); }
  assert.ok(least2 > 0.55, `on a phone the flock keeps mostly to its narrow sky (never less than ${(least2 * 100).toFixed(0)}% in the frame)`);
}

console.log(`flock-check: all good (one body ${(together / ticks).toFixed(2)}, ${(least * 100).toFixed(0)}% in frame at worst, ${(nearest / ticks).toFixed(2)} m between neighbours, ${nearZ.toFixed(0)} to ${farZ.toFixed(0)} m off)`);
