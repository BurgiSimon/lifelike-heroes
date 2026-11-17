// What a visitor draws on the sky: the pencilled constellation under the pointer, the inked and named ones, the
// seeded spot the cue button pins at, the meteor that answers a pin. Pure state: it fills buffers the renderer and
// the label canvas read, and it allocates nothing per frame.
import { clamp } from '../shared/kit.js';

const CAP = 6;                              // pinned constellations kept
const EASE = 200;                           // ms a pencilled line takes to fade in or out
const INK = { stagger: 90, grow: 260 };     // ms: a pinned constellation is inked edge by edge
const LEAVE = 1200;                         // ms the oldest pin takes to fade
const SHOT = 1000;                          // ms a shooting star lasts
const GAP = 5;                              // px an inked line stops short of its stars
const MAX_JOIN = 9;
const EDGE = 108;                           // degrees from the pole where the chart's sky has thinned out (see skyFrag)
const MAX_LINES = 160;
export const LINE_STRIDE = 9;               // ax ay bx by | r g b | width | glow
// Invented catalogue names, in the order they are given out (the cast's world, not the real sky).
const NAMES = ['The Tern', 'The Kiln', 'The Oar', 'The Ladder', 'The Salt Pan', 'The Crane', 'The Lantern', 'The Loom', 'The Anvil', 'The Net', 'The Kettle', 'The Sledge'];
// Where the chart's first constellations sit, as shares of the hero (landscape, portrait).
const FIRST = { wide: [[0.2, 0.25], [0.88, 0.2]], tall: [[0.27, 0.13], [0.26, 0.47]] };

// Liang–Barsky: does the segment touch the box?
const crosses = (x0, y0, x1, y1, b) => {
  let t0 = 0; let t1 = 1; const dx = x1 - x0; const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - b.l], [dx, b.r - x0], [-dy, y0 - b.t], [dy, b.b - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
  }
  return true;
};
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cubicOut = (t) => 1 - (1 - t) ** 3;

export function createChart({ catalog, view, still, status, skyline }) {
  // The selectable stars are the catalogue's brightest: it is sorted by magnitude, so they are its first `nSel`.
  let nMax = 0; while (nMax < catalog.n && catalog.mag[nMax] <= 6.3) nMax++;
  const px = new Float32Array(nMax); const py = new Float32Array(nMax); const clear = new Float32Array(nMax);
  const vis = new Int32Array(nMax); let nVis = 0; let nSel = 0; let magLimit = 5.2;
  const marks = new Float32Array(catalog.n * 2);  // per star: inked share, pencilled share (the star shader reads it)
  const touched = new Int32Array(256); let nTouched = 0;
  const lines = new Float32Array(MAX_LINES * LINE_STRIDE); let nLines = 0;
  const pencil = new Map();   // a * 65536 + b → strength: the constellation under the pointer
  const pins = [];            // { pick, tree, t0, out, n, name, alpha, label, x, y }
  const spots = rng(5);       // where the cue button and action('pin') land
  const hover = { pick: new Int32Array(MAX_JOIN), n: 0, tree: new Int32Array(MAX_JOIN * 2) };
  const score = new Float32Array(MAX_JOIN); const want = new Float64Array(MAX_JOIN); let nWant = 0;
  const done = new Uint8Array(MAX_JOIN);
  const shoot = { on: false, x: 0, y: 0, dx: 0, dy: 0, t0: 0, p: 0 };
  let count = 0; let last = 0; let opened = false;
  let sum = 0; let end = 0; let dirty = true; let dirtyEnd = 0; // what of `marks` changed since the renderer last took it

  // cell is the original's star spacing; here it sets how deep the selectable set goes, so a reach holds about as
  // many stars to choose from as it did (the count of stars triples with each magnitude).
  const limit = (cell) => { magLimit = clamp(5.2 + 4.17 * Math.log10(view.scale / 9.6) - 4.17 * Math.log10(cell / 38), 3.4, 6.3); nSel = 0; while (nSel < nMax && catalog.mag[nSel] <= magLimit) nSel++; };

  // Sky to screen: turn every selectable star about the pole, keep the ones in view above the ridge, and note how
  // far each is from the headline.
  const project = () => {
    const c = Math.cos(view.rot) * view.scale; const s = Math.sin(view.rot) * view.scale; const { sky } = catalog; const b = view.box;
    nVis = 0;
    for (let i = 0; i < nMax; i++) { // every star a pin may hold; only the first nSel can be picked
      const x = view.poleX + sky[i * 2] * c - sky[i * 2 + 1] * s; const y = view.poleY + sky[i * 2] * s + sky[i * 2 + 1] * c;
      px[i] = x; py[i] = y;
      if (i >= nSel || x < -8 || y < -8 || x > view.W + 8 || y > view.H + 8) continue;
      if (sky[i * 2] * sky[i * 2] + sky[i * 2 + 1] * sky[i * 2 + 1] > EDGE * EDGE) continue; // past the chart's edge
      clear[i] = clamp(Math.max(b.l - x, x - b.r, b.t - y, y - b.b) / 26, 0, 1) * (y < skyline(x) - 6 ? 1 : 0);
      vis[nVis++] = i;
    }
  };

  // The brightest stars within reach of a point (distance counts a little), joined as a minimum spanning tree in
  // the order it grows from the first, so an inked constellation can be drawn edge by edge.
  const near = (x, y, join, out) => {
    const reach = view.reach; let n = 0; join = Math.min(join, MAX_JOIN);
    for (let v = 0; v < nVis; v++) {
      const i = vis[v];
      if (clear[i] < 0.6) continue;
      const d = Math.hypot(px[i] - x, py[i] - y);
      if (d >= reach) continue;
      const sc = (magLimit - catalog.mag[i]) / 3.2 - 0.35 * (d / reach);
      let k;                                       // insertion into the short list, best first
      if (n < join) k = n++; else if (sc > score[join - 1]) k = join - 1; else continue;
      while (k > 0 && score[k - 1] < sc) { score[k] = score[k - 1]; out.pick[k] = out.pick[k - 1]; k--; }
      score[k] = sc; out.pick[k] = i;
    }
    out.n = n; done.fill(0); done[0] = 1;
    for (let e = 0; e < n - 1; e++) {
      let best = 1e9; let ba = 0; let bb = 0;
      for (let a = 0; a < n; a++) {
        if (!done[a]) continue;
        for (let b = 0; b < n; b++) { if (done[b]) continue; const d = Math.hypot(px[out.pick[a]] - px[out.pick[b]], py[out.pick[a]] - py[out.pick[b]]); if (d < best) { best = d; ba = a; bb = b; } }
      }
      out.tree[e * 2] = out.pick[ba]; out.tree[e * 2 + 1] = out.pick[bb]; done[bb] = 1;
    }
    return out;
  };

  const mark = (i, slot, v) => { if (marks[i * 2] === 0 && marks[i * 2 + 1] === 0 && nTouched < touched.length) touched[nTouched++] = i; marks[i * 2 + slot] = Math.max(marks[i * 2 + slot], v); };
  const line = (a, b, share, gap, col, alpha, width, glow) => {
    if (nLines >= MAX_LINES) return;
    const dx = px[b] - px[a]; const dy = py[b] - py[a]; const d = Math.hypot(dx, dy) || 1; const cut = d > gap * 3 ? gap / d : 0;
    const to = cut + (1 - 2 * cut) * share; const o = nLines++ * LINE_STRIDE;
    lines[o] = px[a] + dx * cut; lines[o + 1] = py[a] + dy * cut; lines[o + 2] = px[a] + dx * to; lines[o + 3] = py[a] + dy * to;
    lines[o + 4] = col[0] * alpha; lines[o + 5] = col[1] * alpha; lines[o + 6] = col[2] * alpha; lines[o + 7] = width; lines[o + 8] = glow;
  };

  const chart = {
    marks, lines, pins, shoot,
    get nLines() { return nLines; },
    get magLimit() { return magLimit; },
    // The renderer asks once per frame: how much of `marks` (in stars) to upload, 0 when nothing changed.
    takeMarks() { const n = dirty ? dirtyEnd : 0; dirty = false; dirtyEnd = 0; return n; },
    limit,

    // One frame of the chart at time `now` (ms): where everything is, what is lit, which lines to draw.
    update(now, ptr, cfg, tone, pencilCol) {
      const k = still ? 1 : clamp((now - last) / EASE, 0, 1); last = now;
      project();
      const sum0 = sum; const end0 = end;
      for (let t = 0; t < nTouched; t++) { marks[touched[t] * 2] = 0; marks[touched[t] * 2 + 1] = 0; }
      nTouched = 0; nLines = 0;

      // Pencil: the constellation under the pointer, easing in and out.
      nWant = 0;
      if (ptr) { near(ptr.x, ptr.y, cfg.join, hover); for (let e = 0; e < hover.n - 1; e++) { const a = hover.tree[e * 2]; const b = hover.tree[e * 2 + 1]; want[nWant++] = Math.min(a, b) * 65536 + Math.max(a, b); } }
      for (let w = 0; w < nWant; w++) if (!pencil.has(want[w])) pencil.set(want[w], 0);
      for (const [key, v0] of pencil) {
        let on = 0; for (let w = 0; w < nWant; w++) if (want[w] === key) on = 1;
        const v = v0 + (on - v0) * k;
        if (v < 0.01) { pencil.delete(key); continue; }
        pencil.set(key, v);
        const a = Math.floor(key / 65536); const b = key % 65536;
        line(a, b, 1, 0, pencilCol, v * 0.55, 1, 0);
        mark(a, 1, v); mark(b, 1, v);
      }

      // Ink: pinned constellations, drawn edge by edge from the star nearest the click.
      for (let n = pins.length; n--;) {
        const pin = pins[n]; const age = now - pin.t0;
        const alpha = pin.out === undefined ? 1 : 1 - (now - pin.out) / LEAVE;
        if (alpha <= 0) { pins.splice(n, 1); continue; }
        pin.alpha = alpha;
        if (age < 0) { pin.label = 0; continue; }
        mark(pin.pick[0], 0, alpha * clamp(age / 160, 0, 1));
        for (let e = 0; e < pin.tree.length; e += 2) {
          const share = cubicOut(clamp((age - (e / 2) * INK.stagger) / INK.grow, 0, 1));
          if (share <= 0) continue;
          line(pin.tree[e], pin.tree[e + 1], share, GAP, tone, alpha * 0.9, 1.15, alpha * share);
          mark(pin.tree[e + 1], 0, alpha * share ** 3);
        }
        pin.label = alpha * clamp((age - (pin.tree.length / 2) * INK.stagger - INK.grow) / 300, 0, 1);
        let cx = 0; let cy = 0; let lowest = -1e9; let highest = 1e9;
        for (const i of pin.pick) { cx += px[i]; cy += py[i]; lowest = Math.max(lowest, py[i]); highest = Math.min(highest, py[i]); }
        pin.x = cx / pin.pick.length; pin.cy = cy / pin.pick.length; pin.y = lowest + 18; pin.top = highest - 16;
      }

      if (shoot.on) { shoot.p = (now - shoot.t0) / SHOT; if (shoot.p >= 1) shoot.on = false; }

      // The marks reach the GPU only when they changed (a settled chart uploads nothing), and only as far as they go.
      sum = 0; end = 0;
      for (let t = 0; t < nTouched; t++) { const i = touched[t]; sum += (marks[i * 2] + 2 * marks[i * 2 + 1]) * (i + 1); if (i >= end) end = i + 1; }
      if (sum !== sum0 || end !== end0) { dirty = true; dirtyEnd = Math.max(dirtyEnd, end, end0); }
    },

    // Ink the constellation at a point. `delay` staggers the chart's first ones on load; `quiet` skips the shooting
    // star and the announcement for them.
    pin(p, cfg, { delay = 0, quiet = false } = {}) {
      const now = performance.now(); project();
      const got = near(p.x, p.y, cfg.join, { pick: new Int32Array(MAX_JOIN), n: 0, tree: new Int32Array(MAX_JOIN * 2) });
      const pick = Array.from(got.pick.subarray(0, got.n)); const tree = Array.from(got.tree.subarray(0, Math.max(0, got.n - 1) * 2));
      if (pick.length >= 2) {
        const live = pins.filter((q) => q.out === undefined);
        // Mostly the same stars as a pin that is already there: redraw that one under its own name, never a double.
        const twin = live.find((q) => q.pick.filter((i) => pick.includes(i)).length * 2 >= pick.length);
        if (twin) pins.splice(pins.indexOf(twin), 1);
        else {
          if (live.length >= CAP) { if (still) pins.splice(pins.indexOf(live[0]), 1); else live[0].out = now; }
          count += 1;
        }
        const n = twin ? twin.n : count; const name = twin ? twin.name : NAMES[(count - 1) % NAMES.length];
        pins.push({ pick, tree, t0: still ? -1e9 : now + delay, n, name, text: `${String(n).padStart(2, '0')}  ${name.toUpperCase()}`, alpha: 1, label: 0, x: p.x, y: p.y, cy: p.y, top: p.y, out: undefined });
        if (!quiet) status.textContent = `Pinned ${name}, ${pick.length} stars.`;
      }
      if (still || quiet || pick.length < 2) return pick.length >= 2;
      // A meteor crosses the chart, away from the nearer edge.
      const dir = p.x < view.W / 2 ? 1 : -1; const len = Math.min(520, view.W * 0.45);
      Object.assign(shoot, { on: true, x: p.x + dir * 18, y: Math.max(8, p.y - 40), dx: dir * len, dy: len * 0.2, t0: now, p: 0 });
      return true;
    },

    // A seeded spot with stars to join: clear of the headline, the pole, the edges, the land and the pins already
    // there, and none of its lines may run behind the headline. A full chart lets its oldest constellation go to
    // make the room; null when even that finds none.
    spot(cfg) {
      const b = view.box; const probe = { pick: new Int32Array(MAX_JOIN), n: 0, tree: new Int32Array(MAX_JOIN * 2) };
      project();
      // ponytail: seeded rejection sampling, 120 tries. Poisson-disc candidates if a chart ever needs to be packed tight.
      const find = (skip) => { for (let n = 0; n < 120; n++) {
        const p = { x: (0.08 + spots() * 0.84) * view.W, y: (0.12 + spots() * 0.72) * view.H };
        if (p.x > b.l - 50 && p.x < b.r + 50 && p.y > b.t - 50 && p.y < b.b + 50) continue;
        if (Math.hypot(p.x - view.poleX, p.y - view.poleY) < view.ring * 0.7 || p.y > skyline(p.x) - 40) continue;
        near(p.x, p.y, cfg.join, probe);
        if (probe.n < 3) continue;
        const pick = Array.from(probe.pick.subarray(0, probe.n));
        const apart = view.reach * (n < 60 ? 1.3 : 0.75); // room to itself first; on a small chart, a neighbour's elbow
        if (pins.some((q) => q !== skip && q.out === undefined && (Math.hypot(q.x - p.x, q.cy - p.y) < apart || q.pick.some((i) => pick.includes(i))))) continue;
        let behind = false;
        for (let e = 0; e < (probe.n - 1) * 2 && !behind; e += 2) behind = crosses(px[probe.tree[e]], py[probe.tree[e]], px[probe.tree[e + 1]], py[probe.tree[e + 1]], b);
        if (!behind) return p;
      } return null; };
      const oldest = pins.find((q) => q.out === undefined);
      let p = find();
      if (!p && oldest && (p = find(oldest))) { if (still) pins.splice(pins.indexOf(oldest), 1); else oldest.out = performance.now(); }
      return p;
    },

    // The chart opens with two constellations already inked, so the first screen says what the pointer is for.
    open(cfg) {
      if (opened) return; opened = true;
      FIRST[view.W > view.H * 0.9 ? 'wide' : 'tall'].forEach(([u, v], n) => chart.pin({ x: u * view.W, y: v * view.H }, cfg, { delay: 500 + n * 700, quiet: true }));
    },

    clear() {
      const now = performance.now();
      if (still) pins.length = 0; else for (const p of pins) p.out ??= now;
      status.textContent = 'Chart cleared.';
    },
  };
  return chart;
}
