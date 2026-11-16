// The pond's rules, in CSS px of the hero box: koi steering and spines, lily pads on springs, pellets, and the
// ring fronts that push the pads. Nothing here draws; the renderer reads the state and the splash queue.
import { clamp, rnd } from '../shared/kit.js';

export const N = 10;       // spine points
export const SEG = 5.4;    // their spacing, px at scale 1
export const TAIL = 4;     // extra trailing points that carry the tail fin
export const TSEG = 5.3;   // their spacing
export const WID = [0.72, 0.95, 1, 0.97, 0.88, 0.72, 0.56, 0.42, 0.32, 0.26]; // half-width profile, nose to tail
const CRUISE = 24;         // px/s at scale 1
const PELLETS = 8;         // most pellets in the water; the oldest goes first
export const WAVE = 80;    // px/s a click's rings travel
const STARTLE = 130;       // px around a fast pointer
// Koi: variety (index into the shader's table) and size.
export const KOI = [[0, 2], [2, 1.6], [3, 1.8], [1, 1.35], [4, 1.15], [5, 1], [6, 1.5], [7, 1.25]];
// Where each koi starts: x and y as shares of the water, and a heading in radians.
const START = [[0.2, 0.34, 0.5], [0.74, 0.26, 2.7], [0.82, 0.64, -2.3], [0.3, 0.76, -0.4], [0.5, 0.15, 0.1], [0.6, 0.86, 3.3], [0.1, 0.58, 1.2], [0.92, 0.42, -1.5]];
// Lily pads: home as shares of the water, radius in px at scale 1. They keep to the edges, clear of the headline.
const PADS = [[0.095, 0.2, 54], [0.185, 0.34, 30], [0.885, 0.15, 42], [0.9, 0.72, 58], [0.795, 0.87, 32], [0.06, 0.8, 38], [0.6, 0.05, 28]];
// Which pads carry a bloom: pad index, offset from the pad's middle (shares of its radius), size (share of radius).
export const BLOOMS = [[0, 0.62, -0.5, 0.5], [3, -0.7, 0.35, 0.46], [2, 0.3, 0.75, 0.42]];

export function createPond(options) {
  let cfg = options;
  const st = { W: 0, H: 0, S: 1, t: 0, fish: [], pads: [], pellets: [], rips: [], ptr: null, splash: [] };
  let fed = 0; let wake = 0;

  // A phone gets fewer, so the water stays open.
  const stock = () => {
    const small = st.W && st.W < 560;
    st.fish = KOI.slice(0, small ? Math.min(cfg.count, 4) : cfg.count).map(([kind, z], i) => ({
      kind, z, i, ph: i * 2.4, swim: i * 2.4, a: 0, v: 0, w: 0, scare: 0, x: 0, y: 0, sp: [], gulp: 0,
    }));
    st.pads = PADS.slice(0, small ? Math.min(cfg.pads, 4) : cfg.pads).map(([u, v, r], i) => ({ u, v, r, i, a0: rnd(i + 70) * 6.283, a: 0, ph: i * 1.9, spin: i % 2 ? 1 : -1, ox: 0, oy: 0, vx: 0, vy: 0, va: 0, tw: 0 }));
  };
  const place = () => {
    const { W, H, S } = st;
    st.fish.forEach((f, i) => {
      const [u, v, a] = START[i]; const s = S * f.z;
      f.x = u * W; f.y = v * H; f.a = a; f.v = 0; f.w = 0; f.scare = 0;
      f.sp = Array.from({ length: N + TAIL }, (_, k) => { const d = (Math.min(k, N - 1) * SEG + Math.max(0, k - N + 1) * TSEG) * s; return { x: f.x - Math.cos(a) * d, y: f.y - Math.sin(a) * d }; });
    });
    st.pads.forEach((p) => { p.ox = p.oy = p.vx = p.vy = p.va = p.tw = 0; p.a = p.a0; });
  };

  const step = (dt) => {
    st.t += dt;
    const { W, H, S, t, fish, pellets, ptr } = st;
    const life = cfg.ripple / WAVE; // a click's rings fade as they reach cfg.ripple px
    for (const f of fish) {
      const s = S * f.z; const m = 26 * s + 6;
      let sx = Math.cos(f.a); let sy = Math.sin(f.a); let arc = 26;
      let speed = (CRUISE + 6 * Math.sin(t * 0.3 + f.ph)) * cfg.speed;
      const dist = (p) => Math.hypot(p.x - f.x, p.y - f.y) || 1;
      const pull = (p, k) => { const d = dist(p); sx += ((p.x - f.x) / d) * k; sy += ((p.y - f.y) / d) * k; };
      const wob = Math.sin(t * 0.45 + f.ph) * 0.5 + Math.sin(t * 0.19 + f.ph * 1.7) * 0.4; // wander: a slow pull to one side, then the other
      sx -= Math.sin(f.a) * wob; sy += Math.cos(f.a) * wob;
      for (const o of fish) { // sidestep another koi: steer across the heading, away from its side (to the right when it is dead ahead)
        const d = dist(o); const room = 35 * S * (f.z + o.z);
        const k = (Math.cos(f.a) * (o.y - f.y) - Math.sin(f.a) * (o.x - f.x) > 0 ? -2.2 : 2.2) * (1 - d / room);
        if (o !== f && d < room) { sx -= Math.sin(f.a) * k; sy += Math.cos(f.a) * k; }
      }
      let food = null; let fd = Infinity;
      for (const p of pellets) { const d = dist(p); if (d < fd) { fd = d; food = p; } }
      // Banks: probe ahead, and once the probe leaves the safe box head for the water's middle line (along its
      // longer side). Pulling toward a fixed point keeps the turn direction stable, so a koi never runs into an edge.
      const px = f.x + Math.cos(f.a) * 40 * s; const py = f.y + Math.sin(f.a) * 40 * s;
      const out = Math.max(m - px, px - (W - m), m - py, py - (H - m), 0);
      if (out && !food) pull(W >= H ? { x: clamp(f.x, H / 2, W - H / 2), y: H / 2 } : { x: W / 2, y: clamp(f.y, W / 2, H - W / 2) }, 3 * Math.min(1, out / (16 * s)));
      if (Math.min(f.x, f.y, W - f.x, H - f.y) < m) arc = 14; // already at an edge (after a pellet there): turn tightly
      if (food) { pull(food, 2.6); speed *= 2.2 + Math.min(3.3, fd / 180); } // quicker from far away, so a pellet never waits long
      else if (ptr) {
        const d = dist(ptr);
        if (t < ptr.fast && d < STARTLE) f.scare = 0.7; // a fast pointer startles nearby koi for a moment
        if (f.scare > 0) { pull(ptr, -3); speed *= 2.4; }
        else if (d < cfg.reach) { pull(ptr, d > 48 * f.z ? 2 : d < 34 * f.z ? -1.2 : 0); speed *= d < 70 * f.z ? 0.6 : 1.2; arc = 20; } // curious: come over, then loiter
      }
      f.scare = Math.max(0, f.scare - dt);
      let da = Math.atan2(sy, sx) - f.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const near = food && fd < 45 * f.z; // close to food: turn on the spot and slow in the turn, so a pellet is never orbited
      const turn = (near ? 3.2 : Math.max(f.v, 10) / (arc * s)) * dt; // otherwise a fixed turning circle keeps the body in a gentle arc
      const d = clamp(da, -turn, turn);
      f.a += d;
      f.w += (d / Math.max(dt, 1e-4) - f.w) * Math.min(1, dt * 4); // smoothed turn rate: the fins and the body roll read it
      f.v += (speed * s * (near ? 1 - 0.6 * Math.min(1, Math.abs(da) / 1.5) : 1) - f.v) * Math.min(1, dt * 2.5);
      f.swim += dt * (4.2 + 1.8 * f.v / (CRUISE * s)); // tail beat: the original's 6 rad/s at a cruise, quicker in a sprint
      f.x = clamp(f.x + Math.cos(f.a) * f.v * dt, 6, W - 6); f.y = clamp(f.y + Math.sin(f.a) * f.v * dt, 6, H - 6);
      f.sp[0].x = f.x; f.sp[0].y = f.y;
      for (let k = 1; k < N + TAIL; k++) {
        const p = f.sp[k]; const q = f.sp[k - 1]; const dx = p.x - q.x; const dy = p.y - q.y; const l = Math.hypot(dx, dy) || 1; const seg = (k < N ? SEG : TSEG) * s;
        p.x = q.x + (dx / l) * seg; p.y = q.y + (dy / l) * seg;
      }
      f.gulp = Math.max(0, f.gulp - dt);
      if (food && fd < 8 * f.z) { // taken: a small gulp at the surface
        pellets.splice(pellets.indexOf(food), 1); f.gulp = 0.5;
        st.rips.push({ x: food.x, y: food.y, t, small: true }); st.splash.push({ x: food.x, y: food.y, kind: 'gulp' });
      }
    }
    // Pads: a slow bob around home on a soft spring; the front of a wide ring pushes them outward and turns them.
    for (const p of st.pads) {
      let ax = (Math.sin(t * 0.21 + p.ph) * 5 - p.ox) * 1.4; let ay = (Math.cos(t * 0.17 + p.ph * 1.3) * 4 - p.oy) * 1.4;
      for (const r of st.rips) {
        if (r.small) continue;
        const age = t - r.t; const dx = p.u * W + p.ox - r.x; const dy = p.v * H + p.oy - r.y; const d = Math.hypot(dx, dy) || 1;
        if (d > age * WAVE || d < age * WAVE - 60) continue;
        const k = 1 - age / life;
        ax += (dx / d) * 60 * k; ay += (dy / d) * 60 * k; p.va += p.spin * 0.9 * k * dt;
      }
      const drag = Math.exp(-1.6 * dt);
      p.vx = (p.vx + ax * dt) * drag; p.vy = (p.vy + ay * dt) * drag; p.ox += p.vx * dt; p.oy += p.vy * dt;
      p.va *= Math.exp(-0.9 * dt); p.tw += p.va * dt;
      p.a = p.a0 + p.tw + Math.sin(t * 0.13 + p.ph) * 0.1;
    }
    for (let i = st.rips.length - 1; i >= 0; i--) if (t - st.rips[i].t >= (st.rips[i].small ? 0.9 : life)) st.rips.splice(i, 1);
  };

  const drop = (x, y) => {
    const p = { x: clamp(x, 14, st.W - 14), y: clamp(y, 14, st.H - 14), t: st.t, seed: rnd(fed * 7 + st.pellets.length + Math.floor(st.t * 60)) };
    st.rips.push({ x: p.x, y: p.y, t: st.t });
    st.splash.push({ x: p.x, y: p.y, kind: 'pellet' });
    st.pellets.push(p); if (st.pellets.length > PELLETS) st.pellets.shift();
    return p;
  };

  return {
    st,
    setOptions(next) { cfg = next; },
    stock, place, step, drop,
    // The Feed button and the action: seeded spots in the open water around the headline.
    seeded() { const p = [(0.16 + 0.68 * rnd(fed * 2 + 20)) * st.W, (0.2 + 0.6 * rnd(fed * 2 + 21)) * st.H]; fed++; return p; },
    // No loop: step ahead into natural curved poses and hold them.
    pose() { place(); st.t = 0; st.pellets.length = 0; st.rips.length = 0; st.splash.length = 0; for (let i = 0; i < 150; i++) step(1 / 30); st.splash.length = 0; },
    // No loop: a feed is one change of state. Step ahead until the pellet is taken and leave its rings a second old.
    settle(p) { for (let i = 0; i < 240 && st.pellets.length; i++) step(1 / 30); st.rips.length = 0; st.rips.push({ x: p.x, y: p.y, t: st.t - 1 }); st.splash.length = 0; },
    // A fine pointer over the water: where it is and whether it is moving fast enough to startle.
    pointer(x, y, ts) {
      const { ptr, t } = st;
      const fast = ptr && Math.hypot(x - ptr.x, y - ptr.y) / Math.max(1, ts - ptr.ts) > 0.9;
      const p = { x, y, ts, fast: fast ? t + 0.2 : ptr ? ptr.fast : 0 };
      if (fast && t - wake > 0.14) { st.rips.push({ x, y, t, small: true }); st.splash.push({ x, y, kind: 'skim' }); wake = t; } // a fast pointer skims the surface
      st.ptr = p;
    },
    leave() { st.ptr = null; },
    fit(W, H) {
      const first = !st.W; const was = st.W && st.W < 560;
      st.W = W; st.H = H; st.S = clamp(Math.min(W, H * 1.5) / 1100, 0.72, 1.2);
      const restock = first || was !== (W < 560);
      if (restock) stock();
      return restock;
    },
  };
}
