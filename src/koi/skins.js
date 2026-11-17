// Koi skins, painted once per stocking into one atlas: a strip per koi, nose to peduncle along x, and across y
// the back as it wraps from one flank over the ridge to the other. Behind the head a pattern is laid scale by
// scale, so its edge steps along the scale rows the way real kiwa does; the head is smooth skin.
import { rnd } from '../shared/kit.js';

export const CELL_W = 640; export const CELL_H = 160; export const GUT = 16; export const CELLS = 8;
export const ATLAS_H = CELLS * (CELL_H + GUT);
const ROWS = 38;   // scales from gill cover to tail
const COLS = 12;   // and across the half of the body the camera sees

// sRGB grounds. Koi white is never paper white, and hi sits toward orange.
const SHIRO = [208, 205, 196]; const HI = [200, 62, 26]; const SUMI = [30, 31, 36];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// A patch: an ellipse in (u along the body 0..1, t across the back -1..1) with a wobbling outline.
const patch = (r, u, t, ru, rt, amp = 0.22) => ({ u, t, ru, rt, amp, p: [r() * 6.283, r() * 6.283, r() * 6.283] });
const reach = (b, ang) => 1 + b.amp * (Math.sin(2 * ang + b.p[0]) * 0.55 + Math.sin(3 * ang + b.p[1]) * 0.35 + Math.sin(5 * ang + b.p[2]) * 0.2);
const inside = (list, u, t) => {
  for (const b of list) { const dx = (u - b.u) / b.ru; const dy = (t - b.t) / b.rt; if (Math.hypot(dx, dy) < reach(b, Math.atan2(dy, dx))) return true; }
  return false;
};

// Each variety: the head's ground, what a scale at (u, t) is painted with, and patches that run onto the head.
function variety(kind, r) {
  const steps = (n, from, to, wide) => { // a stepped pattern: patches spaced down the back, each with a lobe to one side
    const list = [];
    for (let i = 0; i < n; i++) {
      const u = from + (to - from) * (i + 0.5 + (r() - 0.5) * 0.3) / n; const ru = (to - from) / n * (0.3 + 0.16 * r()) * (1 - 0.25 * i / n);
      const t = (r() - 0.5) * 0.5;
      list.push(patch(r, u, t, ru, wide * (0.75 + 0.4 * r()) * (1 - 0.3 * i / n)));
      if (r() < 0.75) list.push(patch(r, u + (r() - 0.5) * ru * 1.6, t + (r() < 0.5 ? -1 : 1) * (0.25 + 0.3 * r()), ru * 0.65, wide * 0.5, 0.3));
    }
    return list;
  };
  const spots = (n, size) => Array.from({ length: n }, () => patch(r, 0.3 + 0.64 * r(), (r() - 0.5) * 1.3, size * (0.5 + r()), size * 6 * (0.5 + r()), 0.35));
  const hue = 0.86 + 0.28 * r(); const hi = [HI[0], HI[1] * hue, HI[2] * hue];
  if (kind === 0) { // Kohaku: red on white, a cap on the head
    const red = steps(2 + Math.floor(r() * 2.2), 0.25, 0.95, 0.62);
    const cap = [patch(r, 0.118, 0, 0.066, 0.56, 0.14)];
    return { head: SHIRO, scale: (u, t) => (inside(red, u, t) ? hi : SHIRO), over: [[cap, hi]], dorsal: 0.3 };
  }
  if (kind === 1) { // Taisho Sanke: a Kohaku with small sumi on the back, none on the head
    const red = steps(3, 0.24, 0.92, 0.6); const ink = spots(7, 0.03);
    const cap = [patch(r, 0.125, 0.1, 0.06, 0.5, 0.2)];
    return { head: SHIRO, scale: (u, t) => (inside(ink, u, t) ? SUMI : inside(red, u, t) ? hi : SHIRO), over: [[cap, hi]], dorsal: 0.3 };
  }
  if (kind === 2) { // Showa: black ground, white and red wrapped over it, black crossing the head
    const white = steps(4, 0.0, 1.0, 0.8); const red = steps(3, 0.08, 0.9, 0.6);
    const band = [patch(r, 0.12, 0.3, 0.035, 1.3, 0.4), patch(r, 0.5 + 0.1 * r(), -0.2, 0.05, 1.2, 0.4), patch(r, 0.8, 0.3, 0.035, 1.0, 0.4)];
    return { head: SUMI, scale: (u, t) => (inside(band, u, t) ? SUMI : inside(red, u, t) ? hi : inside(white, u, t) ? SHIRO : SUMI), over: [[white, SHIRO], [red, hi], [band, SUMI]], dorsal: 0.5, rim: 0.1 };
  }
  if (kind === 3) { // Yamabuki Ogon: one metallic yellow, every scale edged with light
    const gold = [192, 156, 78];
    return { head: [200, 170, 100], scale: () => mix(gold, [176, 136, 58], r()), over: [], dorsal: 0.25, rim: -0.34, net: 0.14 };
  }
  if (kind === 4) { // Asagi: a blue net on the back, red on the cheeks and below the lateral line
    const red = [198, 96, 48];
    return {
      head: [196, 202, 200], scale: (u, t) => (Math.abs(t) > 0.62 + 0.1 * Math.sin(u * 23) ? red : mix([58, 82, 112], [98, 124, 150], r())),
      over: [[[patch(r, 0.17, 0.95, 0.06, 0.34, 0.1), patch(r, 0.17, -0.95, 0.06, 0.34, 0.1)], red]], dorsal: 0.3, rim: -0.42, net: 0.3,
    };
  }
  if (kind === 5) { // Tancho: one red sun on the head
    return { head: SHIRO, scale: () => SHIRO, over: [[[patch(r, 0.118, 0, 0.058, 0.5, 0.05)], hi]], dorsal: 0.3 };
  }
  if (kind === 6) { // Chagoi: tea brown, finely netted
    const tea = [138, 106, 60];
    return { head: [150, 120, 72], scale: () => mix(tea, [118, 88, 48], r()), over: [], dorsal: 0.4, rim: 0.34, net: 0.2 };
  }
  // Shiro Utsuri: black and white
  const white = steps(4, 0.0, 1.0, 0.85);
  const band = [patch(r, 0.1, -0.2, 0.03, 1.3, 0.4), patch(r, 0.62, 0.2, 0.05, 1.2, 0.4)];
  return { head: SUMI, scale: (u, t) => (!inside(band, u, t) && inside(white, u, t) ? SHIRO : SUMI), over: [[white, SHIRO], [band, SUMI]], dorsal: 0.5, rim: 0.1 };
}

function strip(g, y0, kind, seed) {
  let n = 0; const r = () => rnd(seed * 977 + n++);
  const v = variety(kind, r);
  const W = CELL_W; const H = CELL_H;
  const gill = (t) => 0.2 + 0.055 * Math.abs(t) ** 1.6;   // where the head ends: further back down the flanks
  g.save(); g.translate(0, y0);
  g.beginPath(); g.rect(0, -GUT / 2, W, H + GUT); g.clip();
  g.fillStyle = css(v.scale(0.6, 0)); g.fillRect(0, -GUT / 2, W, H + GUT);

  // scales, tail first, so each one overlaps the one behind it
  const x0 = 0.17 * W; const dx = (W - x0) / ROWS; const dy = H / COLS;
  const rim = v.rim ?? 0.15; const net = v.net ?? 0.08;
  for (let i = ROWS; i >= 0; i--) {
    for (let j = -1; j <= COLS; j++) {
      const x = x0 + (i + 0.5) * dx; const y = (j + (i & 1 ? 1 : 0.5)) * dy;
      const c = v.scale(x / W, (y / H) * 2 - 1);
      g.fillStyle = css(c, 1 + (r() - 0.5) * net);
      g.beginPath(); g.ellipse(x, y, dx * 0.95, dy * 0.62, 0, 0, 6.2832); g.fill();
      // the free edge: a thin shadow in the pocket behind it, or on a netted koi a pale rim
      g.strokeStyle = rim > 0 ? `rgba(0,0,0,${rim})` : `rgba(255,250,235,${-rim})`; g.lineWidth = dx * 0.24;
      g.beginPath(); g.ellipse(x, y, dx * 0.9, dy * 0.57, 0, -1.15, 1.15); g.stroke();
    }
  }
  // dorsal fin: from above a thin ridge down the middle of the back, lit on its sunward side
  g.lineCap = 'round';
  for (const [colour, dy] of [[`rgba(20,18,14,${Math.min(0.8, v.dorsal * 1.8)})`, 2], ['rgba(255,250,240,0.3)', -2.5]]) {
    g.strokeStyle = colour;
    for (let i = 0; i < 12; i++) { const a = 0.37 + 0.34 * i / 12; g.lineWidth = H * (0.07 - 0.04 * i / 12) * (dy > 0 ? 1 : 0.5); g.beginPath(); g.moveTo(a * W, H * 0.5 + dy); g.lineTo((a + 0.03) * W, H * 0.5 + dy); g.stroke(); }
  }

  // head: smooth skin up to the gill cover, with whatever pattern runs onto it
  const head = new Path2D(); head.moveTo(0, -GUT);
  for (let i = 0; i <= 32; i++) { const t = -1 + i / 16; head.lineTo(gill(t) * W, (t * 0.5 + 0.5) * H); }
  head.lineTo(0, H + GUT); head.closePath();
  g.save(); g.clip(head);
  g.fillStyle = css(v.head); g.fillRect(0, -GUT, W, H + 2 * GUT);
  for (const [list, colour] of v.over) {
    g.fillStyle = css(colour);
    for (const b of list) {
      g.beginPath();
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * 6.2832; const k = reach(b, a); g.lineTo((b.u + Math.cos(a) * k * b.ru) * W, ((b.t + Math.sin(a) * k * b.rt) * 0.5 + 0.5) * H); }
      g.fill();
    }
  }
  g.restore();
  // the gill cover's edge, strongest on the flanks
  for (const side of [-1, 1]) {
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2.2; g.beginPath();
    for (let i = 5; i <= 16; i++) { const t = side * i / 16; g.lineTo(gill(t) * W, (t * 0.5 + 0.5) * H); }
    g.stroke();
  }
  // eyes far out on the sides, nostrils near the snout
  for (const side of [-1, 1]) {
    const ey = (side * 0.6 * 0.5 + 0.5) * H; const ex = 0.108 * W;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(ex, ey, W * 0.026, H * 0.085, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#4a4636'; g.beginPath(); g.ellipse(ex, ey, W * 0.019, H * 0.062, 0, 0, 6.2832); g.fill();   // the iris, a dull gold ring
    g.fillStyle = '#0a0b0c'; g.beginPath(); g.ellipse(ex, ey, W * 0.013, H * 0.044, 0, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(0.036 * W, (side * 0.3 * 0.5 + 0.5) * H, W * 0.006, H * 0.016, 0, 0, 6.2832); g.fill();
  }
  g.restore();
}

// Paints the strips for this stock of koi into cv and returns it.
export function paintSkins(cv, fish) {
  if (cv.width !== CELL_W || cv.height !== ATLAS_H) { cv.width = CELL_W; cv.height = ATLAS_H; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CELL_W, ATLAS_H);
  fish.forEach((f, k) => strip(g, k * (CELL_H + GUT) + GUT / 2, f.kind, f.i + 1));
  return cv;
}
