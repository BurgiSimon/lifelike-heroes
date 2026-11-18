// The rain on the pane, as rules. Drops land where they will and sit; one that lands on another joins it. A drop
// that has grown too heavy for the glass lets go and runs: it speeds up, stalls and starts again, drifts a little to
// either side, swallows what it meets (and is pulled towards it), and pays for the way with the beads of its trail,
// until it is too small to run or has left the pane. What sits still dries slowly. No DOM and no WebGL in here:
// positions are CSS px with y down, and the renderer reads the drops from one flat buffer.
import { clamp } from '../shared/kit.js';

export const STRIDE = 6;            // x, y, radius, seed, stretch, strength (below zero: a stamp, see glsl.js)
export const CAPACITY = 4096;       // drops and stamps the buffer holds
const LAND = 30;                    // drops that land, per second and megapixel of pane, at rain 1
const RUN = 0.42;                   // and the heavy ones among them that run at once, likewise
const STOP = 4.4;                   // px: under this a running drop has nothing left to run with
const STEP = 1 / 60;

// A small seeded generator: the window opens on the same rain every time.
const mulberry = (seed) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function createRain() {
  const rand = mulberry(20261118);
  const st = { W: 0, H: 0, drops: [], buf: new Float32Array(CAPACITY * STRIDE), count: 0, time: 0, landed: [] };
  let due = 0; let heavy = 0; let acc = 0; let trace = null;

  const make = (x, y, r, bead = false) => ({ x, y, r, born: st.time, seed: rand(), run: false, vx: 0, vy: 0, wait: 0, sway: 0, lean: 0, gone: 0, gap: 0, stretch: 1, bead, hold: 9.5 + 3.5 * rand() });
  const release = (d, wait = 0) => { if (d.run) return; d.run = true; d.wait = wait; d.gap = d.r; d.gone = 0; d.bead = false; };
  // b joins a: one drop where there were two, with the water of both, where their weight lies
  const join = (a, x, y, r) => {
    const m = a.r ** 3; const n = r ** 3; const k = n / (m + n);
    a.x += (x - a.x) * k; a.y += (y - a.y) * k * (a.run ? 0.35 : 1); a.r = Math.cbrt(m + n);
    if (!a.run && a.r > a.hold) release(a, 0.1 + 0.5 * rand());
  };
  // A drop lands. On water it joins it; on dry glass it is a new drop.
  const land = (x, y, r) => {
    for (const d of st.drops) { const reach = d.r + r * 0.6; if ((d.x - x) ** 2 + (d.y - y) ** 2 < reach * reach) { join(d, x, y, r); return d; } }
    const d = make(x, y, r); st.drops.push(d); return d;
  };

  // only: one drop is run on by itself; nothing else moves, lands or dries meanwhile (see settle()).
  function step(dt, rain, only = null) {
    const { W, H, drops } = st; const area = (W * H) / 1e6;
    if (!only) st.time += dt;
    // the rain: mostly small drops, now and then one heavy enough to run. Those mostly come in over the top edge,
    // having started further up the pane.
    due += dt * LAND * rain * area;
    while (due >= 1) { due -= 1; const d = land(rand() * W, rand() * H, 1.9 + 8.2 * rand() ** 3.6); if (trace === null && st.landed.length < 8) st.landed.push(d.x / W); }
    heavy += dt * RUN * rain * Math.max(area, 0.35);
    while (heavy >= 1) {
      heavy -= 1;
      const top = rand() < 0.55;
      release(land(rand() * W, top ? -14 - 30 * rand() : rand() * H * 0.6, 9.6 + 3.6 * rand()), top ? 0 : 0.6 * rand());
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (only && d !== only) continue;
      if (!d.run) {
        d.r -= (dt * (d.bead ? 0.62 : 0.2)) / d.r;                 // drying: a bead of a trail is gone in seconds
        if (d.r < 1.15) drops.splice(i, 1);
        continue;
      }
      if (d.wait > 0) { d.wait -= dt; d.vy *= Math.exp(-dt * 16); } else {
        const top = 2.3 * d.r * d.r;                                // px a second it settles at: weight against the glass's hold
        d.vy += (top - d.vy) * Math.min(1, dt * 4.5);
        if (rand() < dt * (d.r < 7 ? 1.9 : d.r < 10 ? 0.7 : 0.22)) d.wait = 0.1 + 0.75 * rand();   // it catches, the lighter the likelier
      }
      d.sway -= dt; if (d.sway <= 0) { d.sway = 0.25 + 0.9 * rand(); d.lean = (rand() - 0.5) * (rand() < 0.25 ? 0.5 : 0.12); }   // mostly straight down, now and then a jog
      d.vx += (d.lean * d.vy - d.vx) * Math.min(1, dt * 7);
      const dx = d.vx * dt; const dy = d.vy * dt; const went = Math.hypot(dx, dy);
      d.x += dx; d.y += dy; d.gone += went;
      d.stretch += (1 + Math.min(1.25, d.vy / 300) - d.stretch) * Math.min(1, dt * 9);
      d.r -= went * 0.0042;                                         // the film it leaves
      if (d.gone > d.gap && d.vy > 30) {                            // and the beads: its trail breaks up as it is laid
        d.gone = 0; d.gap = d.r * (0.55 + 1.9 * rand() ** 1.6);
        const r = clamp(d.r * (0.13 + 0.2 * rand()), 1.3, 3.4);
        drops.push(make(d.x + (rand() - 0.5) * d.r * 0.45, d.y - d.r * (0.75 + 0.5 * d.stretch), r, true));
        d.r = Math.cbrt(Math.max(1, d.r ** 3 - r ** 3));
      }
      if (trace) trace.push(d.x, d.y, d.r, st.time);
      if (d.y - 3.5 * d.r > H) { drops.splice(i, 1); continue; }
      if (d.r < STOP) { d.run = false; d.vx = d.vy = 0; d.stretch = 1; d.hold = 99; }
    }
    // what a running drop meets, it takes
    for (const d of drops) {
      if (!d.run || (only && d !== only)) continue;
      for (let j = drops.length - 1; j >= 0; j--) {
        const e = drops[j]; if (e === d || e.r > d.r || (e.bead && e.y < d.y)) continue;   // not its own fresh trail
        const reach = d.r + e.r * 0.5;
        if (Math.abs(e.x - d.x) < reach && (e.x - d.x) ** 2 + (e.y - d.y) ** 2 < reach * reach) { join(d, e.x, e.y, e.r); e.r = 0; }
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].r === 0) drops.splice(i, 1);
    if (drops.length > CAPACITY - 64) drops.splice(0, drops.length - (CAPACITY - 64));   // a very large pane in a downpour: the oldest go
  }

  // The drops, flat, for the renderer.
  function write() {
    const b = st.buf; let n = 0;
    // a drop that has just landed is still spreading: a tenth of a second from a third of its size
    for (const d of st.drops) { b[n++] = d.x; b[n++] = d.y; b[n++] = d.r * clamp(0.35 + (st.time - d.born) * 7, 0.35, 1); b[n++] = d.seed; b[n++] = d.stretch; b[n++] = 1; }
    st.count = st.drops.length;
    return st.count;
  }

  return {
    st,
    fit(w, h) {
      // a pane that has changed its size keeps its rain: the drops move with it
      if (st.W && st.H) for (const d of st.drops) { d.x *= w / st.W; d.y *= h / st.H; }
      st.W = w; st.H = h;
    },
    // Advance by dt in fixed steps (a long frame catches up at most four).
    advance(dt, rain) { acc = Math.min(acc + dt, STEP * 4); while (acc >= STEP) { step(STEP, rain); acc -= STEP; } },
    write,
    // As if it had been raining for `seconds`: the pane the page opens on. Returns where the running drops went in
    // the last `keep` seconds, as stamps (x, y, radius, how fresh: 1 now, 0 then), for the fog to open with its trails.
    soak(seconds, rain, keep) {
      st.drops.length = 0; trace = [];
      const t0 = st.time;
      for (let t = 0; t < seconds; t += 1 / 30) { if (st.time - t0 < seconds - keep) trace.length = 0; step(1 / 30, rain); }
      const stamps = new Float32Array(Math.min(CAPACITY, trace.length / 4) * STRIDE); const from = trace.length / 4 - stamps.length / STRIDE;
      for (let i = 0; i < stamps.length / STRIDE; i++) {
        const k = (from + i) * 4; const fresh = 1 - (st.time - trace[k + 3]) / keep;
        stamps.set([trace[k], trace[k + 1], trace[k + 2], 0, 1, -clamp(fresh, 0.02, 1)], i * STRIDE);
      }
      trace = null;
      return stamps;
    },
    // A drop set running from (x, y): the click. It lands with a little spray about it.
    send(x, y) {
      const d = land(clamp(x, 8, st.W - 8), clamp(y, -20, st.H - 8), 10.4 + 2.2 * rand());
      d.r = Math.max(d.r, 10.4); release(d); d.wait = 0; d.vy = 60;
      for (let i = 0; i < 5; i++) { const a = rand() * 6.283; const far = d.r * (1.5 + 1.6 * rand()); st.drops.push(make(d.x + Math.cos(a) * far, d.y + Math.sin(a) * far * 0.8, 1.3 + 1.4 * rand(), true)); }
      return d;
    },
    // No loop (reduced motion): the drop is run to its end at once, and the stamps of its way are returned.
    settle(d) {
      trace = [];
      for (let i = 0; i < 1500 && d.run && st.drops.includes(d); i++) step(1 / 60, 0, d);
      const stamps = new Float32Array(Math.min(CAPACITY, trace.length / 4) * STRIDE);
      for (let i = 0; i < stamps.length / STRIDE; i++) stamps.set([trace[i * 4], trace[i * 4 + 1], trace[i * 4 + 2], 0, 1, -1], i * STRIDE);
      trace = null;
      return stamps;
    },
    // What a hand pushes aside as it wipes: a small drop left at (x, y), at the edge of its stroke.
    spill(x, y) { if (x > 0 && x < st.W && y > 0 && y < st.H) land(x, y, 1.4 + 1.9 * rand() ** 2); },
    // where the cue's own drop starts: somewhere in the upper middle, a different place each time
    spot() { return [st.W * (0.3 + 0.5 * rand()), st.H * (0.1 + 0.25 * rand())]; },
  };
}
