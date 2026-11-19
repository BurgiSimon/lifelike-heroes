// The flock's rules. Nothing here draws: the renderer reads g (the lens), inst (every bird in the air) and perch
// (every bird on the sign), and a Node script can step it (scripts/flock-check.mjs).
//
// The world is in metres and seconds: x to the right, y up, z away from the lens, which stands at the origin and
// looks along z with its horizon at y = 0. A point is seen at (g.cx + g.F * x / z, g.hy - g.F * y / z) in CSS px of
// the hero box.
//
// The starlings fly by the rule that was measured on them, over Rome, by the STARFLAG project (Ballerini et al.,
// PNAS 2008): a bird does not mind everything within some distance, it minds its seven nearest neighbours, however
// far those are. It keeps clear of them, flies the way they fly, and stays with them. Everything a murmuration does
// comes out of that and of two things about the place: the flock will not leave the sky over its roost, so it has
// to keep turning; and a bird that is frightened rolls away, and its neighbours roll because it did, which is the
// dark wave that crosses a flock faster than any bird in it flies.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// A stream of numbers from a seed: the flock is the same on every load.
const stream = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- the place
const CAP = 1.3;         // m: how tall the sign's capitals are. The page's type size becomes the lens's focal length through this.
const DS = 34;           // m from the lens to the sign, on the roof across the street
const Z0 = 92;           // m to the middle of the sky the flock keeps to: over the next street but one
const RZ = 30;           // m: how far that sky reaches toward the lens and away from it

// ---- a starling
export const SEVEN = 7;  // the neighbours a bird minds
const DT = 1 / 30;       // s: the flock's own step. Between steps the renderer carries each bird on along its velocity.
const V0 = 11;           // m/s: cruising
const V_MIN = 6.5; const V_MAX = 16.5;
const R_SEP = 1.0;       // m: closer than about this to a neighbour, a bird makes room
const K_SEP = 18;        // m/s² at touching
const K_ALIGN = 1.4;     // per s: how fast it takes up its neighbours' heading
const K_STAY = 0.38;     // m/s² per metre from the middle of its neighbours
const K_TURN = 6;        // m/s²: how hard the edge of its sky turns it back
const K_ROUND = 1.1;     // m/s²: the flock circles its roost
const K_HERD = 5;        // m/s² per flock-width outside the flock: no starling wants to be the one on the outside
const A_MAX = 26;        // m/s²: about 2.7 g, which a starling pulls without trouble
const G = 9.81;
// ---- a fright
const R_FEAR = 20;       // m: a falcon nearer than this is fled from
const ROLL = 0.5;        // s a frightened bird's roll lasts
const COPY = 1 / 30;      // s before a neighbour copies it: one step of the flock, about as quick as a starling's eye. The wave runs a neighbour's distance per this.
const REST = 2.5;        // s before the same bird will roll again
const A_ROLL = 15;       // m/s² sideways while it rolls
// ---- the roost
const DWELL = 300;       // s a bird stays on the sign, about, before it goes for a turn with the flock
const CELL = 1.6;        // m: the grid neighbours are looked for in. Seven neighbours are nearly always within one cell of a bird's own.
const HS = 8192;         // its hash table

export const MAXF = 3600;            // starlings the flock's buffers hold
export const MAXR = 220;             // birds that own a place on the sign
export const MAXI = MAXF + MAXR + 1; // everything that can be in the air at once: the flock, the sign's birds, a falcon

export function createFlock(options) {
  let cfg = options;
  // home: the sky the flock keeps to. It is a cone from the lens, so the flock stays in the same part of the frame
  // whether it is near or far: px to each side of the lens's axis (rxp), px above the horizon (syc, give or take ryp),
  // and metres of depth (z, give or take rz). x, y, rx, ry are the same in metres at depth z.
  const g = { W: 0, H: 0, ppm: 1, F: 1, cx: 0, hy: 0, DS, wide: 12, home: { x: 0, y: 40, z: Z0, rx: 30, ry: 10, rz: RZ, rxp: 300, ryp: 150, syc: 300 } };
  // The flock, a number per bird: where it is, how it flies, what holds it up (its lift: wings are square to it),
  // how frightened it is, how far through a roll it is and which way the roll goes, and how long since its last.
  const px = new Float32Array(MAXF); const py = new Float32Array(MAXF); const pz = new Float32Array(MAXF);
  const vx = new Float32Array(MAXF); const vy = new Float32Array(MAXF); const vz = new Float32Array(MAXF);
  const ux = new Float32Array(MAXF); const uy = new Float32Array(MAXF).fill(1); const uz = new Float32Array(MAXF);
  const fear = new Float32Array(MAXF); const roll = new Float32Array(MAXF); const rest = new Float32Array(MAXF);
  const rx_ = new Float32Array(MAXF); const ry_ = new Float32Array(MAXF); const rz_ = new Float32Array(MAXF);
  const own = new Float32Array(MAXF);   // each bird's own number, 0..1: its speed, its wingbeat
  const near = new Int32Array(MAXF * SEVEN).fill(-1);
  const head = new Int32Array(HS); const next = new Int32Array(MAXF);
  const bestD = new Float32Array(SEVEN); const bestI = new Int32Array(SEVEN);
  const st = {
    t: 0, n: 0, tick: 0, carry: 0, lag: 0, round: 1, turnAt: 50, rippleAt: 9,
    mid: [0, 40, Z0],   // the middle of the flock, eased: where a falcon hunts and a bird from the sign heads
    cen: [0, 40, Z0],   // and as it is this step
    inst: new Float32Array(MAXI * 12), count: 0,   // per bird in the air: x, y, z, its own number | vx, vy, vz, kind | lift x, y, z, how much it is there
    perch: new Float32Array(MAXR * 4), perched: 0, // per bird on the sign: x, y (px), which way it faces, its own number
    roost: [], slots: [],
    falcon: { on: false, mode: 'away', x: 0, y: 0, z: Z0, vx: 0, vy: 0, vz: 0, ux: 0, uy: 1, uz: 0, dueAt: 38, pass: 0 },
    events: [],         // for the sound: { kind: 'clap' | 'lift' | 'land' | 'wave', x, n }
  };
  let rand = stream(11); let born = false; let waved = -10;

  const toWorld = (sx, sy, z) => [(sx - g.cx) / g.F * z, (g.hy - sy) / g.F * z, z];
  const toScreen = (x, y, z) => [g.cx + g.F * x / z, g.hy - g.F * y / z];

  // ---- the seven nearest: every bird is filed in a grid, and each looks through the cells round its own
  const cellOf = (x, y, z) => ((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791)) & (HS - 1);
  const file = () => { head.fill(-1); for (let i = 0; i < st.n; i++) { const c = cellOf(px[i], py[i], pz[i]); next[i] = head[c]; head[c] = i; } };
  const look = (i) => {
    const x = px[i]; const y = py[i]; const z = pz[i]; let got = 0;
    // The cells round its own nearly always hold seven. A bird out on the fringe looks further: the rule is the
    // seven nearest, however far those are.
    for (let R = 1; R <= 4 && got < SEVEN; R *= 2) {
      let far = 1e9; got = 0;
      for (let a = -R; a <= R; a++) {
        for (let b = -R; b <= R; b++) {
          for (let c = -R; c <= R; c++) {
            for (let j = head[cellOf(x + a * CELL, y + b * CELL, z + c * CELL)]; j >= 0; j = next[j]) {
              if (j === i) continue;
              const dx = px[j] - x; const dy = py[j] - y; const dz = pz[j] - z; const d = dx * dx + dy * dy + dz * dz;
              if (got === SEVEN && d >= far) continue;
              let k = 0; while (k < got && bestI[k] !== j) k++;
              if (k < got) continue;   // two cells can share a place in the table: it has been met already
              k = got < SEVEN ? got++ : SEVEN - 1;
              while (k > 0 && bestD[k - 1] > d) { bestD[k] = bestD[k - 1]; bestI[k] = bestI[k - 1]; k--; }
              bestD[k] = d; bestI[k] = j; if (got === SEVEN) far = bestD[SEVEN - 1];
            }
          }
        }
      }
    }
    for (let k = 0; k < SEVEN; k++) near[i * SEVEN + k] = k < got ? bestI[k] : -1;
  };

  // A bird starts a roll, away along (dx, dy, dz).
  const startle = (i, dx, dy, dz) => {
    // only the part of it that is across its flight: a roll does not slow a bird down
    const s = Math.hypot(vx[i], vy[i], vz[i]) || 1; const along = (dx * vx[i] + dy * vy[i] + dz * vz[i]) / s;
    let ax = dx - along * vx[i] / s; let ay = (dy - along * vy[i] / s) * 0.5; let az = dz - along * vz[i] / s; const l = Math.hypot(ax, ay, az);
    if (l < 1e-4) { ax = -vz[i] / s; ay = 0; az = vx[i] / s; } else { ax /= l; ay /= l; az /= l; }
    rx_[i] = ax; ry_[i] = ay; rz_[i] = az; roll[i] = ROLL; rest[i] = REST;
  };

  // ---- one step of the flock
  const advance = () => {
    const n = st.n; const h = g.home; const f = st.falcon; const t = st.t;
    file();
    for (let i = st.tick % 4; i < n; i += 4) look(i);   // a quarter of the flock looks again each step: neighbours change slowly
    st.tick++;
    // the sky it keeps to drifts a little, and the way it circles turns round now and then
    const hx = 0.22 * h.rxp * Math.sin(t * 0.05 + 1); const hyy = h.syc + 0.2 * h.ryp * Math.sin(t * 0.043 + 2); const hz = h.z + 0.2 * h.rz * Math.sin(t * 0.037); const F = g.F;
    if (t > st.turnAt) { st.round = -st.round; st.turnAt = t + 35 + 45 * rand(); }
    // and now and then a bird on its edge takes fright at nothing, as they do
    if (t > st.rippleAt && n) { st.rippleAt = t + 9 + 12 * rand(); const i = Math.floor(rand() * n); if (rest[i] <= 0) startle(i, rand() - 0.5, 0.2, rand() - 0.5); }
    // The flock is one body: a bird that finds itself outside it heads back in. How wide the body is breathes,
    // long and thin one minute and bunched the next.
    const breath = 1 + 0.38 * Math.sin(t * 0.11 + 0.6) + 0.14 * Math.sin(t * 0.29);
    const wx = g.wide * breath; const wy = clamp(0.75 * h.ry, 3.5, 9); const wz = 17 / breath; const cx_ = st.cen[0]; const cy_ = st.cen[1]; const cz_ = st.cen[2];
    let sx = 0; let sy = 0; let sz = 0; let waves = 0;
    for (let i = 0; i < n; i++) {
      const x = px[i]; const y = py[i]; const z = pz[i]; const u = vx[i]; const v = vy[i]; const w = vz[i];
      const room = R_SEP * (0.7 + 0.9 * own[i] * own[i]);   // no two birds want the same room
      let ax = 0; let ay = 0; let az = 0; let mx = 0; let my = 0; let mz = 0; let mu = 0; let mv = 0; let mw = 0; let m = 0; let rolling = 0; let dx_ = 0; let dy_ = 0; let dz_ = 0;
      for (let k = 0; k < SEVEN; k++) {
        const j = near[i * SEVEN + k]; if (j < 0) break;
        const dx = px[j] - x; const dy = py[j] - y; const dz = pz[j] - z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
        if (d < room) { const s = K_SEP * (room - d) / (room * d); ax -= dx * s; ay -= dy * s; az -= dz * s; }
        mx += dx; my += dy; mz += dz; mu += vx[j]; mv += vy[j]; mw += vz[j]; m++;
        if (roll[j] > 0 && ROLL - roll[j] > COPY - 1e-4) { rolling++; dx_ += rx_[j]; dy_ += ry_[j]; dz_ += rz_[j]; }
      }
      if (m) {
        ax += K_ALIGN * (mu / m - u) + K_STAY * mx / m; ay += K_ALIGN * (mv / m - v) + K_STAY * my / m; az += K_ALIGN * (mw / m - w) + K_STAY * mz / m;
        if (rolling >= 2 && roll[i] <= 0 && rest[i] <= 0) startle(i, dx_, dy_, dz_);   // its neighbours rolled: so does it
      }
      // the sky over the roost: past its edge a bird is turned back, harder the further out; and all of them go round it
      const qx = (x / z * F - hx) / h.rxp; const qy = (y / z * F - hyy) / h.ryp; const qz = (z - hz) / h.rz; const r = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (r > 0.6) { const s = K_TURN * (r - 0.6) * (r - 0.6) / (r * 0.16); ax -= qx * s; az -= qz * s; }
      ay -= 6 * qy * Math.abs(qy) + 1.6 * v;   // it keeps its height, and does not climb or dive for long
      const ex = (x - cx_) / wx; const ey = (y - cy_) / wy; const ez = (z - cz_) / wz; const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (el > 1) { const s = K_HERD * (el - 1) / el; ax -= ex * s; ay -= ey * s * 0.6; az -= ez * s; }
      const rh = Math.hypot(qx, qz); if (rh > 0.05) { const s = K_ROUND * st.round * smooth(0.1, 0.6, rh) / rh; ax -= qz * s; az += qx * s; }
      // the falcon
      if (f.on) {
        const dx = x - f.x; const dy = y - f.y; const dz = z - f.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R_FEAR) {
          const k = (1 - d / R_FEAR); const s = 62 * k * k / (d || 1);
          ax += dx * s; ay += dy * s * 0.6; az += dz * s; if (k > fear[i]) fear[i] = k;
          if (k > 0.25 && roll[i] <= 0 && rest[i] <= 0) { startle(i, dx, dy, dz); waves++; }
        }
      }
      if (roll[i] > 0) { const s = A_ROLL * Math.sin(Math.PI * (1 - roll[i] / ROLL)); ax += rx_[i] * s; ay += ry_[i] * s; az += rz_[i] * s; roll[i] -= DT; }
      if (rest[i] > 0) rest[i] -= DT;
      // its own speed, a little faster when frightened, and a little restlessness
      const sp = Math.sqrt(u * u + v * v + w * w) || 1e-3; const want = (V0 + 1.2 * (own[i] - 0.5)) * (1 + 0.38 * fear[i]); const s = (want - sp) / (0.9 * sp);
      ax += u * s + (rand() - 0.5) * 3; ay += v * s + (rand() - 0.5) * 1.6; az += w * s + (rand() - 0.5) * 3;
      fear[i] *= 0.975;
      const a = Math.sqrt(ax * ax + ay * ay + az * az); if (a > A_MAX) { const k = A_MAX / a; ax *= k; ay *= k; az *= k; }
      // what holds it up: its weight's opposite, and whatever is turning it. Its wings lie square to that.
      const al = (ax * u + ay * v + az * w) / (sp * sp); const lx = ax - al * u; const ly = ay - al * v + G; const lz = az - al * w; const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      ux[i] += (lx / ll - ux[i]) * 0.24; uy[i] += (ly / ll - uy[i]) * 0.24; uz[i] += (lz / ll - uz[i]) * 0.24;
      let nu = u + ax * DT; let nv = clamp(v + ay * DT, -4, 4); let nw = w + az * DT; const ns = Math.sqrt(nu * nu + nv * nv + nw * nw) || 1e-3;
      const k = clamp(ns, V_MIN, V_MAX) / ns; nu *= k; nv *= k; nw *= k;
      vx[i] = nu; vy[i] = nv; vz[i] = nw; px[i] = x + nu * DT; py[i] = y + nv * DT; pz[i] = z + nw * DT;
      sx += px[i]; sy += py[i]; sz += pz[i];
    }
    if (n) { st.cen[0] = sx / n; st.cen[1] = sy / n; st.cen[2] = sz / n; const k = 0.06; st.mid[0] += (sx / n - st.mid[0]) * k; st.mid[1] += (sy / n - st.mid[1]) * k; st.mid[2] += (sz / n - st.mid[2]) * k; }
    if (waves > 12 && t - waved > 1.6) { waved = t; st.events.push({ kind: 'wave', x: toScreen(f.x, f.y, f.z)[0] }); }
  };

  // ---- the flock as it is when the scene opens: a long comma of birds going round the roost, thick at its head
  const gather = (n) => {
    rand = stream(11); st.n = n; st.tick = 0; const h = g.home;
    const bell = () => (rand() + rand() + rand() - 1.5) / 1.5;
    for (let i = 0; i < n; i++) {
      const s = rand() ** 0.75; const a = 2.75 - s * 1.9; const wide = 0.42 - 0.3 * s; const r = 0.45 + 0.12 * bell();
      px[i] = h.x + (Math.cos(a) * r + bell() * wide * 0.5) * h.rx; py[i] = h.y + (bell() * wide * 0.9 + 0.15 * Math.sin(a * 2)) * h.ry; pz[i] = h.z + (Math.sin(a) * r + bell() * wide * 0.5) * h.rz;
      const tx = Math.sin(a) * h.rx; const tz = -Math.cos(a) * h.rz; const l = Math.hypot(tx, tz);
      vx[i] = tx / l * V0; vy[i] = 0; vz[i] = tz / l * V0; ux[i] = 0; uy[i] = 1; uz[i] = 0; fear[i] = 0; roll[i] = 0; rest[i] = REST * rand(); own[i] = rand();
    }
    st.round = 1; st.turnAt = 50; st.rippleAt = 9; st.mid = [h.x, h.y, h.z]; st.cen = [h.x - 0.1 * h.rx, h.y, h.z + 0.3 * h.rz];
    file(); for (let i = 0; i < n; i++) look(i);
    for (let k = 0; k < 24; k++) { st.t = k * DT; advance(); }   // most of a second of flying, so every bird has found its room
    st.t = 0; st.carry = 0; st.lag = 0;
  };

  // ---- the sign's own birds. Each owns a place on it. On the sign it sits; away, it flies with the flock, keeping
  // by one bird of it; and between the two it flies as any bird flies to a place: fast while far, slow at the end.
  // state: 0 on the sign, 1 gone to the flock, 2 coming back.
  const settleRoost = () => {
    const r = stream(29); st.roost = [];
    st.slots.forEach((s, k) => {
      if (r() > 0.9 || st.roost.length >= MAXR) return;   // a few places are nobody's
      const b = { slot: k, state: r() < 0.74 ? 0 : 1, t: 0, x: 0, y: 0, z: DS, vx: 0, vy: 0, vz: 0, ux: 0, uy: 1, uz: 0, pal: Math.floor(r() * 1e6), ox: (r() - 0.5) * 5, oy: (r() - 0.5) * 3, oz: (r() - 0.5) * 5, own: r(), face: r() < 0.5 ? -1 : 1, k: 1 };
      b.t = b.state === 0 ? 12 + DWELL * 1.6 * r() : 4 + 40 * r();
      st.roost.push(b);
    });
    for (const b of st.roost) { if (b.state === 0) sit(b); else join(b); }
  };
  const sit = (b) => { const s = st.slots[b.slot]; const w = toWorld(s.x, s.y, DS); b.x = w[0]; b.y = w[1]; b.z = w[2]; b.vx = b.vy = b.vz = 0; b.state = 0; };
  const palOf = (b) => (st.n ? b.pal % st.n : -1);
  // where its companion in the flock is, as the eye has it now (the flock moves on between its steps)
  const withPal = (b, o) => { const j = palOf(b); if (j < 0) { o[0] = g.home.x; o[1] = g.home.y; o[2] = g.home.z; o[3] = o[4] = o[5] = 0; return; } o[0] = px[j] + vx[j] * st.lag + b.ox; o[1] = py[j] + vy[j] * st.lag + b.oy; o[2] = pz[j] + vz[j] * st.lag + b.oz; o[3] = vx[j]; o[4] = vy[j]; o[5] = vz[j]; };
  const tmp = [0, 0, 0, 0, 0, 0];
  const join = (b) => { withPal(b, tmp); b.x = tmp[0]; b.y = tmp[1]; b.z = tmp[2]; b.vx = tmp[3]; b.vy = tmp[4]; b.vz = tmp[5]; b.state = 1; };
  const leave = (b, away) => {   // it jumps: up, and off toward the open sky
    b.state = 1; b.t = away; b.vx = (hash(b.own * 91 + st.t) - 0.5) * 5; b.vy = 4.2 + 2.2 * hash(b.own * 57 + st.t); b.vz = 2.5 + 4 * hash(b.own * 33 + st.t);
  };
  const fly = (b, dt, tx, ty, tz, tu, tv, tw, land) => {
    const dx = tx - b.x; const dy = ty - b.y; const dz = tz - b.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
    // far off it flies flat out; close, it matches what it is flying to (a bird it keeps by, or a perch that does not move)
    const sp = land ? Math.min(12.5, 1.6 + d * 0.9) : Math.min(13.5, d * 1.2); const k = land ? 1 : smooth(1.5, 9, d);
    const wu = dx / d * sp * k + tu * (1 - k); const wv = dy / d * sp * k + tv * (1 - k) + (land ? Math.min(2.2, d * 0.1) * smooth(1.2, 6, d) : 0); const ww = dz / d * sp * k + tw * (1 - k);
    let ax = (wu - b.vx) / 0.4; let ay = (wv - b.vy) / 0.4; let az = (ww - b.vz) / 0.4; const a = Math.sqrt(ax * ax + ay * ay + az * az);
    if (a > 18) { ax *= 18 / a; ay *= 18 / a; az *= 18 / a; }
    const lx = ax; const ly = ay + G; const lz = az; const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1; const e = 1 - Math.exp(-dt / 0.12);
    b.ux += (lx / ll - b.ux) * e; b.uy += (ly / ll - b.uy) * e; b.uz += (lz / ll - b.uz) * e;
    b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    return d;
  };
  const stepRoost = (dt, ptr) => {
    let lifted = 0; let liftX = 0;
    const fast = ptr && Math.hypot(ptr.vx, ptr.vy) > 420;
    for (const b of st.roost) {
      b.t -= dt;
      if (b.state === 0) {
        const s = st.slots[b.slot];
        // a hand that sweeps close by puts a bird up, and so does its own restlessness, in the end
        if (fast && Math.hypot(s.x - ptr.x, s.y - ptr.y) < cfg.reach * 0.45) { leave(b, 8 + 14 * hash(b.own * 7 + st.t)); lifted++; liftX += s.x; }
        else if (b.t <= 0) { leave(b, 3 + 42 * hash(b.own * 3 + st.t) ** 1.5); lifted++; liftX += s.x; }
        else if (hash(b.own * 19 + Math.floor(st.t * 0.4)) > 0.985) b.face = -b.face;   // it turns round on its perch now and then
      } else if (b.state === 1) {
        withPal(b, tmp); fly(b, dt, tmp[0], tmp[1], tmp[2], tmp[3], tmp[4], tmp[5], false);
        if (b.t <= 0) b.state = 2;
      } else {
        const s = st.slots[b.slot]; const w = toWorld(s.x, s.y, DS);
        if (fly(b, dt, w[0], w[1] + 0.03, w[2], 0, 0, 0, true) < 0.2) { sit(b); b.t = 20 + DWELL * (0.3 + 1.4 * hash(b.own * 13 + st.t)); st.events.push({ kind: 'land', x: s.x }); }
      }
    }
    if (lifted) st.events.push({ kind: 'lift', x: liftX / lifted, n: lifted });
  };

  // ---- the falcon. With a pointer on the scene it hunts the pointer, in the flock's own sky; when the pointer
  // goes, so does it. Left alone long enough, one comes through by itself.
  const stepFalcon = (dt, ptr) => {
    const f = st.falcon; let tx; let ty; let tz; let speed = 25;
    if (ptr) {
      const w = toWorld(ptr.x, ptr.y, st.mid[2]);
      if (!f.on || f.mode === 'leave' || f.mode === 'pass') {
        if (!f.on) { const from = toWorld(ptr.x + (ptr.x < g.W / 2 ? -1 : 1) * g.W * 0.3, -60, st.mid[2]); f.x = from[0]; f.y = from[1]; f.z = from[2]; f.vx = (w[0] - f.x) * 0.4; f.vy = -6; f.vz = 0; }
        f.on = true; f.mode = 'hunt';
      }
      tx = w[0]; ty = w[1]; tz = w[2];
    } else if (f.on && f.mode === 'hunt') { f.mode = 'leave'; f.pass = f.vx >= 0 ? 1 : -1; }
    if (!f.on) {
      if (st.t >= f.dueAt && !ptr) {   // nobody about: one crosses the roost's sky on its own business
        f.dueAt = st.t + 42 + 40 * rand(); f.pass = rand() < 0.5 ? -1 : 1; f.on = true; f.mode = 'pass';
        const from = toWorld(f.pass < 0 ? g.W + 80 : -80, g.H * 0.12, st.mid[2] + 20); f.x = from[0]; f.y = from[1]; f.z = from[2]; f.vx = 22 * f.pass; f.vy = -3; f.vz = 0;
      } else return;
    }
    if (f.mode === 'pass') { tx = st.mid[0] + f.pass * 400; ty = st.mid[1] + 6; tz = st.mid[2]; speed = 23; if (Math.abs(f.x - st.mid[0]) < 40) ty = st.mid[1]; }
    if (f.mode === 'leave') { tx = f.x + f.pass * 300; ty = f.y + 160; tz = f.z + 60; speed = 24; }
    const dx = tx - f.x; const dy = ty - f.y; const dz = tz - f.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
    // a pointer that holds still is circled, not sat on
    const sp = Math.min(speed, 12 + d * 1.1); const circ = f.mode === 'hunt' ? 13 * (1 - smooth(4, 14, d)) : 0;
    const wu = dx / d * sp - dz / d * circ; const wv = dy / d * sp; const ww = dz / d * sp + dx / d * circ + (f.mode === 'hunt' ? circ * 0.5 : 0);
    let ax = (wu - f.vx) / 0.35; let ay = (wv - f.vy) / 0.35; let az = (ww - f.vz) / 0.35; const a = Math.sqrt(ax * ax + ay * ay + az * az);
    if (a > 34) { ax *= 34 / a; ay *= 34 / a; az *= 34 / a; }
    const ll = Math.sqrt(ax * ax + (ay + G) * (ay + G) + az * az) || 1; const e = 1 - Math.exp(-dt / 0.15);
    f.ux += (ax / ll - f.ux) * e; f.uy += ((ay + G) / ll - f.uy) * e; f.uz += (az / ll - f.uz) * e;
    f.vx += ax * dt; f.vy += ay * dt; f.vz += az * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    if (f.mode !== 'hunt') { const s = toScreen(f.x, f.y, f.z); if (s[0] < -160 || s[0] > g.W + 160 || s[1] < -160) { f.on = false; f.mode = 'away'; } }
  };

  // ---- what the renderer is handed: every bird in the air, and every bird on the sign
  const write = () => {
    const I = st.inst; let k = 0;
    for (let i = 0; i < st.n; i++, k += 12) { I[k] = px[i]; I[k + 1] = py[i]; I[k + 2] = pz[i]; I[k + 3] = own[i]; I[k + 4] = vx[i]; I[k + 5] = vy[i]; I[k + 6] = vz[i]; I[k + 7] = 0; I[k + 8] = ux[i]; I[k + 9] = uy[i]; I[k + 10] = uz[i]; I[k + 11] = 1; }
    let p = 0;
    for (const b of st.roost) {
      if (b.state === 0) { const s = st.slots[b.slot]; st.perch[p * 4] = s.x; st.perch[p * 4 + 1] = s.y; st.perch[p * 4 + 2] = b.face; st.perch[p * 4 + 3] = b.own; p++; continue; }
      I[k] = b.x; I[k + 1] = b.y; I[k + 2] = b.z; I[k + 3] = b.own; I[k + 4] = b.vx; I[k + 5] = b.vy; I[k + 6] = b.vz; I[k + 7] = 1; I[k + 8] = b.ux; I[k + 9] = b.uy; I[k + 10] = b.uz; I[k + 11] = 1; k += 12;
    }
    const f = st.falcon;
    if (f.on) { I[k] = f.x; I[k + 1] = f.y; I[k + 2] = f.z; I[k + 3] = 0.37; I[k + 4] = f.vx; I[k + 5] = f.vy; I[k + 6] = f.vz; I[k + 7] = 2; I[k + 8] = f.ux; I[k + 9] = f.uy; I[k + 10] = f.uz; I[k + 11] = 1; k += 12; }
    st.count = k / 12; st.perched = p;
  };

  return {
    g, st, toScreen, toWorld,
    setOptions(o) { const was = cfg.birds; cfg = o; if (born && o.birds !== was) { gather(Math.min(MAXF, o.birds)); for (const b of st.roost) if (b.state !== 0) join(b); write(); } },
    // Lay the lens out round the headline. title: { l, t, r, b, em } in px (em: the size of its type). The sign's
    // letters are a fixed size in the world, so the page's type size is the lens's focal length; the horizon lies
    // just under the letters' feet, and the flock's sky is the open sky above them. Returns true when the box is new.
    fit(W, H, title) {
      const fresh = W !== g.W || H !== g.H; const was = { ...g.home };
      g.W = W; g.H = H; g.ppm = clamp(0.72 * title.em / CAP, 40, 120); g.F = g.ppm * DS; g.cx = W / 2; g.hy = title.b + 0.1 * title.em;
      // The flock's sky: the open sky over the sign. On a narrow frame it is further off, so that a flock which
      // cannot turn in much less than ten metres still turns inside the picture.
      const h = g.home; h.rxp = 0.27 * W; h.ryp = 0.3 * title.t; h.syc = g.hy - 0.45 * title.t; h.z = clamp(10 * g.F / h.rxp, Z0, 150); h.rz = RZ;
      h.x = 0; h.y = h.syc / g.F * h.z; h.rx = h.rxp / g.F * h.z; h.ry = h.ryp / g.F * h.z;
      g.wide = clamp(0.17 * W / g.F * h.z, 5, 15);   // m: half the flock's own width, when it is neither drawn out nor bunched: a third of the frame
      if (!born) { born = true; gather(Math.min(MAXF, cfg.birds)); } else if (fresh) {
        // a new box is the same flock under a different lens: it is carried over to the sky it now has
        for (let i = 0; i < st.n; i++) { px[i] = h.x + (px[i] - was.x) * h.rx / was.rx; py[i] = h.y + (py[i] - was.y) * h.ry / was.ry; pz[i] = h.z + (pz[i] - was.z); }
        for (const b of st.roost) if (b.state !== 0) join(b);
        st.mid = [h.x, h.y, h.z]; st.cen = [h.x, h.y, h.z];
      }
      return fresh;
    },
    // Where a bird can sit: [{ x, y }] in px, from the picture of the sign (skyline.js). The same places give the
    // same birds, so a layout that has not changed keeps every bird where it was.
    setPerches(slots) {
      const same = slots.length === st.slots.length;
      st.slots = slots;
      if (!same) settleRoost(); else for (const b of st.roost) if (b.state === 0) sit(b);
      write();
    },
    // dt: s. ptr: the pointer as { x, y, vx, vy } in px and px/s, or null.
    step(dt, ptr) {
      st.t += dt; st.carry = Math.min(st.carry + dt, 3 * DT);
      stepFalcon(dt, ptr);
      while (st.carry >= DT) { st.carry -= DT; advance(); }
      st.lag = st.carry;
      stepRoost(dt, ptr);
      write();
    },
    // A clap at (x, y) px. Every bird on the sign goes up, the nearest first; birds on their way back turn round;
    // and the flock, far off, starts at it a moment later. quiet: nothing moves, so the sign is simply shown empty
    // and its birds with the flock. Returns how many left the sign.
    clap(x, y, quiet) {
      let up = 0;
      for (const b of st.roost) {
        const s = st.slots[b.slot];
        if (b.state === 0) { up++; if (quiet) { b.t = 1e9; join(b); } else { const wait = 0.03 + Math.hypot(s.x - x, s.y - y) / (g.ppm * 45) + 0.22 * hash(b.own * 71 + up); b.t = wait; } }
        else if (b.state === 2 && !quiet) { b.state = 1; b.t = 10 + 20 * hash(b.own * 9 + st.t); }
      }
      if (!quiet) {
        // the sound reaches the flock: the birds nearest the line of sight through the clap roll first, and it spreads
        const w = toWorld(x, y, 1); const l = Math.hypot(w[0], w[1], 1); let hit = 0;
        for (let i = 0; i < st.n && hit < 40; i += 7) {
          const along = (px[i] * w[0] + py[i] * w[1] + pz[i]) / l; const dx = px[i] - w[0] / l * along; const dy = py[i] - w[1] / l * along; const dz = pz[i] - 1 / l * along;
          if (dx * dx + dy * dy + dz * dz < 144 && rest[i] <= 0.5) { startle(i, dx, dy + 1, dz); fear[i] = 0.8; hit++; }
        }
        if (!hit && st.n) { const i = Math.floor(hash(st.t) * st.n); startle(i, 0.3, 1, 0.2); }
        st.events.push({ kind: 'clap', x, n: up });
      }
      write();
      return up;
    },
    // A falcon comes through now, whoever is about (unless one is already hunting).
    pass() { const f = st.falcon; if (!f.on) f.dueAt = st.t; },
    count: () => st.perched,
    // for the self-check: the flock's own numbers, and one bird taking fright at nothing
    birds: () => ({ px, py, pz, vx, vy, vz, ux, uy, uz, roll, near, n: st.n }),
    fright(i) { startle(i, 0.3, 0.2, 1); },
  };
}
