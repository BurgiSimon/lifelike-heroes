// The roofline and the sign, painted once per layout into a canvas (CSS px, drawn at the screen's own resolution).
// Everything in it is a silhouette, so it is painted as one: black for this roof and what stands on it, grey for
// what is far enough off to pale into the haze (the shader reads the blue as distance), and lamp orange for the two
// or three windows that are already lit.
// The headline is the sign's letters: the DOM's own type, drawn where layout put it, standing on a steel frame.
// Returns where a bird can sit, as [{ x, y }] in CSS px (its feet): along the tops of the letters and of the
// frame, on the aerials, and on the wires.
import { rnd } from '../shared/kit.js';

const LAMP = 'rgb(255,150,56)';
const haze = (v) => { const k = Math.round(255 * v); return `rgb(${k},${k},${k})`; };

export function paintSkyline(cv, root, title, g, bare) {
  const box = root.getBoundingClientRect(); const W = box.width; const H = box.height;
  const K = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4e6 / Math.max(1, W * H)));
  const cw = Math.max(2, Math.round(W * K)); const ch = Math.max(2, Math.round(H * K));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const c = cv.getContext('2d');
  c.setTransform(K, 0, 0, K, 0, 0); c.clearRect(0, 0, W, H); c.lineCap = 'round'; c.lineJoin = 'round';
  const m = g.ppm;               // px per metre on this roof
  const yP = g.hy - 5;           // the top of the parapet: just over the horizon, so nothing below the sky's edge shows
  const slots = []; let seed = 0;
  const r = () => rnd(++seed * 7 + 3);
  const line = (x0, y0, x1, y1, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  // birds along a perch from (x0, y0) to (x1, y1): in twos and threes, with room left between the groups
  const along = (x0, y0, x1, y1, keep = 0.7) => {
    const len = Math.hypot(x1 - x0, y1 - y0); let on = r() < keep;
    for (let d = (0.1 + 0.2 * r()) * m; d < len - 0.08 * m; d += (0.17 + 0.09 * r()) * m) {
      if (r() < 0.22) on = !on;
      if (on) slots.push({ x: x0 + (x1 - x0) * d / len, y: y0 + (y1 - y0) * d / len });
    }
  };

  // ---- the type: one rect per word, straight from layout
  const cs = getComputedStyle(title); const size = parseFloat(cs.fontSize) || 64; const node = title.firstChild;
  const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`; const words = [];
  if (node) {
    const range = document.createRange(); const re = /\S+/g; let w;
    while ((w = re.exec(node.textContent))) { range.setStart(node, w.index); range.setEnd(node, w.index + w[0].length); words.push([cs.textTransform === 'uppercase' ? w[0].toUpperCase() : w[0], range.getBoundingClientRect()]); }
  }
  const tb = title.getBoundingClientRect();
  const T = { l: Infinity, r: -Infinity, t: tb.top - box.top };
  for (const [, q] of words) { T.l = Math.min(T.l, q.left - box.left); T.r = Math.max(T.r, q.right - box.left); }
  if (!words.length) { T.l = tb.left - box.left; T.r = tb.right - box.left; }
  let base = T.t + 0.8 * size; let capTop = base - 0.72 * size;
  // The letters, into any 2D context: fitted to the width layout gave each word (a canvas cannot ask for the
  // headline's exact width axis), on the baseline the page's line box implies.
  const letters = (k) => {
    k.font = font; k.textBaseline = 'alphabetic'; k.fillStyle = '#000';
    if ('letterSpacing' in k) k.letterSpacing = cs.letterSpacing;
    if ('fontStretch' in k) k.fontStretch = 'expanded';
    for (const [str, q] of words) {
      const met = k.measureText(str); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
      const y = q.top - box.top + asc * (q.height / (asc + desc));
      base = y; capTop = y - (met.actualBoundingBoxAscent || 0.72 * size);
      k.save(); k.translate(q.left - box.left, y); k.scale(q.width / met.width, 1); k.fillText(str, 0, 0); k.restore();
    }
  };
  { const probe = document.createElement('canvas').getContext('2d'); letters(probe); }   // only for the metrics: where the letters' feet and heads are
  const capH = base - capTop;

  // ---- far off, paling into the haze: the roofs of the city, a dome, two stone pines
  const far = (x, y, w, h) => c.fillRect(x, yP - y - h, w, h + y + 40);
  c.fillStyle = haze(0.46);
  for (let x = -20; x < W + 20;) { const w = (0.5 + 1.4 * r()) * size; const h = (0.04 + 0.16 * r() * r()) * size; far(x, 0, w + 1, h); if (r() < 0.3) far(x + w * 0.3, h, 0.07 * size, 0.1 * size); x += w; }
  c.fillStyle = haze(0.4);
  const postL = T.l - 0.42 * size; const postR = T.r + 0.42 * size;   // the sign's end posts
  // (on a narrow frame the sign takes the whole width, and what would stand beside it is left out)
  if (postL > W * 0.12) { // the dome: a drum, the dome on it drawn a little pointed, a lantern, a ball and cross
    const x = W * 0.09; const s = Math.min(size, W * 0.16);
    far(x - 0.62 * s, 0, 1.24 * s, 0.34 * s);
    c.beginPath(); c.moveTo(x - 0.58 * s, yP - 0.34 * s); c.bezierCurveTo(x - 0.58 * s, yP - 0.95 * s, x - 0.2 * s, yP - 1.16 * s, x, yP - 1.2 * s);
    c.bezierCurveTo(x + 0.2 * s, yP - 1.16 * s, x + 0.58 * s, yP - 0.95 * s, x + 0.58 * s, yP - 0.34 * s); c.fill();
    far(x - 0.075 * s, 1.16 * s, 0.15 * s, 0.2 * s); c.beginPath(); c.arc(x, yP - 1.36 * s, 0.085 * s, Math.PI, 0); c.fill();
    c.beginPath(); c.arc(x, yP - 1.47 * s, 0.028 * s, 0, 6.2832); c.fill(); c.strokeStyle = haze(0.4); line(x, yP - 1.47 * s, x, yP - 1.6 * s, Math.max(1, 0.012 * s)); line(x - 0.035 * s, yP - 1.56 * s, x + 0.035 * s, yP - 1.56 * s, Math.max(1, 0.012 * s));
  }
  if (postR < W * 0.87) { // stone pines: a bare trunk, leaning, and a flat crown of clumps
    const s = Math.min(size, W * 0.16);
    [[0.925, 1.0], [0.975, 0.78]].forEach(([u, k], n) => {
      const x = W * u; const top = yP - (0.95 + 0.1 * n) * s * k;
      c.strokeStyle = haze(0.38); c.lineWidth = Math.max(1.2, 0.03 * s); c.beginPath(); c.moveTo(x + 0.05 * s, yP + 10); c.quadraticCurveTo(x + 0.07 * s, yP - 0.4 * s, x, top + 0.1 * s); c.stroke();
      c.fillStyle = haze(0.38);
      for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(x + (i - 3) * 0.085 * s * k + (r() - 0.5) * 0.03 * s, top + Math.abs(i - 3) * 0.022 * s + (r() - 0.5) * 0.03 * s, (0.11 + 0.04 * r()) * s * k, (0.07 + 0.03 * r()) * s * k, 0, 0, 6.2832); c.fill(); }
    });
  }
  c.fillStyle = LAMP; for (const [u, v] of [[0.18, 0.05], [0.31, 0.03], [0.64, 0.045], [0.82, 0.03]]) c.fillRect(W * u, yP - v * size - 1, Math.max(1.5, 0.02 * size), Math.max(2, 0.028 * size));

  // ---- this roof: the parapet and the wall under it, and what stands on it
  c.fillStyle = '#000'; c.strokeStyle = '#000';
  c.fillRect(-2, yP, W + 4, H - yP + 2);
  c.fillRect(-2, yP - 0.06 * m, W + 4, 0.06 * m + 1);   // its coping
  const railTop = capTop + 0.14 * capH; const railBot = base - 0.1 * capH; const rail = Math.max(2.2, 0.05 * m); const post = Math.max(2.6, 0.065 * m);
  // a chimney stack with two pots and a cowled flue, left of the sign
  if (postL > 0.035 * W + 1.7 * m) { const x = Math.max(0.035 * W, postL - 3.6 * m); const w = 0.75 * m; const h = 1.15 * m;
    c.fillRect(x, yP - h, w, h); c.fillRect(x - 0.05 * m, yP - h - 0.08 * m, w + 0.1 * m, 0.1 * m);
    for (const k of [0.2, 0.62]) { c.beginPath(); c.moveTo(x + k * w, yP - h); c.lineTo(x + k * w + 0.03 * m, yP - h - 0.34 * m); c.lineTo(x + k * w + 0.17 * m, yP - h - 0.34 * m); c.lineTo(x + k * w + 0.2 * m, yP - h); c.fill(); }
    line(x + w + 0.5 * m, yP, x + w + 0.5 * m, yP - 1.45 * m, Math.max(2, 0.07 * m)); c.fillRect(x + w + 0.38 * m, yP - 1.56 * m, 0.24 * m, 0.045 * m);   // a flue, with its rain cap
    along(x, yP - h - 0.08 * m, x + w, yP - h - 0.08 * m, 0.4);
  }
  // the head of the stair, right of the sign: a small house on the roof with a lit window
  if (W - postR > 2.4 * m) { const x = Math.max(postR - 0.4 * m, Math.min(W - 3.2 * m, postR + 2.3 * m)); const w = 2.3 * m; const h = 1.7 * m;
    c.beginPath(); c.moveTo(x, yP); c.lineTo(x, yP - h); c.lineTo(x + w + 0.12 * m, yP - h - 0.26 * m); c.lineTo(x + w + 0.12 * m, yP); c.fill();
    c.fillStyle = LAMP; c.fillRect(x + 0.45 * m, yP - 1.2 * m, 0.5 * m, 0.62 * m); c.fillStyle = '#000';
    c.fillRect(x + 0.685 * m, yP - 1.2 * m, 0.03 * m, 0.62 * m); c.fillRect(x + 0.45 * m, yP - 0.92 * m, 0.5 * m, 0.03 * m);
    along(x + 0.1 * m, yP - h - 0.02 * m, x + w, yP - h - 0.25 * m, 0.5);
  }
  // television aerials, as every roof in Rome has: a mast, a boom, a row of rods across it, seen aslant
  const tops = [];
  const aerial = (x, h, lean, flip) => {
    const top = yP - h * m; const mastW = Math.max(1.6, 0.035 * m);
    line(x, yP, x + lean * m, top, mastW);
    const bx = x + lean * m; const by = top + 0.22 * m; const L = 1.25 * m;
    const x0 = bx - flip * L * 0.42; const x1 = bx + flip * L * 0.58; const y0 = by + 0.05 * m; const y1 = by - 0.05 * m;
    line(x0, y0, x1, y1, Math.max(1.3, 0.028 * m));
    for (let i = 0; i < 7; i++) { const t = i / 6; const ex = x0 + (x1 - x0) * t; const ey = y0 + (y1 - y0) * t; const l = (0.34 - 0.2 * t) * m * (i ? 1 : 1.25); line(ex - 0.1 * l, ey - l * 0.5, ex + 0.1 * l, ey + l * 0.5, Math.max(1, 0.018 * m)); }
    along(x0, y0, x1, y1, 0.75); slots.push({ x: bx, y: top });
    tops.push([bx, top]);
  };
  // one each side of the sign where the roof has room; where it has not, they stand behind the sign and rise over it
  const over = (yP - capTop) / m + 1.3;
  if (postL > 1.3 * m) aerial(Math.max(0.02 * W + 2.2 * m, postL - 1.9 * m, 0.8 * m) > postL - 0.3 * m ? postL - 0.9 * m : Math.max(0.02 * W + 2.2 * m, postL - 1.9 * m), 2.9, 0.04, -1); else aerial(postL + 0.23 * (postR - postL), over, 0.03, -1);
  if (postR + 1.2 * m < W - 12) aerial(postR + 1.2 * m, 2.3, -0.03, 1); else aerial(postL + 0.79 * (postR - postL), over + 0.5, -0.02, 1);
  if (postR + 4.2 * m < W + 2 * m) aerial(Math.min(W + 2 * m, postR + 5.6 * m), 3.3, 0.02, -1);

  // ---- the sign: a steel frame on short legs, and the letters on it
  const postTop = capTop - 0.16 * capH;
  line(postL, yP, postL, postTop, post); line(postR, yP, postR, postTop, post);
  const bays = Math.max(2, Math.round((postR - postL) / (1.25 * m)));
  for (let i = 0; i <= bays; i++) {
    const x = postL + (postR - postL) * i / bays;
    if (i && i < bays) line(x, yP, x, railTop, Math.max(1.6, 0.04 * m));
    if (i < bays) { const x2 = postL + (postR - postL) * (i + 1) / bays; line(x, base + 2, x2, yP, Math.max(1.2, 0.026 * m)); line(x2, base + 2, x, yP, Math.max(1.2, 0.026 * m)); }   // the legs are cross-braced
  }
  line(postL, railTop, postR, railTop, rail); line(postL, railBot, postR, railBot, rail); line(postL, base + 2, postR, base + 2, rail);
  if (!bare) letters(c);

  // ---- the wires: slack between the aerials and the sign, and off to the next roof
  const wire = (x0, y0, x1, y1, sag, keep) => {
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2 + sag * m;
    c.lineWidth = Math.max(1, 0.014 * m); c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my + sag * m, x1, y1); c.stroke();
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (0.6 * m)); let px = x0; let py = y0;
    for (let i = 1; i <= n; i++) { const t = i / n; const x = (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * mx + t * t * x1; const y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * (my + sag * m) + t * t * y1; along(px, py, x, y, keep); px = x; py = y; }
  };
  if (tops[0]) { wire(tops[0][0], tops[0][1] + 0.5 * m, postL, postTop + 2, 0.16, 0.55); wire(-10, tops[0][1] - 0.2 * m, tops[0][0], tops[0][1] + 0.5 * m, 0.3, 0.5); }
  if (tops[1]) wire(postR, postTop + 2, tops[1][0], tops[1][1] + 0.4 * m, 0.1, 0.5);

  // ---- where a bird can sit on the sign itself: the top of whatever is highest in each column (a letter, or the
  // rail between two letters), wherever that top is level enough to stand on
  const x0 = Math.floor(postL - 4); const y0 = Math.floor(postTop - 4); const sw = Math.ceil(postR - postL + 8); const sh = Math.ceil(base - postTop + 4);
  if (sw > 4 && sh > 4) {
    const scan = document.createElement('canvas'); scan.width = sw; scan.height = sh;
    const k = scan.getContext('2d', { willReadFrequently: true }); k.translate(-x0, -y0); k.lineCap = 'round';
    k.strokeStyle = '#000'; k.lineWidth = rail; k.beginPath(); k.moveTo(postL, railTop); k.lineTo(postR, railTop); k.stroke();
    k.lineWidth = post; k.beginPath(); k.moveTo(postL, base); k.lineTo(postL, postTop); k.moveTo(postR, base); k.lineTo(postR, postTop); k.stroke();
    if (!bare) letters(k);
    const data = k.getImageData(0, 0, sw, sh).data; const top = new Float32Array(sw).fill(-1);
    for (let i = 0; i < sw; i++) for (let j = 0; j < sh; j++) if (data[(j * sw + i) * 4 + 3] > 128) { top[i] = j; break; }
    let last = -1e9; let want = 0;
    for (let i = 3; i < sw - 3; i++) {
      if (top[i] < 0 || top[i - 3] < 0 || top[i + 3] < 0 || Math.abs(top[i + 3] - top[i - 3]) > 3.2) continue;
      if (i - last < want) continue;
      last = i; want = (0.17 + 0.12 * r()) * m;
      if (r() < 0.8) slots.push({ x: x0 + i, y: y0 + top[i] });
    }
  }
  return slots;
}
