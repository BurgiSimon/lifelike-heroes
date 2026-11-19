// The movement's rules: what turns what and how fast, where every arbor stands in the frame, the outlines of the
// plates, where the screws and jewels go, and how wound the spring is. Nothing here draws, so a Node script can
// run it (scripts/train-check.mjs).
//
// Lengths are millimetres in the movement's own plane: x to the right, y up the picture, z from the mainplate's
// floor toward the lens. Angles are radians, anticlockwise as the lens sees them. The frame's centre is (0, 0).
import { clamp, rnd } from '../shared/kit.js';

export const BEAT = 6;   // beats a second: 21,600 an hour, the rate of a large hand-wound movement
// The going train. Each wheel drives the next arbor's pinion: 80/10 × 75/10 is sixty, so the fourth wheel turns
// once a minute for the centre wheel's once an hour; 84/7 is twelve turns of the escape wheel a minute, and its
// fifteen teeth each pass two beats, which is the 360 beats a minute BEAT asks for.
export const TEETH = { barrel: 84, centreP: 12, centre: 80, thirdP: 10, third: 75, fourthP: 10, fourth: 84, escapeP: 7, escape: 15, ratchet: 52, crown: 30 };
const MODULE = { barrel: 0.165, centre: 0.125, third: 0.115, fourth: 0.1, wind: 0.2 };   // pitch diameter over teeth, mm
// How far apart two arbors stand when a wheel meets a pinion: half the sum of their pitch diameters.
export const REACH = {
  barrel: MODULE.barrel * (TEETH.barrel + TEETH.centreP) / 2,
  centre: MODULE.centre * (TEETH.centre + TEETH.thirdP) / 2,
  third: MODULE.third * (TEETH.third + TEETH.fourthP) / 2,
  fourth: MODULE.fourth * (TEETH.fourth + TEETH.escapeP) / 2,
  escape: 3.45,    // escape wheel to pallet arbor
  pallet: 4.35,    // pallet arbor to balance staff
  wind: MODULE.wind * (TEETH.ratchet + TEETH.crown) / 2,
};
// Heights of the top faces above the mainplate's floor, mm.
export const Z = { floor: 0, third: 1.15, escape: 1.3, fork: 1.4, fourth: 1.75, pallet: 1.95, balance: 2.75, spring: 3.1, bridge: 3.7, cock: 4.15, wind: 4.15, click: 4.05 };
export const BALANCE = { rim: 5.3, inner: 4.55, arm: 0.42, screws: 16, head: 0.38, hub: 0.78, springIn: 0.95, springOut: 3.35, turns: 12.5 };   // mm; the rim's screws stand `head` proud of it
const FULL = 300 * Math.PI / 180;      // rad the balance swings each way, fully wound
const SLACK = 150 * Math.PI / 180;     // and with the spring all but down
const RUN = 240;       // s a full wind lasts. ponytail: a real spring runs forty hours and takes forty turns of the crown; this one is short so that winding it shows
const STROKE = 7;      // ratchet teeth one turn of the crown takes up
const STROKES = 6;     // turns of the crown from slack to full
const FLOOR = 0.1;     // the least wind it runs down to: it never stops, so it never loses the time

const polar = (p, r, deg) => [p[0] + r * Math.cos(deg * Math.PI / 180), p[1] + r * Math.sin(deg * Math.PI / 180)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---- outlines: each plate is a list of round-ended bars (a disc is a bar of no length), added or cut in order,
// with a fillet where two meet. The same list is read here (heightAt, the checks) and by the bake shader.
export const PRIMS = 72;   // most bars a layout may hold; the size of the bake shader's arrays
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const bar = (x, y, p) => {
  const ax = p[0]; const ay = p[1]; const bx = p[2] - ax; const by = p[3] - ay; const l2 = bx * bx + by * by;
  const t = l2 > 0 ? clamp(((x - ax) * bx + (y - ay) * by) / l2, 0, 1) : 0;
  return Math.hypot(x - ax - bx * t, y - ay - by * t) - p[4];
};
// Signed distance to plate `level` at (x, y): negative inside. Level 0 (the bridge) starts as the whole plane.
export function sdf(prims, level, x, y) {
  let d = level === 0 ? -1e3 : 1e3;
  for (const p of prims) {
    if (p[5] !== level) continue;
    const dp = bar(x, y, p);
    d = p[6] ? -smin(-d, dp, p[7]) : smin(d, dp, p[7]);
  }
  return d;
}

export function createCaliber() {
  // g: the layout. ppm is CSS px per mm at the bridge's face; hw, hh are the frame's half-width and half-height.
  const g = { W: 0, H: 0, ppm: 50, hw: 13, hh: 8, kind: 'wide', at: {}, prims: [], screws: [], jewels: [], wheels: [] };
  // st: what moves. Angles of everything that turns, the balance's swing now and a moment ago (the shutter is
  // open that long), the fork's side, how wound the spring is.
  const st = { wind: 0.45, swing: 0, balance: 0, balance0: 0, fork: 0, escape: 0, fourth: 0, third: 0, centre: 0, ratchet: 0, crown: 0, click: 0, beat: 0, events: [] };
  let ratchetGoal = 0; let stuck = 0; let ticks = -1; let teeth = 0;

  const add = (x1, y1, x2, y2, r, level, k = 0) => g.prims.push([x1, y1, x2, y2, r, level, 0, k]);
  const cut = (x1, y1, x2, y2, r, level, k = 0) => g.prims.push([x1, y1, x2, y2, r, level, 1, k]);

  // Lays the movement out for a frame of W × H CSS px. title: the headline's box in px (l, t, r, b), or null.
  // The works keep clear of it: the balance and the open train stand above it, the winding wheels to one side.
  function lay(W, H, title) {
    g.W = W; g.H = H;
    g.kind = W >= 1.9 * H ? 'strip' : W <= H ? 'tall' : 'wide';   // style.css moves the headline at the same two shapes
    g.ppm = clamp(Math.min(Math.sqrt(W * H) / 21.5, g.kind === 'tall' ? H / 30 : 1e9), 16, 96);   // upright, the frame is never less than 30 mm tall: works, words and winding wheels each need their share
    g.hw = W / 2 / g.ppm; g.hh = H / 2 / g.ppm;
    const box = title ? { l: (title.l - W / 2) / g.ppm, r: (title.r - W / 2) / g.ppm, t: (H / 2 - title.t) / g.ppm, b: (H / 2 - title.b) / g.ppm } : null;
    g.title = box;
    // The works stand where the frame's shape puts them; if that leaves the words over a window or under a wheel,
    // the works are moved off a little at a time (up, or to the right in a low frame) until the words lie on plain
    // bridge, or the balance would leave the frame.
    for (let off = 0; ; off += 0.4) {
      build(off);
      if (!box || plain(box) || off >= (g.kind === 'strip' ? g.hw : g.hh) - 2.6 - (g.kind === 'strip' ? g.hw - 5.6 : g.hh - 6.3)) break;
    }
    return g;
  }
  // Is the headline's box (and a hair round it) on plain bridge: nothing cut away, set in or lying over it?
  function plain(box) {
    for (let i = 0; i <= 28; i++) for (let j = 0; j <= 6; j++) {
      const x = box.l - 0.3 + (box.r - box.l + 0.6) * i / 28; const y = box.b - 0.3 + (box.t - box.b + 0.6) * j / 6;
      if (sdf(g.prims, 0, x, y) > -0.3 || heightAt(x, y) !== Z.bridge) return false;
      for (const s of g.screws) if (Math.hypot(x - s.x, y - s.y) < s.r * 1.2) return false;
      for (const s of g.jewels) if (Math.hypot(x - s.x, y - s.y) < s.r * 1.9) return false;
    }
    return true;
  }
  function build(off) {
    g.prims.length = 0; g.screws.length = 0; g.jewels.length = 0; g.wheels.length = 0;
    const { hw, hh, title: box } = g; const at = g.at = {};

    // The escapement and the fast end of the train, as a chain of arbors each a fixed reach from the last: only the
    // angles between them are free, and they are what a layout chooses.
    let turn;   // degrees: balance → pallets → escape wheel → fourth → third; the cock's foot from the balance; the crown wheel and the click from the barrel
    if (g.kind === 'tall') { at.balance = [Math.min(hw - 5.6, 2.2), hh - 6.3]; turn = { pallet: 251, escape: 238, fourth: 163, third: 268, foot: 62, crown: -30, click: 28 }; }
    else if (g.kind === 'strip') { at.balance = [hw - 5.6, Math.max(hh - 5.6, 1)]; turn = { pallet: 197, escape: 192, fourth: 100, third: 200, foot: 17, crown: 140, click: -25 }; }
    else { at.balance = [Math.min(hw - 5.5, 10.5), Math.max(hh - 5.6, 1.6)]; turn = { pallet: 197, escape: 192, fourth: 148, third: 240, foot: 17, crown: -80, click: -22 }; }
    at.balance[g.kind === 'strip' ? 0 : 1] += off;
    at.pallet = polar(at.balance, REACH.pallet, turn.pallet);
    at.escape = polar(at.pallet, REACH.escape, turn.escape);
    at.fourth = polar(at.escape, REACH.fourth, turn.fourth);
    at.third = polar(at.fourth, REACH.third, turn.third);
    at.foot = polar(at.balance, 8.25, turn.foot);
    // The barrel (the ratchet wheel rides its arbor) stands where the frame has room; the centre wheel, hidden
    // under the bridge, is wherever its two reaches meet. A layout that puts them out of reach is not a movement.
    at.barrel = g.kind === 'tall' ? polar(at.third, 13.5, 266) : g.kind === 'strip' ? [at.third[0] - 11.6, Math.max(at.third[1] + 3.1, (box ? box.t : -99) + MODULE.wind * TEETH.ratchet / 2 + 0.8)] : [at.fourth[0] - 10.45, at.fourth[1] + 1.3];
    const span = dist(at.third, at.barrel);
    g.reach = [Math.abs(REACH.barrel - REACH.centre), span, REACH.barrel + REACH.centre];
    {
      const a = (REACH.centre ** 2 - REACH.barrel ** 2 + span * span) / (2 * span); const h = Math.sqrt(Math.max(0, REACH.centre ** 2 - a * a));
      const ux = (at.barrel[0] - at.third[0]) / span; const uy = (at.barrel[1] - at.third[1]) / span;
      at.centre = [at.third[0] + a * ux - h * uy * (g.kind === 'tall' ? -1 : 1), at.third[1] + a * uy + h * ux * (g.kind === 'tall' ? -1 : 1)];
    }
    at.crown = polar(at.barrel, REACH.wind, turn.crown);
    at.click = polar(at.barrel, MODULE.wind * TEETH.ratchet / 2 + 1.5, turn.click);
    g.fork = { at: at.pallet, turn: Math.atan2(at.balance[1] - at.pallet[1], at.balance[0] - at.pallet[0]), z: Z.fork };
    g.click = { at: at.click, turn: Math.atan2(at.barrel[1] - at.click[1], at.barrel[0] - at.click[0]), z: Z.click };
    g.stud = turn.foot * Math.PI / 180 + 0.5;   // the hairspring's outer end is held under the cock's arm

    // The bridge: the whole plate, less a window scalloped round each wheel it shows, plus the fingers that carry
    // the fourth and escape wheels' upper jewels, plus a lobe for the third wheel's.
    const [bx, by] = at.balance;
    cut(bx, by, bx, by, BALANCE.rim + BALANCE.head + 0.62, 0, 0.7);
    cut(...at.fourth, ...at.fourth, MODULE.fourth * TEETH.fourth / 2 + 0.6, 0, 0.7);
    cut(...at.escape, ...at.escape, 3.45, 0, 0.7);
    cut(...at.foot, ...at.foot, 2.22, 0, 0.5);
    add(...at.third, ...at.third, 1.75, 0, 0.9);
    add(...at.third, ...at.fourth, 0.92, 0, 0.9);
    add(...at.fourth, ...at.fourth, 1.28, 0, 0.5);
    // the escape wheel's finger comes in from the side away from the balance and the fourth wheel
    const away = Math.atan2(at.escape[1] - (at.balance[1] + at.fourth[1]) / 2, at.escape[0] - (at.balance[0] + at.fourth[0]) / 2);
    at.root = [at.escape[0] + 3.9 * Math.cos(away), at.escape[1] + 3.9 * Math.sin(away)];
    add(...at.root, ...at.escape, 0.8, 0, 0.8);
    add(...at.escape, ...at.escape, 1.08, 0, 0.4);
    // The balance cock: a boss over the staff, an arm, a foot that sits in its own bay of the bridge.
    add(bx, by, bx, by, 1.85, 1, 0);
    add(bx, by, ...at.foot, 1.3, 1, 0.9);
    add(...at.foot, ...at.foot, 2.15, 1, 0.9);
    // The pallet bridge: a bar across the pallet arbor, under the balance, screwed down at both ends.
    const pa = Math.atan2(by - at.pallet[1], bx - at.pallet[0]) + Math.PI / 2; const px = 2.55 * Math.cos(pa); const py = 2.55 * Math.sin(pa);
    at.ends = [[at.pallet[0] + px, at.pallet[1] + py], [at.pallet[0] - px, at.pallet[1] - py]];
    add(...at.ends[0], ...at.ends[1], 0.5, 2, 0);
    for (const e of at.ends) add(...e, ...e, 0.78, 2, 0.5);
    add(...at.pallet, ...at.pallet, 0.7, 2, 0.4);

    // What turns, for the renderer: where, how big, how many teeth, how high.
    g.wheels.push(
      { id: 'third', at: at.third, r: MODULE.third * TEETH.third / 2, teeth: TEETH.third, m: MODULE.third, z: Z.third, spokes: 5 },
      { id: 'fourth', at: at.fourth, r: MODULE.fourth * TEETH.fourth / 2, teeth: TEETH.fourth, m: MODULE.fourth, z: Z.fourth, spokes: 5 },
    );
    g.escape = { at: at.escape, r: 2.8, z: Z.escape };
    g.ratchet = { at: at.barrel, r: MODULE.wind * TEETH.ratchet / 2, teeth: TEETH.ratchet, z: Z.wind };
    g.crown = { at: at.crown, r: MODULE.wind * TEETH.crown / 2, teeth: TEETH.crown, z: Z.wind - 0.05 };

    // Jewels: r is the stone's radius; a chaton is the gold setting round it, held by three blued screws.
    const jewel = (p, z, r, chaton) => g.jewels.push({ x: p[0], y: p[1], z, r, chaton });
    const screw = (p, z, r, kind, i, on) => g.screws.push({ x: p[0], y: p[1], z, r, kind, turn: rnd(i * 7 + 3) * Math.PI, on });
    // a chaton held down by three small blued screws, their heads over its rim
    const held = (p, r, i) => { jewel(p, Z.bridge, r, 1); for (let k = 0; k < 3; k++) screw(polar(p, 2.05 * r, 90 + 120 * k + 40 * rnd(i)), Z.bridge + 0.04, 0.4 * r + 0.1, 0, i * 3 + k + 40); };
    jewel(at.balance, Z.cock, 0.62, 1);
    jewel(at.fourth, Z.bridge, 0.5, 0);
    jewel(at.escape, Z.bridge, 0.44, 0);
    held(at.third, 0.55, 1);
    jewel(at.pallet, Z.pallet, 0.3, 0);
    if (clear(at.centre, 1.6)) held(at.centre, 0.6, 2);

    // Screws. Those the works need stand where the works put them; the bridge's own are tried at a list of spots
    // and kept where there is plate under them and nothing over them.
    screw(at.foot, Z.cock, 0.92, 0, 1);
    screw(at.ends[0], Z.pallet, 0.46, 1, 2); screw(at.ends[1], Z.pallet, 0.46, 1, 3);
    screw(at.barrel, Z.wind + 0.12, 1.25, 1, 4, 'ratchet');   // this one is screwed into the barrel's arbor, and turns with it
    screw(polar(at.crown, 0.95, 40), Z.wind + 0.1, 0.42, 1, 5); screw(polar(at.crown, 0.95, 220), Z.wind + 0.1, 0.42, 1, 6);
    screw(at.click, Z.click + 0.05, 0.5, 1, 7);
    const spots = g.kind === 'tall'
      ? [[hw - 1.9, -hh + 4.2], [-hw + 2.0, 1.0], [hw - 2.2, -1.2], [-hw + 2.2, hh - 1.6], [0.5, -hh + 2.6]]
      : [[hw - 2.4, -hh + 2.6], [at.root[0] + 1.4, at.root[1] - 1.9], [-hw + 2.3, -hh + 2.3], [at.third[0] - 0.4, at.third[1] - 3.4], [hw - 2.1, at.balance[1] - 7.6], [0.2 * hw, -hh + 2.1], [at.fourth[0] - 0.6, hh - 1.25]];
    spots.forEach((p, i) => { if (clear(p, 1.25)) screw(p, Z.bridge, 0.9, 0, 10 + i); });
  }
  // Is there bridge under a disc of radius r at p, with no wheel on top of it, and is it clear of the headline?
  function clear(p, r) {
    if (sdf(g.prims, 0, p[0], p[1]) > -(r + 0.3)) return false;
    for (const w of [g.ratchet, g.crown]) if (w && dist(p, w.at) < w.r + r + 0.45) return false;
    for (const s of g.screws) if (Math.hypot(p[0] - s.x, p[1] - s.y) < r + s.r + 0.6) return false;
    for (const j of g.jewels) if (Math.hypot(p[0] - j.x, p[1] - j.y) < r + j.r * 2.4 + 0.5) return false;
    const b = g.title;
    return !(b && p[0] > b.l - r - 0.5 && p[0] < b.r + r + 0.5 && p[1] > b.b - r - 0.4 && p[1] < b.t + r + 0.4);
  }

  // The top face the lens meets at (x, y): what a pointer over that spot is pointing at.
  function heightAt(x, y) {
    for (const w of [g.ratchet, g.crown]) if (dist([x, y], w.at) < w.r) return w.z;
    if (sdf(g.prims, 1, x, y) < 0) return Z.cock;
    if (sdf(g.prims, 0, x, y) < 0) return Z.bridge;
    if (dist([x, y], g.at.balance) < BALANCE.rim) return Z.balance;
    for (const w of [...g.wheels].reverse()) if (dist([x, y], w.at) < w.r) return w.z;
    if (dist([x, y], g.escape.at) < g.escape.r) return Z.escape;
    return Z.floor;
  }

  // Where everything stands at clock time t (seconds; a day's worth is plenty), having moved for dt. open: how long
  // the shutter was open, s, for a still (a frame's is worked out from dt).
  // The beat is the clock's: beat n falls at n / BEAT seconds, the balance passes its dead point then, the fork
  // goes over, the escape wheel drops half a tooth and the train follows.
  const DROP = 0.14;   // of a beat the escape wheel takes to move: about 23 ms
  function step(dt, t, open) {
    st.events.length = 0;
    // the spring: it runs down slowly, and the swing follows its force with a balance's inertia
    st.wind = Math.max(FLOOR, st.wind - dt / RUN);
    const want = SLACK + (FULL - SLACK) * Math.sqrt(st.wind);
    st.swing = st.swing ? st.swing + (want - st.swing) * (1 - Math.exp(-dt / 1.4)) : want;
    const b = t * BEAT; const n = Math.floor(b); const f = b - n; const s = clamp(f / DROP, 0, 1); const e = s * s * (3 - 2 * s);
    const shutter = (open ?? Math.min(dt, 1 / 30) * 0.5) * BEAT;   // beats the shutter was open: half the frame, as a film camera's, unless the caller says how long
    st.balance = st.swing * Math.sin(Math.PI * b); st.balance0 = st.swing * Math.sin(Math.PI * (b - shutter));
    const side = n % 2 ? 1 : -1;   // beat n sends the balance anticlockwise when n is even, and the fork the other way
    st.fork = side * (2 * e - 1) * 0.094;
    st.beat = n;
    // n beats since midnight, whole teeth and whole turns taken out before the angle is made, so nothing loses
    // its place late in the day
    const turns = (per) => ((n % per) + e) / per * 2 * Math.PI;
    st.escape = -turns(2 * TEETH.escape);
    st.fourth = turns(60 * BEAT);
    st.third = -turns(60 * BEAT * TEETH.third / TEETH.fourthP);
    st.centre = turns(3600 * BEAT);
    if (ticks >= 0 && n !== ticks) st.events.push({ kind: 'tick', n: Math.min(n - ticks, 12), odd: n % 2, late: f / BEAT });   // late: s ago it fell
    ticks = n;

    // The winding wheels: the ratchet is drawn after its goal on a spring, the crown wheel is geared to it, and
    // the click rides up each tooth and drops behind it.
    if (stuck > 0) { stuck = Math.max(0, stuck - dt); }
    const lead = stuck > 0 ? 0.5 * Math.sin(Math.PI * (1 - stuck / 0.3)) : 0;   // fully wound: it gives half a tooth and comes back
    const goal = (ratchetGoal + lead) * 2 * Math.PI / TEETH.ratchet;
    st.ratchet += (goal - st.ratchet) * (1 - Math.exp(-dt / 0.085));
    st.crown = -st.ratchet * TEETH.ratchet / TEETH.crown;
    const tooth = st.ratchet * TEETH.ratchet / (2 * Math.PI); const over = tooth - Math.floor(tooth);
    st.click = 0.085 * over;
    const passed = Math.floor(tooth + 1e-4);
    if (passed > teeth) st.events.push({ kind: 'click', n: passed - teeth });
    teeth = Math.max(teeth, passed);
    return st;
  }
  // One turn of the crown: the ratchet takes up as many teeth as the spring has room for, seven at most. Says what
  // happened: 'wound', 'topped' when that filled it, or 'full' when it would not take one tooth more.
  function wind() {
    const teeth = Math.min(STROKE, Math.floor((1 - st.wind) * STROKES * STROKE + 1e-6));
    if (teeth < 1) { stuck = 0.3; return 'full'; }
    st.wind = Math.min(1, st.wind + teeth / (STROKES * STROKE)); ratchetGoal += teeth;
    return teeth < STROKE || st.wind > 1 - 0.5 / (STROKES * STROKE) ? 'topped' : 'wound';
  }
  // The same, finished: for a still, which shows an action's outcome and not its motion.
  function settle() { st.ratchet = ratchetGoal * 2 * Math.PI / TEETH.ratchet; teeth = ratchetGoal; stuck = 0; st.swing = 0; }

  return { g, st, lay, step, wind, settle, heightAt };
}
