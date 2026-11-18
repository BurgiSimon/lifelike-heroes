// Self-check of the rainy window's rules, no browser needed: node scripts/pane-check.mjs
// The pane is the same on every load. A drop let go on the misted side gathers before it runs, runs downward in
// fits and starts (never upward, never far sideways), leaves a track for the mist and beads behind it, and ends by
// stopping or leaving the frame. Left raining for five minutes the pane keeps to its number of drops, no drop
// grows past what glass can hold, and drops keep letting go.
import assert from 'node:assert/strict';
import { createPane, MAX } from '../src/mist/pane.js';

const cfg = { rain: 1, mist: 1 };
const make = (W = 1440, H = 900) => { const p = createPane(cfg); p.fit(W, H); return p; };
const sound = (st) => st.drops.every((d) => [d.x, d.y, d.r, d.tail, d.vy].every(Number.isFinite) && d.r > 0);

// the same pane twice
const a = make(); const b = make();
assert.ok(a.st.drops.length > 600, `the pane opens beaded (${a.st.drops.length} drops)`);
assert.deepEqual(a.st.drops.map((d) => [d.x, d.y, d.r]), b.st.drops.map((d) => [d.x, d.y, d.r]), 'the same pane on every load');
assert.ok(a.st.drops.every((d) => d.side === 0), 'the room side starts dry');
assert.equal(a.fit(1440, 900), false, 'the same box is not a new pane');

// the visitor's drop: it gathers, then runs
const st = a.st; const d = a.drip(700, 120);
assert.ok(d.side === 1 && !d.run && d.grow > d.r, 'a drop let go on the misted side starts small and gathers');
let t = 0; while (!d.run && t < 2) { a.step(1 / 60); t += 1 / 60; }
assert.ok(d.run && t > 0.1 && t < 1, `it lets go after a moment (${t.toFixed(2)} s)`);
assert.ok(st.events.some((e) => e.kind === 'run'), 'and says so, for the sound');
st.clears.length = 0;
let lowest = d.y; let pauses = 0; let slow = false; let track = 0; let back = 0; let beads = st.drops.filter((k) => k.side === 1).length;
for (t = 0; t < 40 && d.run && !d.gone; t += 1 / 60) {
  a.step(1 / 60);
  back = Math.max(back, lowest - d.y); lowest = Math.max(lowest, d.y);
  if (d.vy < 40 * st.S && !slow) { pauses++; slow = true; } else if (d.vy > 120 * st.S) slow = false;
  track += st.clears.filter((c) => c.by > c.ay).length; st.clears.length = 0; st.events.length = 0;
}
assert.ok(d.gone || !d.run, `its run ends (${t.toFixed(1)} s)`);
assert.ok(t > 1.5 && t < 30, `in a few seconds, not at once and not for ever (${t.toFixed(1)} s)`);
assert.ok(back < 0.01, 'it never runs upward');
assert.ok(lowest > 120 + 300 * st.S, `it gets somewhere (${(lowest - 120).toFixed(0)} px down)`);
assert.ok(Math.abs(d.x - 700) < 0.12 * (lowest - 120) + 20, `more down than sideways (${(d.x - 700).toFixed(0)} px aside)`);
assert.ok(pauses >= 1, 'it sticks and slips on the way');
assert.ok(track > 30, 'it leaves a track for the mist');
assert.ok(st.drops.filter((k) => k.side === 1).length > beads, 'and beads behind it');

// no loop: the whole run at once
const c = make(); const e = c.drip(400, 200); c.settle(e);
assert.ok((e.gone || !e.run) && e.tail === 0 && c.st.clears.length > 30, 'settle() runs a drop to its end and leaves its track');
assert.ok(c.st.clears.every((k) => [k.ax, k.ay, k.bx, k.by, k.r].every(Number.isFinite)), 'in numbers');

// five minutes of rain, on a desktop frame and on a phone
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const p = make(W, H); let slips = 0; let most = 0;
  for (let i = 0; i < 300 * 60; i++) {
    p.step(1 / 60); slips += p.st.events.filter((k) => k.kind === 'slip').length; p.st.events.length = 0; p.st.clears.length = 0;
    if (i % 600 === 0) most = Math.max(most, ...p.st.drops.map((k) => k.r / p.st.S));
  }
  assert.ok(sound(p.st), `${W}x${H}: every drop is a number`);
  assert.ok(p.st.drops.length <= MAX + 64 && p.st.drops.length > 80, `${W}x${H}: the pane keeps to its number of drops (${p.st.drops.length})`);
  assert.ok(most < 17, `${W}x${H}: no drop outgrows what glass can hold (${most.toFixed(1)} px)`);
  assert.ok(slips >= 4, `${W}x${H}: drops keep letting go (${slips} in five minutes)`);
  assert.ok(p.st.drops.every((k) => k.y - k.r < H + 60 * p.st.S), `${W}x${H}: what leaves the frame is let go of`);
}
console.log('pane-check: ok');
