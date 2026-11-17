// The pond's rules, in CSS px of the hero box: koi steering and spines, lily pads on springs, pellets, and the
// ring fronts that push the pads. Nothing here draws; the renderer reads the state and the splash queue.
import { clamp, rnd } from '../shared/kit.js';

export const N = 10;       // spine points
export const SEG = 5.4;    // their spacing, px at scale 1
export const TAIL = 4;     // extra trailing points that carry the tail fin
export const TSEG = 4.1;   // their spacing
export const WID = [0.86, 0.97, 1, 0.98, 0.9, 0.77, 0.6, 0.44, 0.31, 0.22]; // half-width profile, gill cover to peduncle
const CRUISE = 24;         // px/s at scale 1
const PELLETS = 8;         // most pellets in the water; the oldest goes first
const FALL = 0.32;         // s a pellet is in the air before it comes down
export const WAVE = 80;    // px/s a click's rings travel
const STARTLE = 130;       // px around a fast pointer, for a koi as the original drew it
// The original's koi were the size of its lily pads. Real ones are two or three pads long, so these are drawn
// that much larger, and every distance a rule measures from a koi grows with them (st.K).
const BIG = 1.8; const BIG_PHONE = 1.3;
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
  const st = { W: 0, H: 0, S: 1, K: BIG, t: 0, fish: [], pads: [], pellets: [], rips: [], ptr: null, splash: [] };
  let fed = 0; let wake = 0; let skim = 0;

  // A phone gets fewer, so the water stays open.
  const stock = () => {
    const small = st.W && st.W < 560;
    st.K = small ? BIG_PHONE : BIG;
    st.fish = KOI.slice(0, small ? Math.min(cfg.count, 4) : cfg.count).map(([kind, z], i) => ({
      kind, z: z * st.K, i, ph: i * 2.4, swim: i * 2.4, a: 0, v: 0, w: 0, scare: 0, x: 0, y: 0, sp: [], gulp: 0, dive: 0.5,
    }));
    st.pads = PADS.slice(0, small ? Math.min(cfg.pads, 4) : cfg.pads).map(([u, v, r], i) => ({ u, v, r, i, a0: rnd(i + 70) * 6.283, a: 0, ph: i * 1.9, spin: i % 2 ? 1 : -1, ox: 0, oy: 0, vx: 0, vy: 0, va: 0, tw: 0 }));
  };
  const place = () => {
    const { W, H, S } = st;
    st.fish.forEach((f, i) => {
      const [u, v, a] = START[i]; const s = S * f.z;
      f.x = u * W; f.y = v * H; f.a = a; f.v = 0; f.w = 0; f.scare = 0; f.dive = 0.5;
      f.sp = Array.from({ length: N + TAIL }, (_, k) => { const d = (Math.min(k, N - 1) * SEG + Math.max(0, k - N + 1) * TSEG) * s; return { x: f.x - Math.cos(a) * d, y: f.y - Math.sin(a) * d }; });
    });
    st.pads.forEach((p) => { p.ox = p.oy = p.vx = p.vy = p.va = p.tw = 0; p.a = p.a0; });
  };

  // The body is 1.6 times the original's drawn length, so its turning circles are too: 42 where the original
  // had 26. A koi that is only wandering takes a far wider one, and keeps the tight circle for food and frights.
  // Koi this large have less room in the same water: they may come closer to its edge than the original's
  // (a head may even leave the frame for a moment), and they turn back from it on a wider circle.
  const dist = (f, p) => Math.hypot(p.x - f.x, p.y - f.y) || 1;
  const mid = { x: 0, y: 0 };
  // A pellet has come down, or has rolled to a rim. In open water it splashes, and from then the koi may have it.
  // On a lily pad it lies dry: the pad gives a little and the pellet rolls off the nearest rim (toward the middle of
  // the pond where that rim is out of the frame), and comes down again there.
  const land = (p) => {
    const { W, H, S, t } = st;
    const pad = st.pads.find((q) => Math.hypot(p.x - q.u * W - q.ox, p.y - q.v * H - q.oy) < q.r * S);
    if (!pad) { p.wet = true; p.t = t; st.rips.push({ x: p.x, y: p.y, t }); st.splash.push({ x: p.x, y: p.y, kind: 'pellet' }); return; }
    const cx = pad.u * W + pad.ox; const cy = pad.v * H + pad.oy; const out = (pad.r + 7) * S;
    const x0 = p.x - cx; const y0 = p.y - cy;
    let dx = x0; let dy = y0;
    if (Math.hypot(dx, dy) < 1) { dx = Math.cos(p.seed * 6.283); dy = Math.sin(p.seed * 6.283); }   // dead centre: any way is down
    const off = () => { const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; return Math.min(cx + dx * out, cy + dy * out, W - cx - dx * out, H - cy - dy * out) < 14; };
    if (off()) { dx = W / 2 - cx; dy = H / 2 - cy; off(); }
    const x1 = dx * out; const y1 = dy * out;
    p.roll = { pad, x0, y0, x1, y1, t0: t, T: 0.3 + 0.5 * Math.hypot(x1 - x0, y1 - y0) / out };
    pad.vx -= dx * 9; pad.vy -= dy * 9; pad.va += pad.spin * 0.12;
  };
  const step = (dt) => {
    st.t += dt;
    const { W, H, S, K, t, fish, pellets, ptr } = st;
    const life = cfg.ripple / WAVE; // a click's rings fade as they reach cfg.ripple px
    // Pellets on their way: falling (h, 1 to 0, as things fall: slowly at first), or rolling off a pad with it.
    for (const p of pellets) {
      if (p.wet) continue;
      if (p.roll) {
        const { pad, x0, y0, x1, y1, t0, T } = p.roll; const k = Math.min(1, (t - t0) / T) ** 2;
        p.x = pad.u * W + pad.ox + x0 + (x1 - x0) * k; p.y = pad.v * H + pad.oy + y0 + (y1 - y0) * k;
        if (k < 1) continue;
        p.roll = null;
      } else {
        p.h = 1 - Math.min(1, (t - p.born) / FALL) ** 2;
        if (p.h > 0) continue;
      }
      land(p);
    }
    for (const f of fish) {
      const s = S * f.z; const m = 16 * s + 6;
      let sx = Math.cos(f.a); let sy = Math.sin(f.a); let arc = 96;
      let speed = (CRUISE + 6 * Math.sin(t * 0.3 + f.ph)) * cfg.speed;
      const wob = (Math.sin(t * 0.45 + f.ph) * 0.5 + Math.sin(t * 0.19 + f.ph * 1.7) * 0.4) * 0.6; // wander: a slow pull to one side, then the other
      sx -= Math.sin(f.a) * wob; sy += Math.cos(f.a) * wob;
      for (const o of fish) { // sidestep another koi: steer across the heading, away from its side (to the right when it is dead ahead)
        const d = dist(f, o); const room = 35 * S * (f.z + o.z);
        const k = (Math.cos(f.a) * (o.y - f.y) - Math.sin(f.a) * (o.x - f.x) > 0 ? -2.2 : 2.2) * (1 - d / room);
        if (o !== f && d < room) { sx -= Math.sin(f.a) * k; sy += Math.cos(f.a) * k; arc = Math.min(arc, 60); }
      }
      let food = null; let fd = Infinity;
      for (const p of pellets) { const d = dist(f, p); if (p.wet && d < fd) { fd = d; food = p; } }   // only what is in the water
      let tx = 0; let ty = 0; let pk = 0; // one pull toward (or away from) a point
      let level = 0.5 + 0.4 * Math.sin(t * 0.13 + f.ph * 1.3); // how deep it would like to swim: a slow rise and fall of its own
      // Banks: probe ahead, and once the probe leaves the safe box head for the water's middle line (along its
      // longer side). Pulling toward a fixed point keeps the turn direction stable, so a koi never runs into an edge.
      const px = f.x + Math.cos(f.a) * 40 * s; const py = f.y + Math.sin(f.a) * 40 * s;
      const out = Math.max(m - px, px - (W - m), m - py, py - (H - m), 0);
      if (out && !food) {
        if (W >= H) { mid.x = clamp(f.x, H / 2, W - H / 2); mid.y = H / 2; } else { mid.x = W / 2; mid.y = clamp(f.y, W / 2, H - W / 2); }
        const d = dist(f, mid); const k = 3 * Math.min(1, out / (16 * s));
        sx += ((mid.x - f.x) / d) * k; sy += ((mid.y - f.y) / d) * k; arc = 50;
      }
      if (Math.min(f.x, f.y, W - f.x, H - f.y) < 6 * s + 6) arc = 22; // already at an edge (after a pellet there): turn tightly
      if (food) { tx = food.x; ty = food.y; pk = 2.6; arc = 26; speed *= 2.2 + Math.min(3.3, fd / (180 * K)); level = 0; } // quicker from far away, so a pellet never waits long
      else if (ptr) {
        const d = dist(f, ptr); const flank = f.sp[5];
        if (t < ptr.fast && Math.min(d, Math.hypot(ptr.x - flank.x, ptr.y - flank.y)) < STARTLE * K) f.scare = 0.7; // a fast pointer startles nearby koi for a moment
        if (f.scare > 0) { tx = ptr.x; ty = ptr.y; pk = -3; arc = 26; speed *= 2.4; level = 1; } // and they dive as they bolt
        else if (d < cfg.reach * K) { tx = ptr.x; ty = ptr.y; pk = d > 48 * f.z ? 2 : d < 34 * f.z ? -1.2 : 0; speed *= d < 70 * f.z ? 0.6 : 1.2; arc = Math.min(arc, 34); level = 0.15; } // curious: come over and up, then loiter
      }
      if (pk) { const d = Math.hypot(tx - f.x, ty - f.y) || 1; sx += ((tx - f.x) / d) * pk; sy += ((ty - f.y) / d) * pk; }
      f.scare = Math.max(0, f.scare - dt);
      f.dive += (level - f.dive) * Math.min(1, dt * (f.scare > 0 ? 3 : 0.8));
      let da = Math.atan2(sy, sx) - f.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const near = food && fd < 45 * f.z; // close to food: turn on the spot and slow in the turn, so a pellet is never orbited
      const turn = (near ? 3.2 : Math.max(f.v, 10) / (arc * s)) * dt; // otherwise a fixed turning circle keeps the body in a gentle arc
      const d = near ? clamp(da, -turn, turn) : clamp(da * 2.5 * dt, -turn, turn); // eases into and out of a turn instead of snapping to the circle
      f.a += d;
      f.w += (d / Math.max(dt, 1e-4) - f.w) * Math.min(1, dt * 4); // smoothed turn rate: the fins and the body roll read it
      f.v += (speed * s * (near ? 1 - 0.6 * Math.min(1, Math.abs(da) / 1.5) : 1) - f.v) * Math.min(1, dt * 2.5);
      f.swim += dt * (4.2 + 1.8 * f.v / (CRUISE * s)); // tail beat: the original's 6 rad/s at a cruise, quicker in a sprint
      f.x = clamp(f.x + Math.cos(f.a) * f.v * dt, -10 * s, W + 10 * s); f.y = clamp(f.y + Math.sin(f.a) * f.v * dt, -10 * s, H + 10 * s);
      f.sp[0].x = f.x; f.sp[0].y = f.y;
      // the spine is dragged behind the head; a backbone only bends so far per joint, the tail fin a little more
      let ux = -Math.cos(f.a); let uy = -Math.sin(f.a);
      for (let k = 1; k < N + TAIL; k++) {
        const p = f.sp[k]; const q = f.sp[k - 1]; let dx = p.x - q.x; let dy = p.y - q.y; const l = Math.hypot(dx, dy) || 1; const seg = (k < N ? SEG : TSEG) * s;
        dx /= l; dy /= l;
        const lim = k < N ? 0.15 : 0.3; const sn = ux * dy - uy * dx; const cs = ux * dx + uy * dy;
        if (cs < Math.cos(lim)) { const a = sn < 0 ? -lim : lim; const c = Math.cos(a); const n = Math.sin(a); dx = ux * c - uy * n; dy = ux * n + uy * c; }
        p.x = q.x + dx * seg; p.y = q.y + dy * seg; ux = dx; uy = dy;
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
      for (const f of fish) { // a koi passing beneath carries the pad a little way along with it
        const reach = p.r * S + 9 * S * f.z; const d = Math.hypot(p.u * W + p.ox - f.x, p.v * H + p.oy - f.y);
        if (d >= reach) continue;
        const k = (1 - d / reach) * Math.min(f.v, 260) * 0.45;
        ax += Math.cos(f.a) * k; ay += Math.sin(f.a) * k; p.va += p.spin * 0.004 * k * dt;
      }
      const drag = Math.exp(-1.6 * dt);
      p.vx = (p.vx + ax * dt) * drag; p.vy = (p.vy + ay * dt) * drag; p.ox += p.vx * dt; p.oy += p.vy * dt;
      p.va *= Math.exp(-0.9 * dt); p.tw += p.va * dt;
      p.a = p.a0 + p.tw + Math.sin(t * 0.13 + p.ph) * 0.1;
    }
    for (let i = st.rips.length - 1; i >= 0; i--) if (t - st.rips[i].t >= (st.rips[i].small ? 0.9 : life)) st.rips.splice(i, 1);
  };

  const drop = (x, y) => {
    // It starts in the air (h: its height, 1 to 0); t is when it met the water, once it has (wet).
    const p = { x: clamp(x, 14, st.W - 14), y: clamp(y, 14, st.H - 14), born: st.t, t: st.t, h: 1, wet: false, roll: null, seed: rnd(fed * 7 + st.pellets.length + Math.floor(st.t * 60)) };
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
      const moved = ptr ? Math.hypot(x - ptr.x, y - ptr.y) : 0;
      const fast = ptr && moved / Math.max(1, ts - ptr.ts) > 0.9;
      if (fast) { // a fast pointer skims the surface: a small ring about every 30 px of its path
        skim += moved;
        if (skim > 30 && st.splash.length < 8) { skim = 0; st.splash.push({ x, y, kind: 'skim' }); }
        if (t - wake > 0.14) { st.rips.push({ x, y, t, small: true }); wake = t; }
      }
      st.ptr = { x, y, ts, fast: fast ? t + 0.2 : ptr ? ptr.fast : 0 };
    },
    leave() { st.ptr = null; },
    fit(W, H) {
      const first = !st.W; const was = st.W && st.W < 560;
      st.W = W; st.H = H; st.S = clamp(Math.min(W, H * 1.5) / 1100, 0.72, 1.5);
      const restock = first || was !== (W < 560);
      if (restock) stock();
      return restock;
    },
  };
}
