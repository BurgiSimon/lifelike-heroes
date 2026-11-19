// Self-check of the window light's rules, no browser needed: node scripts/room-check.mjs
// The room is the same on every load. The curtain's cloth keeps its length, stays this side of the glass, swings
// out in a gust and comes back. The boughs sway and do not run away. A crystal hung in the shade is moved into the
// light, spins, and settles; the window keeps to its number of crystals. Every spectrum lands with its red end
// nearer to where the light would have gone straight on than its violet end, because violet is bent more. And the
// pointer's breeze dies away once the pointer has gone.
import assert from 'node:assert/strict';
import { createRoom, TREE, NX, NY, DISC, SUN } from '../src/light/room.js';

const cfg = { breeze: 1, reach: 180, crystals: 6 };
const TITLE = { l: 482, t: 407, r: 872, b: 607, em: 104 };   // the headline as a 1440 × 900 page lays it out
const make = (W = 1440, H = 900, title = TITLE) => { const r = createRoom({ ...cfg }); if (r.fit(W, H, title)) r.pose(21); return r; };
const run = (r, s, ptr = null) => { for (let i = 0; i < s * 60; i++) r.step(1 / 60, ptr); };
const hem = (r) => { const p = r.st.cloth.p; let z = 0; for (let i = 0; i < NX; i++) z = Math.max(z, p[((NY - 1) * NX + i) * 3 + 2]); return z; };   // how far into the room the hem has swung, m

// the same room twice
const a = make(); const b = make(); const { g, st } = a;
assert.deepEqual([...a.st.cloth.p], [...b.st.cloth.p], 'the same curtain on every load');
assert.deepEqual(a.st.crystals.map((c) => [c.u, c.v, c.home]), b.st.crystals.map((c) => [c.u, c.v, c.home]), 'and the same crystals');
assert.ok(TREE.leaves.length > 600 && TREE.wood.length > 200, `the tree is in leaf (${TREE.leaves.length} leaves)`);
assert.equal(a.fit(1440, 900, TITLE), false, 'the same box is not a new room');

// the layout: the lettering's shadow lies in the glass's patch of sun, clear of the bars
const o = g.open;
assert.ok(o.l < TITLE.l && o.r > TITLE.r && o.t < TITLE.t && o.b > TITLE.b, 'the headline lies inside the patch of sun');
assert.ok(g.bars.every((k) => k.b <= TITLE.t || k.t >= TITLE.b), 'no glazing bar crosses the lettering');
assert.ok(g.pen > 8 && g.pen < 0.2 * TITLE.em, `the letters' edge is soft, and narrower than their strokes (${g.pen.toFixed(1)} px)`);
assert.ok(Math.abs(g.pen / DISC * SUN[2] - g.Dz) < 1e-6 && g.Dz / g.ppm > 1.5 && g.Dz / g.ppm < 4, `the window is a room's depth away (${(g.Dz / g.ppm).toFixed(2)} m)`);
const phone = make(390, 844, { l: 105, t: 420, r: 300, b: 526, em: 54.4 });
assert.ok(phone.g.pen > 4 && phone.g.open.t > 0 && phone.g.open.r > 300, 'a phone has its patch of sun too');

// the curtain
const sound = () => [...st.cloth.p].every(Number.isFinite);
const stretched = () => { const p = st.cloth.p; let most = 0; for (let i = 0; i < NX; i++) { let len = 0; for (let j = 1; j < NY; j++) { const k = (j * NX + i) * 3; const u = k - NX * 3; len += Math.hypot(p[k] - p[u], p[k + 1] - p[u + 1], p[k + 2] - p[u + 2]); } most = Math.max(most, len / st.cloth.h); } return most; };
const pins = [...st.cloth.p.slice(0, NX * 3)];
run(a, 20);
assert.ok(sound(), 'the cloth stays where numbers are');
assert.deepEqual([...st.cloth.p.slice(0, NX * 3)], pins, 'its top row stays sewn to the rod');
assert.ok(stretched() < 1.05, `its threads keep their length (${stretched().toFixed(3)} of it)`);
assert.ok([...st.cloth.p].every((v, i) => i % 3 !== 2 || v >= -0.0351), 'and it stays this side of the glass');
const calm = hem(a); a.gust(); let far = 0; for (let i = 0; i < 180; i++) { a.step(1 / 60, null); far = Math.max(far, hem(a)); }
assert.ok(far > calm + 0.12 && far < 1.3, `a gust swings the hem out (${calm.toFixed(2)} m to ${far.toFixed(2)} m)`);
run(a, 14);
assert.ok(hem(a) < far - 0.08 && sound(), `and it comes back (${hem(a).toFixed(2)} m)`);
assert.ok(st.cloth.nrm.every(Number.isFinite) && Math.abs(Math.hypot(st.cloth.nrm[300], st.cloth.nrm[301], st.cloth.nrm[302]) - 1) < 1e-3, 'every point of it knows which way it faces');

// the boughs
let swing = 0; for (let i = 0; i < 1800; i++) { a.step(1 / 60, null); for (const v of st.bough) swing = Math.max(swing, Math.abs(v)); }
assert.ok(swing > 0.01 && swing < 0.3, `the boughs sway, a hand's width at most (${(swing * 100).toFixed(1)} cm)`);

// a crystal: hung in the shade, it is moved into the light; it spins and settles
const c = a.hang(1300, 40); const s0 = a.shadowOf(c);
assert.ok(s0.x > o.l && s0.x < o.r && s0.y > o.t && s0.y < Math.min(o.b, g.floorY), 'a crystal hung in the shade is moved into the glass');
assert.ok(Math.abs(c.om) > 1 && c.k === 0, 'it is let go spinning, and fades in');
assert.ok(st.events.some((e) => e.kind === 'hang'), 'and says so, for the sound');
let fastest = 0; for (let i = 0; i < 600; i++) { a.step(1 / 60, null); fastest = Math.max(fastest, Math.abs(c.om)); }
assert.ok(fastest < 2.6, `its spin never outruns the eye (${fastest.toFixed(2)} rad/s)`);
run(a, 60);
assert.ok(Math.abs(c.om) < 0.7 && c.k > 0.99 && Number.isFinite(c.th), `a minute on it only drifts (${c.om.toFixed(2)} rad/s)`);
assert.ok(Math.abs(c.sx) < 0.06 && Math.abs(c.sz) < 0.06, 'and hangs near plumb');
// cut glass is heavy: neither a gust nor the pointer's breeze swings it far
a.gust(); let swung = 0;
for (let i = 0; i < 360; i++) { a.step(1 / 60, i < 120 ? { x: a.shadowOf(c).x - 60 + i, y: a.shadowOf(c).y, vx: 900, vy: 0 } : null); for (const k of st.crystals) swung = Math.max(swung, Math.hypot(k.sx, k.sz)); }
assert.ok(swung > 0.004 && swung < 0.09, `a gust and a passing hand swing the crystals a little, not far (${(swung * 100).toFixed(1)} cm)`);

// the spectra
assert.ok(st.nBeams > 4, `the crystals throw spectra (${st.nBeams})`);
let inFrame = 0; let ordered = 0; let onWall = 0;
for (let i = 0; i < st.nBeams; i++) {
  const B = st.beams.subarray(i * 8, i * 8 + 8);
  assert.ok([...B].every(Number.isFinite) && B[4] > 0 && B[5] >= 0, 'every spectrum has a place, a width and its light');
  if ((B[0] + B[2]) / 2 > 0 && (B[0] + B[2]) / 2 < g.W && (B[1] + B[3]) / 2 > 0 && (B[1] + B[3]) / 2 < g.H) inFrame++;
}
assert.ok(inFrame > 2, `some of them inside the frame (${inFrame})`);
// one crystal alone, so each spectrum can be measured from its own crystal's shadow
const solo = createRoom({ ...cfg, crystals: 1 }); solo.fit(1440, 900, TITLE); solo.pose(21);
for (let turn = 0; turn < 24; turn++) {
  const k = solo.st.crystals[0]; k.th = turn / 24 * Math.PI * 2; solo.step(0, null); const s = solo.shadowOf(k);
  for (let i = 0; i < solo.st.nBeams; i++) {
    const B = solo.st.beams.subarray(i * 8, i * 8 + 8);
    if (B[1] > solo.g.floorY || B[3] > solo.g.floorY) continue;   // on the floor the lens's perspective comes into it
    onWall++; if (Math.hypot(B[2] - s.x, B[3] - s.y) > Math.hypot(B[0] - s.x, B[1] - s.y)) ordered++;
  }
}
assert.ok(onWall > 40 && ordered === onWall, `violet lands further from the crystal's shadow than red, every time (${ordered} of ${onWall})`);

// the window keeps to its number
for (let i = 0; i < 9; i++) { a.hang(...a.seeded()); run(a, 1.5); }
assert.equal(a.count(), cfg.crystals, 'the window keeps to its number of crystals');
assert.ok(st.crystals.length <= cfg.crystals + 1, 'and the ones taken down are let go of');
const spots = [a.seeded(), a.seeded(), a.seeded()];
assert.ok(spots.every(([x, y]) => (x < g.clear.l || x > g.clear.r || y < g.clear.t || y > g.clear.b) && x > o.l && x < o.r), "the button's crystals hang clear of the lettering");

// the pointer's breeze
const stir = () => { let m = 0; for (let i = 2; i < st.field.length; i += 4) m = Math.max(m, st.field[i]); return m; };
for (let i = 0; i < 40; i++) a.step(1 / 60, { x: 500 + i * 8, y: 200, vx: 480, vy: 0 });
assert.ok(stir() > 0.5, `a passing pointer stirs the air (${stir().toFixed(2)})`);
let live = true; let t = 0; while (live && t < 20) { live = a.step(1 / 60, null); t += 1 / 60; }
assert.ok(!live && t > 0.8 && t < 14, `and the air settles once it has gone (${t.toFixed(1)} s)`);

console.log(`room-check: all good (${TREE.leaves.length} leaves, ${st.nBeams} spectra from ${a.count()} crystals, hem out to ${far.toFixed(2)} m in a gust, a hung crystal spins at ${fastest.toFixed(1)} rad/s at most)`);
