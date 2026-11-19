// The room's rules. Nothing here draws: the renderer reads g (where things are) and st (how they stand now), and a
// Node script can step it (scripts/room-check.mjs).
//
// Two sets of units. The wall is laid out in CSS px of the hero box: x right, y down, z out of the wall toward the
// lens. g.ppm is how many of those px make a metre. Everything that has a size of its own (cloth, leaves, crystals,
// forces) is kept in metres and seconds, and is the same on any screen.
//
// The one idea the whole scene hangs on: the sun is so far away that a shadow on the wall is its object moved
// along the light, unchanged in shape. So every thing that stands in the light is kept by where its shadow falls
// on the wall ("shadow space"), and only its distance from the wall is needed besides, because that sets how soft
// the sun's own width makes its edge.

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// Smooth noise along a line, 0..1: what makes one gust stronger than the next.
const noise = (x) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };

// ---- the light
const AZ = -33 * RAD;    // the sun stands this far to the right of straight behind the lens
const EL = 13 * RAD;     // and this high: four o'clock on an October afternoon
export const SUN = [-Math.sin(AZ) * Math.cos(EL), -Math.sin(EL), Math.cos(AZ) * Math.cos(EL)];   // toward the sun
export const KX = -SUN[0] / SUN[2];   // a shadow lies this far to the right of its object, per unit of depth between them (negative: to the left)
export const KY = -SUN[1] / SUN[2];   // and this far below it
export const DISC = 0.00925;          // rad: the sun's width in the sky. A shadow's edge is this wide per unit of distance.
const PEN = 0.11;        // the edge of the letters' shadow, as a share of their size: soft, and still read at a glance
export const NEAR = 2.4; // m beyond the glass to the lime tree's nearer boughs
export const FAR = 6.5;  // m to the farther ones: their shadows are softer still

// ---- sizes of the things kept
export const CRYSTALS = 9;            // crystals the window can hold (the cap option keeps fewer)
export const BEAMS = 90;              // spectra drawn at most: ten to a crystal
export const BOUGHS = 9;
export const NX = 37; export const NY = 30;   // the curtain's cloth: threads across and down
const CLOTH_W = 0.36; const CLOTH_H = 1.25;   // m: the curtain as it was made, gathered on its rod. A layout stretches it to fit.
export const FW = 40; export const FH = 24;   // the pointer's breeze: cells across and down the frame

// ---- the glass of a crystal: lead crystal, which spreads colours wider than window glass does
const N_RED = 1.588; const N_VIOLET = 1.630;   // refractive index at 700 nm and at 400 nm
const FACET = 6e-4;      // m²: the light one facet catches. A big pendant; small ones throw spectra too faint to photograph.
// The cut: two rings of facets round a vertical axis, fourteen leaning up a little and twelve leaning down, each a
// degree or two off true as a hand-cut stone's are, so the wedges of glass between one facet and another come in
// many angles. Light that goes in by one facet and out by another has passed a prism; which pairs make one is
// plain geometry.
const FACETS = [];
[[14, -5, 0], [12, 7, 0.4]].forEach(([count, lean, turn], ring) => {
  for (let k = 0; k < count; k++) {
    const phi = (k + turn + 0.3 * (hash(ring * 40 + k * 3.3) - 0.5)) / count * Math.PI * 2; const tilt = (lean + 7 * (hash(ring * 70 + k * 5.1) - 0.5)) * RAD;
    FACETS.push([Math.cos(phi) * Math.cos(tilt), Math.sin(tilt), Math.sin(phi) * Math.cos(tilt)]);
  }
});
const PRISMS = [];   // [in, out, x, y, z of the way from one facet to the other]
FACETS.forEach((a, i) => FACETS.forEach((b, j) => {
  const apex = Math.PI - Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));   // the angle of the wedge of glass between them
  if (i === j || apex < 16 * RAD || apex > 50 * RAD) return;   // thinner: hardly any colour. Thicker: the light cannot get out.
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...d);
  PRISMS.push([i, j, d[0] / l, d[1] / l, d[2] / l]);
}));
// Snell's law. d: the way the light travels; n: the surface's normal, facing the light; eta: index it leaves over
// index it enters. null when the light cannot cross (total internal reflection).
const refract = (d, n, eta, out) => {
  const c = -(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]); const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  const f = eta * c - Math.sqrt(k);
  out[0] = eta * d[0] + f * n[0]; out[1] = eta * d[1] + f * n[1]; out[2] = eta * d[2] + f * n[2];
  return out;
};

// ---- the lime tree outside, in metres from the top right corner of the glass (shadow space, x right, y down)
// start, end, sag, and whether it is one of the farther boughs
const BOUGH = [
  [0.50, -0.30, -1.30, 0.06, 0.10, 0], [0.55, -0.02, -0.95, 0.40, 0.14, 0], [0.60, 0.15, -0.22, 1.00, 0.12, 0], [0.42, 0.40, 0.04, 1.45, 0.06, 0],
  [0.35, -0.55, -1.60, -0.22, 0.12, 1], [0.65, -0.15, -0.70, 0.72, 0.10, 1], [0.70, 0.30, -0.08, 1.25, 0.10, 1],
  [0.30, -0.42, -0.85, -0.05, 0.08, 0], [0.75, 0.05, 0.05, 0.62, 0.08, 1],
];
// Grown once, the same on every load. Leaves: x, y, angle, length | bough, how far along it, how far along its twig,
// seed | how much it faces the sun, far. Wood: both ends as x, y, along the bough, along the twig | radius, far, bough, seed.
function growTree() {
  const leaves = []; const wood = []; let n = 0;
  const r = () => hash(++n * 1.37);
  BOUGH.forEach(([sx, sy, ex, ey, sag, far], b) => {
    const len = Math.hypot(ex - sx, ey - sy); const tx = (ex - sx) / len; const ty = (ey - sy) / len;
    const at = (t) => [sx + (ex - sx) * t + ty * sag * Math.sin(Math.PI * t) * -1, sy + (ey - sy) * t + Math.abs(tx) * sag * Math.sin(Math.PI * t)];   // it sags under its own weight
    const leaf = (x, y, dir, t, tw) => {
      const a = dir + (r() - 0.5) * 0.9 + 0.5 * Math.sign(Math.cos(dir)) * r();   // leaves hang a little
      const size = (0.075 + 0.045 * r()) * (far ? 1.15 : 1);
      leaves.push([x + Math.cos(a) * 0.02, y + Math.sin(a) * 0.02, a, size, b, t, tw, r(), 0.4 + 0.6 * r(), far]);
    };
    const STEPS = 10; let p = at(0);
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS; const q = at(t);
      wood.push([p[0], p[1], (i - 1) / STEPS, 0, q[0], q[1], t, 0, 0.013 - 0.009 * t, far, b, r()]);
      p = q;
    }
    let side = r() < 0.5 ? 1 : -1;
    for (let d = 0.14 + 0.08 * r(); d < len; d += 0.05 + 0.05 * r()) {
      const t = d / len; const [x, y] = at(t); side = -side;
      const dir = Math.atan2(ty, tx) + side * (40 + 28 * r()) * RAD;
      const tl = (0.16 + 0.24 * r()) * (1 - 0.4 * t);
      // a twig: out from the bough, bending down toward its end
      const bend = 0.5 * r() * Math.sign(Math.cos(dir) || 1);
      const tp = (s) => { const a = dir + bend * s; return [x + Math.cos(a) * tl * s, y + Math.sin(a) * tl * s + 0.03 * s * s]; };
      const mid = tp(0.5); const end = tp(1);
      wood.push([x, y, t, 0, mid[0], mid[1], t, 0.5, 0.004, far, b, r()], [mid[0], mid[1], t, 0.5, end[0], end[1], t, 1, 0.003, far, b, r()]);
      let ls = 1;
      for (let s = 0.18 + 0.14 * r(); s < 1; s += 0.13 + 0.12 * r()) { const c = tp(s); ls = -ls; leaf(c[0], c[1], dir + bend * s + ls * (45 + 25 * r()) * RAD, t, s); }
      leaf(end[0], end[1], dir + bend, t, 1);
      leaf(x, y, dir + Math.PI * (0.7 + 0.5 * r()), t, 0.1);
    }
    leaf(ex, ey, Math.atan2(ty, tx), 1, 0.3);
  });
  return { leaves, wood };
}
export const TREE = growTree();

export function createRoom(options) {
  let cfg = options;
  // g: the geometry of the picture, in CSS px, set by fit(). st: how things stand now.
  const g = {
    W: 0, H: 0, ppm: 1, floorY: 0, cam: { x: 0, y: 0, z: 1 }, pen: 1, Dz: 1,
    open: { l: 0, t: 0, r: 1, b: 1 }, bars: [], skirt: { h: 1, d: 1 }, clear: { l: 0, t: 0, r: 0, b: 0 },
    curt: { x: 0, y: 0, kx: 1, ky: 1 }, tree: { x: 0, y: 0 },
  };
  const st = {
    t: 0, breeze: 0, gustAt: -100, nextGust: 6,
    field: new Float32Array(FW * FH * 4),   // per cell: how far the air has pushed things (x, y, m), how stirred it is, 0
    fv: new Float32Array(FW * FH * 2),
    bough: new Float32Array(BOUGHS * 2), bv: new Float32Array(BOUGHS * 2),   // each bough's tip: how far it has swung, m
    cloth: null,
    crystals: [],   // { u, v: where in the glass its shadow hangs (0..1) | th, om: its turn about the thread | sx, sz, vx, vz: its swing, m | ... }
    beams: new Float32Array(BEAMS * 8), nBeams: 0,   // per spectrum: red end x, y, violet end x, y (px), half width px, light, 0, 0
    events: [],     // for the sound: { kind: 'hang' | 'tap' | 'rush', x }
  };
  let made = 0; let drawn = 3; let opened = false;   // crystals hung so far; the next of the button's spots; whether the scene has its first three

  // ---- the curtain: a sheer, gathered to less than half its width on a rod above the glass, as a net of threads
  // (metres from the rod's left end; z is out into the room). Verlet: each point remembers where it was.
  const makeCloth = (w, h) => {
    const full = w * 1.55;  // how wide the cloth is, laid flat: half as much again as the rod it is gathered on
    const dx = full / (NX - 1); const dy = h / (NY - 1); const n = NX * NY;
    const p = new Float32Array(n * 3); const q = new Float32Array(n * 3); const uv = new Float32Array(n * 2);
    // Gathered on the rod, the cloth runs in waves, out into the room and back, and no two folds are as wide or as
    // deep. How deep they must be follows from how much cloth there is for the width: found by trying.
    const wave = (i) => Math.sin(i * 0.92 + 1.1 * Math.sin(i * 0.37 + 1.0)) * (0.7 + 0.5 * hash(Math.floor(i / 3.4) * 5.3));
    const px = [0]; const pz = [0]; let lo = 0; let hi = dx * 4;
    for (let it = 0; it < 30; it++) {
      const amp = (lo + hi) / 2; let x = 0; let fits = true;
      for (let i = 0; i < NX - 1; i++) { const dz = amp * (wave(i + 1) - wave(i)); if (Math.abs(dz) >= dx) { fits = false; break; } x += Math.sqrt(dx * dx - dz * dz); }
      if (fits && x > w) lo = amp; else hi = amp;
    }
    for (let i = 0; i < NX; i++) { pz[i] = lo * wave(i); if (i) px[i] = px[i - 1] + Math.sqrt(Math.max(0, dx * dx - (pz[i] - pz[i - 1]) ** 2)); }
    let mean = 0; for (const z of pz) mean += z / NX;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3;
        p[k] = q[k] = px[i]; p[k + 1] = q[k + 1] = j * dy; p[k + 2] = q[k + 2] = pz[i] - mean + 0.05;
        uv[(j * NX + i) * 2] = i * dx; uv[(j * NX + i) * 2 + 1] = j * dy;
      }
    }
    // Threads: along and across (a thread does not stretch, and a sheer hardly pushes back when it is squeezed),
    // the two diagonals, and every second point, which is what keeps a fold a curve.
    const cons = [];
    const link = (a, b, stiff, both) => { const ka = a * 3; const kb = b * 3; cons.push(a, b, Math.hypot(p[ka] - p[kb], p[ka + 1] - p[kb + 1], p[ka + 2] - p[kb + 2]), stiff, both); };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * NX + i;
        if (i + 1 < NX) link(a, a + 1, 1, 1);
        if (j + 1 < NY) link(a, a + NX, 1, 0);
        if (i + 1 < NX && j + 1 < NY) { link(a, a + NX + 1, 0.35, 0); link(a + 1, a + NX, 0.35, 0); }
        if (i + 2 < NX) link(a, a + 2, 0.08, 1);
        if (j + 2 < NY) link(a, a + 2 * NX, 0.3, 1);
      }
    }
    const index = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i; index.push(a, a + 1, a + NX, a + 1, a + NX + 1, a + NX); }
    return { w: px[NX - 1], h, full, p, q, uv, nrm: new Float32Array(n * 3), cons: new Float32Array(cons), index: new Uint16Array(index), carry: 0 };   // w: as wide as its folds left it
  };
  // Which way the cloth faces at each point (not made unit length: the renderer does that between the threads).
  // From it comes how much cloth the light has to cross there: one layer met squarely is thin, a layer met aslant
  // is thicker by one over the cosine, and where a fold turns edge-on to the sun it is a dark line.
  const facing = (c) => {
    const { p, nrm } = c;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = (j * NX + Math.max(i - 1, 0)) * 3; const b = (j * NX + Math.min(i + 1, NX - 1)) * 3;
        const u = (Math.max(j - 1, 0) * NX + i) * 3; const d = (Math.min(j + 1, NY - 1) * NX + i) * 3;
        const ax = p[b] - p[a]; const ay = p[b + 1] - p[a + 1]; const az = p[b + 2] - p[a + 2];
        const bx = p[d] - p[u]; const by = p[d + 1] - p[u + 1]; const bz = p[d + 2] - p[u + 2];
        const k = (j * NX + i) * 3; const nx = ay * bz - az * by; const ny = az * bx - ax * bz; const nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
        nrm[k] = nx / l; nrm[k + 1] = ny / l; nrm[k + 2] = nz / l;
      }
    }
  };
  const STEP = 1 / 90;     // s: the cloth's own step, whatever the frame rate
  const stepCloth = (c, t, breeze) => {
    const { p, q, cons } = c; const dt2 = STEP * STEP;
    for (let j = 1; j < NY; j++) {   // the top row is sewn to the rod
      // A sheer weighs next to nothing: a draught that would not move a page pushes it harder than its own weight
      // pulls. It comes in waves that run down the cloth, never two alike, and the air it has to move slows it at once.
      const wave = 0.45 + 0.8 * noise(j * 0.09 - t * 0.8) + 0.25 * Math.sin(j * 0.31 - t * 2.1);
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3;
        const sx = g.curt.x + p[k] * g.curt.kx - KX * p[k + 2] * g.ppm; const sy = g.curt.y + p[k + 1] * g.curt.ky - KY * p[k + 2] * g.ppm;   // where this point's shadow is: nearer the wall, less far along the light
        const f = fieldAt(sx, sy);
        const push = breeze * wave * (0.8 + 0.4 * noise(i * 0.23 + 3 + t * 0.5));
        const ax = 1.0 * push + f[0] * 60; const az = 4.3 * push + f[2] * 7 + Math.abs(f[0]) * 40;
        const vx = (p[k] - q[k]) * 0.972; const vy = (p[k + 1] - q[k + 1]) * 0.972; const vz = (p[k + 2] - q[k + 2]) * 0.972;
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
        p[k] += vx + ax * dt2; p[k + 1] += vy + 9.81 * dt2; p[k + 2] += vz + az * dt2;
        if (p[k + 2] < -0.035) p[k + 2] = -0.035;   // the glass is behind it
      }
    }
    for (let it = 0; it < 5; it++) {
      for (let m = 0; m < cons.length; m += 5) {
        const a = cons[m]; const b = cons[m + 1]; const ka = a * 3; const kb = b * 3;
        const ex = p[kb] - p[ka]; const ey = p[kb + 1] - p[ka + 1]; const ez = p[kb + 2] - p[ka + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9;
        if (d < cons[m + 2] && !cons[m + 4]) continue;
        const pinA = a < NX; const pinB = b < NX; if (pinA && pinB) continue;
        const s = (d - cons[m + 2]) / d * cons[m + 3] * (pinA || pinB ? 1 : 0.5);
        if (!pinA) { p[ka] += ex * s; p[ka + 1] += ey * s; p[ka + 2] += ez * s; }
        if (!pinB) { p[kb] -= ex * s; p[kb + 1] -= ey * s; p[kb + 2] -= ez * s; }
      }
    }
  };

  // ---- the wind. One breeze for the whole street, 0 still to about 1.5 in a gust: slow swells of unrelated
  // lengths, and now and then a gust that rises fast and dies slowly.
  const breezeAt = (t) => {
    const swell = 0.36 + 0.2 * Math.sin(t * 0.23 + 1.3) + 0.14 * Math.sin(t * 0.071 + 4.1) + 0.1 * Math.sin(t * 0.57 + 0.4) + 0.07 * Math.sin(t * 1.31 + 2.2);
    const a = t - st.gustAt; const gust = a < 0 ? 0 : smooth(0, 0.5, a) * Math.exp(-Math.max(0, a - 0.5) / 2.2);
    return Math.max(0, swell + 1.1 * gust) * cfg.breeze;
  };

  // ---- the pointer's breeze: a grid of cells over the frame, each a small spring. Reading it (in px):
  const out = [0, 0, 0];
  function fieldAt(x, y) {
    const fx = clamp(x / g.W * FW - 0.5, 0, FW - 1.001); const fy = clamp(y / g.H * FH - 0.5, 0, FH - 1.001);
    const i = Math.floor(fx); const j = Math.floor(fy); const u = fx - i; const v = fy - j; const f = st.field;
    const a = (j * FW + i) * 4; const b = a + 4; const c = a + FW * 4; const d = c + 4;
    for (let k = 0; k < 3; k++) out[k] = (f[a + k] * (1 - u) + f[b + k] * u) * (1 - v) + (f[c + k] * (1 - u) + f[d + k] * u) * v;
    return out;
  }
  // ptr: { x, y, vx, vy } in px and px/s, or null
  const stepField = (dt, ptr) => {
    const f = st.field; const fv = st.fv; const reach = cfg.reach; let live = false;
    const k = 60; const c = 5;   // the spring that brings a pushed leaf back, and the air that slows it (per s² and per s)
    const speed = ptr ? Math.hypot(ptr.vx, ptr.vy) : 0;
    for (let j = 0; j < FH; j++) {
      for (let i = 0; i < FW; i++) {
        const m = j * FW + i; const a = m * 4; let wantX = 0; let wantY = 0; let stir = 0;
        if (ptr) {
          const d = Math.hypot((i + 0.5) / FW * g.W - ptr.x, (j + 0.5) / FH * g.H - ptr.y) / reach;
          if (d < 1) {
            const fall = (1 - d) * (1 - d);
            // things go the way the hand goes, by at most a hand's width; and a hand that only rests there still stirs the air
            wantX = clamp(ptr.vx * 0.00022, -0.09, 0.09) * fall; wantY = clamp(ptr.vy * 0.00022, -0.09, 0.09) * fall;
            stir = fall * (0.5 + Math.min(1.2, speed / 700));
          }
        }
        fv[m * 2] += ((wantX - f[a]) * k - fv[m * 2] * c) * dt; fv[m * 2 + 1] += ((wantY - f[a + 1]) * k - fv[m * 2 + 1] * c) * dt;
        f[a] += fv[m * 2] * dt; f[a + 1] += fv[m * 2 + 1] * dt;
        f[a + 2] += (stir - f[a + 2]) * (1 - Math.exp(-dt / (stir > f[a + 2] ? 0.12 : 1.1)));   // quick to rise, slow to settle
        if (Math.abs(f[a]) + Math.abs(f[a + 1]) + f[a + 2] > 1e-4) live = true;
      }
    }
    return live;
  };

  // ---- the boughs: each tip a spring that the breeze leans on, so it overshoots and comes back
  const stepBoughs = (dt, breeze) => {
    for (let b = 0; b < BOUGHS; b++) {
      const [sx, sy, ex, ey] = BOUGH[b];
      const f = fieldAt(g.tree.x + (sx + ex) * 0.5 * g.ppm, g.tree.y + (sy + ey) * 0.5 * g.ppm);
      const lean = breeze * (0.35 + 0.9 * noise(st.t * 0.43 + b * 9.1));   // no two boughs get the same wind
      const wantX = -0.075 * lean + f[0] * 0.8; const wantY = 0.03 * lean * (noise(st.t * 0.31 + b * 4.7) - 0.3) + f[1] * 0.8;
      const w = (0.5 + 0.34 * hash(b * 5.3)) * Math.PI * 2; const k = w * w; const c = 2 * 0.16 * w;
      st.bv[b * 2] += ((wantX - st.bough[b * 2]) * k - st.bv[b * 2] * c) * dt; st.bv[b * 2 + 1] += ((wantY - st.bough[b * 2 + 1]) * k - st.bv[b * 2 + 1] * c) * dt;
      st.bough[b * 2] += st.bv[b * 2] * dt; st.bough[b * 2 + 1] += st.bv[b * 2 + 1] * dt;
    }
  };

  // ---- the crystals
  const shadowOf = (c) => ({   // where its shadow is now, px: its place in the glass, and its swing carried along the light
    x: g.open.l + c.u * (g.open.r - g.open.l) + (c.sx - KX * c.sz) * g.ppm,
    y: g.open.t + c.v * (g.open.b - g.open.t) - KY * c.sz * g.ppm,
  });
  // The lens sees a point of the floor where its line of sight meets the wall plane.
  const seen = (x, y, z) => { const k = g.cam.z / (g.cam.z - z); return [g.cam.x + (x - g.cam.x) * k, g.cam.y + (y - g.cam.y) * k, k]; };
  const d0 = [-SUN[0], -SUN[1], -SUN[2]]; const n1 = [0, 0, 0]; const n2 = [0, 0, 0]; const m2 = [0, 0, 0]; const d1 = [0, 0, 0]; const dr = [0, 0, 0]; const dv = [0, 0, 0];
  const land = (sx, sy, d) => {   // where a ray from the crystal comes down: on the wall, or on the floor before it
    if (d[2] > -0.05) return null;
    const t = g.Dz / -d[2]; const x = sx + d[0] * t; const y = sy + d[1] * t;
    if (y <= g.floorY) return [x, y, t, 1, -d[2]];
    if (d[1] <= 0) return null;
    const tf = (g.floorY - sy) / d[1]; const z = g.Dz + d[2] * tf;
    if (z > g.cam.z * 0.9) return null;
    const s = seen(sx + d[0] * tf, g.floorY, z);
    return [s[0], s[1], tf, s[2], d[1]];
  };
  // The spectra one crystal throws, turned to `th`: for every pair of facets that makes a prism, follow the red end
  // and the violet end of the sunlight in through one and out through the other, and see where each comes down.
  // emit(ax, ay, bx, by, halfWidth, light) is called for each that lands; returns how much of it shows in the frame's shade.
  const cast = (c, th, emit) => {
    const s = shadowOf(c); const sx = s.x - KX * g.Dz; const sy = s.y - KY * g.Dz;   // the crystal itself, back along the light
    const co = Math.cos(th); const si = Math.sin(th); let score = 0;
    const turn = (f, o) => { o[0] = f[0] * co + f[2] * si; o[1] = f[1]; o[2] = -f[0] * si + f[2] * co; };
    for (const pr of PRISMS) {
      turn(FACETS[pr[0]], n1); turn(FACETS[pr[1]], n2);
      const cin = -(d0[0] * n1[0] + d0[1] * n1[1] + d0[2] * n1[2]);
      if (cin < 0.04) continue;   // the facet faces away from the sun
      m2[0] = -n2[0]; m2[1] = -n2[1]; m2[2] = -n2[2];
      if (!refract(d0, n1, 1 / N_RED, d1) || d1[0] * n2[0] + d1[1] * n2[1] + d1[2] * n2[2] <= 0 || !refract(d1, m2, N_RED, dr)) continue;
      const across = Math.max(0, d1[0] * (pr[2] * co + pr[4] * si) + d1[1] * pr[3] + d1[2] * (-pr[2] * si + pr[4] * co));   // does the light inside head for the second facet?
      if (!refract(d0, n1, 1 / N_VIOLET, d1) || !refract(d1, m2, N_VIOLET, dv)) continue;   // violet bends more, and is the first to be trapped
      const cout = dv[0] * n2[0] + dv[1] * n2[1] + dv[2] * n2[2];
      const w = smooth(0.04, 0.3, cin) * cin * across * across * smooth(0.03, 0.22, cout);
      if (w < 0.01) continue;
      const a = land(sx, sy, dr); const b = land(sx, sy, dv);
      if (!a || !b || (a[3] === 1) !== (b[3] === 1)) continue;
      // The patch is the sun's own image, drawn out into its colours: as wide as the sun looks from there.
      const path = (a[2] + b[2]) * 0.5; const hw = (0.5 * DISC * path + 0.004 * g.ppm) * a[3];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const area = (len + 2 * hw) * 2 * hw / (g.ppm * g.ppm) / Math.max(0.2, a[4]);   // m² of wall it is spread over; more where it lands aslant
      const light = w * FACET / area;
      const mx = (a[0] + b[0]) * 0.5; const my = (a[1] + b[1]) * 0.5;
      const inFrame = mx > 0 && mx < g.W && my > 0 && my < g.H;
      const inSun = mx > g.open.l && mx < g.open.r && my > g.open.t && my < g.open.b;
      if (inFrame) score += light * (inSun ? 0.15 : 1);
      if (emit && mx > -200 && mx < g.W + 200 && my > -200 && my < g.H + 200) emit(a[0], a[1], b[0], b[1], hw, light * c.k);
    }
    return score;
  };
  // Of all a crystal throws, only its PER strongest spectra are drawn: the rest are too faint to photograph, and a
  // window full of crystals would otherwise cover the wall in confetti. The cut-off is soft, so none pops in or out.
  const PER = 10; const found = [];
  const beams = () => {
    const B = st.beams; let n = 0;
    const emit = (ax, ay, bx, by, hw, light) => { found.push([ax, ay, bx, by, hw, light]); };
    for (const c of st.crystals) {
      if (c.k <= 0.01) continue;
      found.length = 0; cast(c, c.th, emit);
      found.sort((a, b) => b[5] - a[5]);
      const floor = found.length > PER ? found[PER][5] : 0;   // the light of the first one left out
      for (let i = 0; i < Math.min(PER, found.length) && n < BEAMS; i++) {
        const f = found[i]; const k = n++ * 8;
        B[k] = f[0]; B[k + 1] = f[1]; B[k + 2] = f[2]; B[k + 3] = f[3]; B[k + 4] = f[4]; B[k + 5] = f[5] * smooth(floor, floor * 1.5 + 1e-6, f[5]);
      }
    }
    st.nBeams = n;
  };
  // A thread has no way it would rather hang, so the one it settles to is the photographer's to choose: the turn
  // (of forty-eight) that puts the most colour on the shaded wall.
  const rest = (c) => { let best = 0; let top = -1; for (let i = 0; i < 48; i++) { const th = i / 48 * Math.PI * 2 + c.seed; const s = cast(c, th, null); if (s > top) { top = s; best = th; } } return best; };

  const place = (x, y) => {
    const o = g.open; const m = 0.05 * g.ppm; const low = Math.min(o.b, g.floorY - g.skirt.h) - m;
    return { u: (clamp(x, o.l + m, o.r - m) - o.l) / (o.r - o.l), v: (clamp(y, o.t + m, low) - o.t) / (o.b - o.t) };
  };
  // x, y: where on the wall its shadow is to hang (it is moved into the light if that is in the shade).
  // quiet: it has hung there a while (the ones the scene opens with, and any hung while nothing moves).
  const hang = (x, y, quiet) => {
    const id = made++; const { u, v } = place(x, y);
    const c = { id, u, v, seed: hash(id * 3.7) * 6.283, th: 0, om: 0, home: 0, sx: 0, sz: 0, vx: 0, vz: 0, k: quiet ? 1 : 0, gone: 0, born: st.t, len: 0, period: 9 + 6 * hash(id * 1.9) };
    c.len = Math.max(0.12, (v * (g.open.b - g.open.t)) / g.ppm + 0.06);   // its thread, from the head of the frame
    c.home = rest(c); c.th = c.home;
    if (!quiet) {   // let go of by a hand: it spins, winds its thread up and unwinds again, and swings a little
      c.om = (hash(id * 7.1) < 0.5 ? -1 : 1) * (1.3 + 0.7 * hash(id * 2.3)); c.vx = (hash(id * 5.9) - 0.5) * 0.24; c.vz = 0.08;
    }
    st.crystals.push(c);
    const live = st.crystals.filter((k) => !k.gone);
    if (live.length > cfg.crystals) live[0].gone = quiet ? 2 : 1;   // the window is full: the oldest is taken down
    if (quiet) st.crystals = st.crystals.filter((k) => k.gone < 2);
    st.events.push({ kind: 'hang', x: shadowOf(c).x });
    beams();
    return c;
  };
  const stepCrystals = (dt, breeze) => {
    for (const c of st.crystals) {
      c.k += ((c.gone ? 0 : 1) - c.k) * (1 - Math.exp(-dt / 0.25));
      const s = shadowOf(c); const f = fieldAt(s.x, s.y);
      // its turn: the thread twists back toward where it hangs at rest, weakly; the air slows a fast spin quickly
      // and a slow one hardly at all, and every breath of wind nudges it, so it is never quite still
      const w = Math.PI * 2 / c.period;
      const nudge = (breeze * (noise(st.t * 0.37 + c.seed * 5) - 0.5) * 1.6 + f[2] * (noise(st.t * 1.3 + c.seed) - 0.5) * 9 + f[0] * 40);
      c.om += (-(c.th - c.home) * w * w - c.om * (0.035 + 0.11 * Math.abs(c.om)) + nudge * 0.22) * dt;
      c.th += c.om * dt;
      // its swing: a pendulum on its thread
      const k = 9.81 / c.len; const damp = 0.5;
      // (cut glass is heavy: a breeze that lifts the curtain off the sill moves it a finger's width)
      const ax = -c.sx * k - c.vx * damp + breeze * (noise(st.t * 0.9 + c.seed * 3) - 0.35) * 0.5 + f[0] * 5 + f[2] * (noise(st.t * 2.1 + c.seed) - 0.5) * 0.6;
      const az = -c.sz * k - c.vz * damp + breeze * 0.35 * noise(st.t * 0.7 + c.seed * 8) + f[2] * 0.35;
      c.vx += ax * dt; c.vz += az * dt; c.sx += c.vx * dt; c.sz += c.vz * dt;
      if (c.sz < -0.03) { c.sz = -0.03; if (c.vz < -0.12) st.events.push({ kind: 'tap', x: s.x, hard: -c.vz }); c.vz *= -0.4; }   // it touches the glass
    }
    if (st.crystals.some((c) => c.gone && c.k < 0.02)) st.crystals = st.crystals.filter((c) => !(c.gone && c.k < 0.02));
  };

  const room = {
    g, st,
    // quiet: nothing moves (reduced motion), so no loop will fade a crystal that is taken down: it goes at once, as
    // one does that is taken down by hang() when quiet.
    setOptions(o, quiet = false) {
      cfg = o; let live = st.crystals.filter((k) => !k.gone);
      while (live.length > cfg.crystals) { live[0].gone = quiet ? 2 : 1; live = live.slice(1); }
      if (quiet) st.crystals = st.crystals.filter((k) => k.gone < 2);
    },
    // Lay the picture out round the headline. title: { l, t, r, b, em } in px (em: the size of its type).
    // The glass is placed so that the lettering on it falls where the page put the headline. Returns true when the
    // box is a new one. The crystals keep their places in the glass through any of this.
    fit(W, H, title) {
      const fresh = W !== g.W || H !== g.H; g.W = W; g.H = H;
      const frame = 1.9 + 0.55 * clamp((1.25 - W / H) / 0.7, 0, 1);   // m of wall and floor from top to bottom: an upright frame stands further back
      const ppm = g.ppm = H / frame; const em = title.em;
      g.floorY = H - 0.21 * ppm;
      g.cam.x = W * 0.5 - 0.4 * ppm; g.cam.y = g.floorY - 1.25 * ppm; g.cam.z = 2.7 * ppm;   // the lens: eye height, a step to the left of the light's path
      g.skirt.h = 0.115 * ppm; g.skirt.d = 0.02 * ppm;
      // How far the window is behind the lens follows from how soft the letters are to be.
      g.pen = clamp(PEN * em, 0.016 * ppm, 0.036 * ppm); g.Dz = g.pen / DISC * SUN[2];
      const o = g.open;
      const side = Math.min(2.3 * em, Math.max(0.9 * em, title.l - 0.03 * W));   // room for the curtain, where the frame has it
      o.l = title.l - side; o.r = title.r + 0.9 * em; o.b = g.floorY + 0.5 * em;
      const up = Math.min(1, Math.max(0.3, (title.t - 0.05 * H) / (2.95 * em)));   // a low frame has less wall above the headline
      const bar = title.t - 1.35 * em * up; o.t = bar - 1.6 * em * up;
      // The glazing: a transom across, and the lights above it divided into panes about 40 cm wide.
      const tb = 0.027 * ppm; const gb = 0.015 * ppm; const panes = clamp(Math.round((o.r - o.l) / (0.42 * ppm)), 2, 6);
      g.bars = [{ l: o.l - 9, r: o.r + 9, t: bar - tb, b: bar + tb }];
      for (let i = 1; i < panes; i++) { const x = o.l + (o.r - o.l) * i / panes; g.bars.push({ l: x - gb, r: x + gb, t: o.t - 9, b: bar }); }
      g.clear = { l: title.l - 0.3 * em, t: title.t - 0.25 * em, r: title.r + 0.15 * em, b: title.b + 0.3 * em };
      g.tree.x = o.r; g.tree.y = o.t;
      // The curtain hangs from a rod just above the glass, at its left, down to a hand above the skirting.
      g.curt.x = o.l - 0.1 * ppm; g.curt.y = o.t - 0.1 * ppm;
      if (!st.cloth) {
        st.cloth = makeCloth(CLOTH_W, CLOTH_H);
        for (let i = 0; i < 110; i++) stepCloth(st.cloth, i * STEP, 0.3 * cfg.breeze);   // let it hang a while before anyone looks
        facing(st.cloth);
      }
      g.curt.kx = clamp(side * 0.72, 0.2 * ppm, 0.4 * ppm) / st.cloth.w; g.curt.ky = (g.floorY - 0.33 * ppm - g.curt.y) / CLOTH_H;
      if (!opened) {   // the crystals the scene opens with, where they catch the light
        opened = true;
        [[0.63, 0.12], [0.9, 0.5], [0.72, 0.9]].forEach(([u, v]) => hang(o.l + u * (o.r - o.l), o.t + v * (Math.min(o.b, g.floorY - g.skirt.h) - o.t), true));
        st.events.length = 0;
      } else if (fresh) {   // a new box: they keep their places in the glass, and each is turned to suit the new wall
        for (const c of st.crystals) { const was = c.home; c.home = rest(c); c.th += c.home - was; }
      }
      beams();
      return fresh;
    },
    // dt: s. ptr: the pointer as { x, y, vx, vy } in px and px/s, or null. Returns true while the pointer's breeze has not died away.
    step(dt, ptr) {
      st.t += dt;
      if (st.t > st.nextGust) { st.gustAt = st.t; st.nextGust = st.t + 9 + 16 * hash(Math.floor(st.t) * 0.37); st.events.push({ kind: 'rush', x: g.W * 0.7 }); }
      const breeze = st.breeze = breezeAt(st.t);
      const live = stepField(dt, ptr);
      stepBoughs(dt, breeze);
      const c = st.cloth; c.carry = Math.min(c.carry + dt, 4 * STEP);
      while (c.carry >= STEP) { c.carry -= STEP; stepCloth(c, st.t - c.carry, breeze); }
      facing(c);
      stepCrystals(dt, breeze);
      beams();
      return live;
    },
    // The moment a still shows, and the one the live scene starts from: the clock set, every bough leaning as that
    // moment's breeze would hold it, nothing in motion.
    pose(t) {
      st.t = t; st.gustAt = -100; st.nextGust = t + 7; const breeze = st.breeze = breezeAt(t);
      for (let b = 0; b < BOUGHS; b++) { st.bough[b * 2] = -0.075 * breeze * (0.35 + 0.9 * noise(t * 0.43 + b * 9.1)); st.bough[b * 2 + 1] = 0; st.bv[b * 2] = st.bv[b * 2 + 1] = 0; }
      beams();
    },
    hang(x, y, quiet = false) { return hang(x, y, quiet); },
    // The button's spots: a new one each time, the same ones on every load, in the clear glass and off the lettering.
    seeded() {
      const o = g.open; const low = Math.min(o.b, g.floorY - g.skirt.h);
      for (;;) {
        const x = o.l + (0.3 + 0.64 * hash(++drawn * 2.31)) * (o.r - o.l); const y = o.t + (0.05 + 0.9 * hash(drawn * 4.77)) * (low - o.t);
        if (x < g.clear.l || x > g.clear.r || y < g.clear.t || y > g.clear.b) return [x, y];
      }
    },
    gust() { st.gustAt = st.t; st.nextGust = Math.max(st.nextGust, st.t + 8); st.events.push({ kind: 'rush', x: g.W * 0.7 }); },
    shadowOf,
    count: () => st.crystals.filter((k) => !k.gone).length,
    made: () => made,
  };
  return room;
}
