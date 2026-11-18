// The pane's rules, in CSS px of the hero box (y down); sizes are written for a frame 900 px tall and scaled by S.
// Nothing here draws: the renderer reads st.drops and st.clears, and a Node script can step it.
//
// The glass has two wet sides. Rain beads on the far side (side 0): drops land, swallow the ones they touch, and
// once one is too heavy for the glass to hold it runs, in fits and starts, taking what lies in its way and leaving
// a string of small beads behind. The near side (side 1) is misted by the warm room; water gathers there only
// where something starts it (a click, the foot of a letter), and a drop that runs down that side clears its track
// through the mist. The mist itself is a field the renderer keeps; this file only says where it was wiped.

export const MAX = 2600;   // drops kept; past this the oldest small ones are let dry
const HOLD = 12;           // px: the radius at which a drop's weight beats the glass's grip (about 7 mm across)
const REST = 5.2;          // px: a runner that has shed down to this stays where it is
const FALL = 430;          // px/s: as fast as a heavy drop gets on glass (about 13 cm/s)
const GRIP = 0.14;         // s for a drop to pick its speed up, or lose it
const FIELD = 1150;        // drops per megapixel on the pane when the scene opens
const HEAVY = 0.022;       // share of landing drops that are heavy enough to run at once: one every four seconds or so
const RAIN = 9;            // drops landing per second per megapixel, at the rain option's 1
const WARM = 24;           // s of rain run through before the first frame, so there are tracks in the field already

// A stream of numbers from a seed: the pane is the same on every load, and so is what the rain does next.
const stream = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
// Smooth noise along a line: what makes a drop stick here and slip there, and wander on its way down.
const noise = (x) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };

export function createPane(options) {
  let cfg = options;
  const st = { W: 0, H: 0, S: 1, t: 0, drops: [], clears: [], events: [], feet: [] };   // feet: where the letters end, see setFeet
  let rand = stream(7); let due = 0; let own = 6; let made = 0;
  // A grid over the pane, rebuilt each step with nothing allocated: heads[cell] is the last drop filed there and
  // chain[i] the one filed before drop i. Drops that arrive during a step are not in it until the next.
  let cell = 24; let gw = 1; let gh = 1; let heads = new Int32Array(1); let chain = new Int32Array(MAX + 256); let filed = 0;
  const index = () => {
    gw = Math.ceil(st.W / cell) + 3; gh = Math.ceil(st.H / cell) + 3;
    if (heads.length !== gw * gh) heads = new Int32Array(gw * gh);
    heads.fill(-1); const n = st.drops.length; filed = n;
    if (chain.length < n) chain = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const d = st.drops[i];
      const c = Math.min(gw - 1, Math.max(0, Math.floor(d.x / cell) + 1)) + gw * Math.min(gh - 1, Math.max(0, Math.floor(d.y / cell) + 1));
      chain[i] = heads[c]; heads[c] = i;
    }
  };
  // every live drop within reach of (x, y), on one side of the glass
  const near = (x, y, reach, side, fn) => {
    const n = Math.ceil(reach / cell); const cx = Math.floor(x / cell) + 1; const cy = Math.floor(y / cell) + 1;
    for (let j = Math.max(0, cy - n); j <= Math.min(gh - 1, cy + n); j++) {
      for (let i = Math.max(0, cx - n); i <= Math.min(gw - 1, cx + n); i++) {
        for (let k = heads[i + gw * j]; k >= 0; k = chain[k]) { const d = st.drops[k]; if (k < filed && d.side === side && !d.gone) fn(d); }
      }
    }
  };
  const make = (x, y, r, side) => ({ x, y, r, side, born: st.t, seed: rand(), hold: HOLD * st.S * (0.82 + 0.4 * rand()), run: false, vy: 0, tail: 0, shed: 0, gap: 12 * st.S, px: x, py: y, grow: 0, gone: false });
  const cube = (a, b) => Math.cbrt(a * a * a + b * b * b);

  // A drop comes to the glass. If it lands on one that is there, the two are one drop from then on.
  const land = (x, y, r, side) => {
    let into = null;
    near(x, y, r + HOLD * 1.5 * st.S, side, (o) => { if (!into && Math.hypot(o.x - x, o.y - y) < o.r + r * 0.55) into = o; });
    if (!into) { const d = make(x, y, r, side); st.drops.push(d); return d; }
    const w = r * r * r / (into.r * into.r * into.r + r * r * r);
    into.x += (x - into.x) * w; into.y += (y - into.y) * w; into.r = cube(into.r, r);
    return into;
  };

  // One runner, one step. It speeds up with its weight, sticks and slips on the glass's own unevenness, swallows what
  // it touches, and pays for its track in beads. Returns false when it has left the frame.
  const advance = (d, dt) => {
    const { S } = st;
    if (d.grow > 0) {   // still gathering: mist from round about runs into it until it is heavy enough to let go
      d.r = Math.min(d.grow, d.r + 26 * S * dt);
      if (d.r >= d.grow) { d.grow = 0; d.run = true; st.events.push({ kind: 'run', x: d.x }); }
      if (d.side === 1) st.clears.push({ ax: d.x, ay: d.y, bx: d.x, by: d.y, r: d.r * 1.25, v: 0, k: 0 });
      return true;
    }
    d.px = d.x; d.py = d.y;
    const heavy = Math.min(1, Math.max(0, (d.r - REST * S) / (HOLD * 0.9 * S)));
    const stick = noise(d.seed * 91 + d.y / (64 * S));            // the glass is not evenly clean: here and there it holds a drop back
    const want = FALL * S * (0.3 + 0.7 * heavy) * (stick < 0.2 ? 0.07 : 0.5 + 0.5 * stick);
    d.vy += (want - d.vy) * (1 - Math.exp(-dt / GRIP));
    d.x += (noise(d.seed * 53 + d.y / (90 * S)) - 0.5) * 0.42 * d.vy * dt + (noise(d.seed * 17 + d.y / (15 * S)) - 0.5) * 0.12 * d.vy * dt;
    d.y += d.vy * dt;
    // the water it has not yet drawn up behind it: longer the faster it goes, gone when it stops
    // ponytail: the tail is drawn straight up from the drop; the proper version follows the path it came by
    d.tail += (Math.min(d.vy * 0.13, 7 * d.r) - d.tail) * (1 - Math.exp(-dt / 0.1));
    near(d.x, d.y, d.r + HOLD * 1.5 * S, d.side, (o) => {
      if (o === d || o.grow > 0 || Math.hypot(o.x - d.x, o.y - d.y) > d.r * 0.92 + o.r * 0.5) return;
      d.r = Math.min(HOLD * 1.3 * S, cube(d.r, o.r)); o.gone = true; d.vy *= 0.75;   // a swallowed drop checks it for a moment; what it cannot carry stays in its track
    });
    d.shed += d.vy * dt;
    if (d.shed > d.gap) {
      const b = S * (1.2 + 2.2 * rand() * rand());
      const bead = make(d.x + (rand() - 0.5) * 2 * S, d.y - d.r * 0.8 - d.tail * rand() * 0.5, b, d.side); st.drops.push(bead);
      d.r = Math.cbrt(Math.max(1, d.r * d.r * d.r - 4.5 * b * b * b)); d.shed = 0; d.gap = S * (7 + 26 * rand());
    }
    if (d.side === 1) {
      d.r = Math.min(HOLD * 1.3 * S, cube(d.r, 0.62 * S * Math.cbrt(d.vy * dt)));   // the mist it sweeps up feeds it
      st.clears.push({ ax: d.px, ay: d.py, bx: d.x, by: d.y, r: d.r * (0.5 + 0.34 * stick), v: 0, k: 0 });   // a track is narrower than its drop, and widest where the drop dragged
    }
    if (d.r < REST * S) { d.run = false; d.tail = 0; d.vy = 0; }
    if (d.y - d.r - d.tail > st.H + 20 * S) { d.gone = true; return false; }
    return true;
  };

  const sweep = () => {
    let n = 0; for (const d of st.drops) if (!d.gone) st.drops[n++] = d; st.drops.length = n;
    // too many: the oldest small beads have dried by now
    for (let i = 0; st.drops.length > MAX && i < st.drops.length; i++) { const d = st.drops[i]; if (!d.run && !d.grow && d.r < 3.2 * st.S) { st.drops.splice(i, 1); i--; } }
  };

  const step = (dt) => {
    const { W, H, S } = st; if (!W) return;
    st.t += dt; index();
    // rain: mostly spray, now and then a drop with some weight to it
    due += dt * RAIN * cfg.rain * W * H / 1e6;
    while (due >= 1) {
      due -= 1;
      const u = rand(); const big = rand() < HEAVY;   // most of it is spray; now and then a drop too heavy to stay where it lands
      const r = S * (big ? HOLD * (1.02 + 0.3 * rand()) : 1.6 + 6.4 * u ** 2.4);
      const d = land(rand() * W, rand() * H * (big ? 0.6 : 1.02) - 0.01 * H, r, 0);
      if (r > 4.5 * S) st.events.push({ kind: 'tick', x: d.x, r: r / S });
    }
    // the misted side lets a drop go of its own accord now and then, most often from the foot of a letter
    own -= dt * (0.4 + 0.6 * cfg.mist);
    if (own <= 0) {
      own = 6 + 10 * rand();
      const foot = st.feet.length && rand() < 0.45 ? st.feet[Math.floor(rand() * st.feet.length)] : null;
      if (foot) gather(foot.x, foot.y, 0.72); else gather((0.08 + 0.84 * rand()) * W, (0.05 + 0.5 * rand()) * H, 1);
    }
    for (const d of st.drops) {
      if (d.gone) continue;
      if (!d.run && !d.grow && d.r > d.hold) { d.run = true; st.events.push({ kind: 'slip', x: d.x }); }
      if (d.run || d.grow) advance(d, dt);
    }
    sweep();
  };

  // Water gathers at a point on the misted side and, once there is enough of it, runs.
  const gather = (x, y, size = 1) => {
    const d = make(x, y, 1.6 * st.S, 1); d.grow = (HOLD * 0.86 + 1.2 * rand()) * st.S * size; d.hold = 1e9;
    st.drops.push(d); return d;
  };

  // The pane as the scene opens: beaded all over, with a few tracks already run through it.
  const seed = () => {
    const { W, H, S } = st;
    rand = stream(7); due = 0; own = 6; st.t = 0; st.drops.length = 0; st.clears.length = 0; st.events.length = 0; cell = Math.max(8, 24 * S);
    index();
    const n = Math.min(MAX * 0.72, FIELD * W * H / 1e6);
    // (the grid is filed again every 48 landings: a drop may miss one that came just before it)
    for (let i = 0; i < n; i++) { if (i % 48 === 0) index(); const u = rand(); land(rand() * W, rand() * H, S * (1.9 + 8.4 * u ** 2.0), 0); }
    const keep = cfg; cfg = { ...cfg, rain: 1, mist: 0 }; own = 1e9;   // the warm-up is rain only: the room side starts dry
    for (let i = 0; i < WARM * 30; i++) step(1 / 30);
    cfg = keep; own = 4; st.clears.length = 0; st.events.length = 0;
  };

  return {
    st,
    fit(w, h) { if (w === st.W && h === st.H) return false; st.W = w; st.H = h; st.S = h / 900; seed(); return true; },
    setOptions(next) { cfg = next; },
    // Where the headline's letters end (CSS px): water wiped out of a letter collects at its foot.
    setFeet(feet) { st.feet = feet; },
    step,
    // The visitor's drop: it gathers where they clicked, on the misted side, and runs.
    drip(x, y, size) { made++; return gather(x, y, size); },
    // Water a wiping hand has pushed to the edge of its stroke: a smaller drop, which gathers and runs like any other.
    weep(x, y) { return gather(x, y, 0.62 + 0.2 * rand()); },
    // Where the button lets its drops go: a new place each time, the same places on every load.
    seeded() { const a = hash(made * 2 + 11.3); const b = hash(made * 2 + 12.7); return [(0.14 + 0.72 * a) * st.W, (0.1 + 0.3 * b) * st.H]; },
    // No loop: the drop's whole run at once. Its track is left in st.clears for the renderer to wipe.
    settle(d) {
      d.r = d.grow || d.r; d.grow = 0; d.run = true;
      index();   // nothing is taken out of the list while it runs, so one filing serves the whole run
      for (let i = 0; i < 900 && d.run && !d.gone; i++) advance(d, 1 / 30);
      d.tail = 0; sweep();
    },
  };
}
