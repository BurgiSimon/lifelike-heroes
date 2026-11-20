// The headline, cut into the bridge. The DOM lays the words out; this reads where each one fell, draws the same
// letters, and turns them into a field of distances from their outlines, which the bridge's shader reads as the
// engraver's cut: how far inside a stroke a point is tells it lip from lacquer. Distances, not a picture of the
// letters, so the cut stays clean at any size and has an edge to catch the light.
const RANGE = 6;     // CSS px either side of an outline the field holds
const PAD = 10;      // CSS px of plain plate kept round the words
const FINE = 4;      // the letters are drawn at this many canvas px per CSS px before they are measured: a Bodoni's hairlines are under a px wide
const BOLD = 0.7;    // CSS px the cut is wider than the drawn stroke, each side: a graver cannot cut a hairline as fine as a pen draws one

// One row or column of a squared-distance transform (Felzenszwalb and Huttenlocher's lower envelope of parabolas).
function sweep(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    do { const p = v[k]; s = (f[q] + q * q - f[p] - p * p) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0);
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
// Distance from every cell to the nearest cell where `on` holds, in cells.
function distance(on, w, h) {
  const out = new Float32Array(w * h); const n = Math.max(w, h); const f = new Float64Array(n); const d = new Float64Array(n); const v = new Int32Array(n); const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = on[y * w + x] ? 0 : 1e12; sweep(f, h, d, v, z); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; sweep(f, w, d, v, z); for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]); }
  return out;
}

// Returns { data, width, height, box, range, ink }: one byte a texel, 128 on an outline, more inside a stroke; box
// is the field's place in CSS px of the hero (l, t, w, h); range the CSS px that 127 steps stand for; ink the box the
// letters themselves fill (l, t, r, b), which is a good deal less tall than the lines they stand on. null with no words.
export function engrave(root, h1) {
  const node = h1.firstChild; if (!node || !node.textContent.trim()) return null;
  const host = root.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(h1);
  const all = range.getBoundingClientRect(); if (!all.width || !all.height) return null;
  const box = { l: all.left - host.left - PAD, t: all.top - host.top - PAD, w: all.width + 2 * PAD, h: all.height + 2 * PAD };
  // a field texel is about a device pixel, and the whole field at most a megapixel and a half
  const K = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1.5e6 / (box.w * box.h)));
  const w = Math.max(4, Math.round(box.w * K)); const h = Math.max(4, Math.round(box.h * K)); const OVER = Math.max(1, Math.round(FINE / K)); const S = K * OVER;
  const cv = document.createElement('canvas'); cv.width = w * OVER; cv.height = h * OVER;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const cs = getComputedStyle(h1); const size = parseFloat(cs.fontSize); const upper = cs.textTransform === 'uppercase';
  g.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
  const spaced = 'letterSpacing' in g; const gap = parseFloat(cs.letterSpacing) || 0;
  if (spaced) g.letterSpacing = cs.letterSpacing;
  // a canvas that cannot space letters is given them one at a time
  const width = (str) => (spaced ? g.measureText(str).width : [...str].reduce((w, ch) => w + g.measureText(ch).width + gap, 0));
  const write = (str) => { if (spaced) { g.fillText(str, 0, 0); return; } let x = 0; for (const ch of str) { g.fillText(ch, x, 0); x += g.measureText(ch).width + gap; } };
  // one rect per word, straight from layout, so a wrapped headline is engraved as it wrapped
  const re = /\S+/g; let m; const letters = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
  while ((m = re.exec(node.textContent))) {
    range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    const r = range.getBoundingClientRect(); const str = upper ? m[0].toUpperCase() : m[0];
    const met = g.measureText(str); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
    const sy = r.height / (asc + desc); const top = r.top - host.top;
    letters.l = Math.min(letters.l, r.left - host.left); letters.r = Math.max(letters.r, r.right - host.left);
    letters.t = Math.min(letters.t, top + (asc - (met.actualBoundingBoxAscent ?? asc * 0.75)) * sy); letters.b = Math.max(letters.b, top + (asc + (met.actualBoundingBoxDescent ?? 0)) * sy);
    g.save();
    // the word is fitted to the box layout gave it: a canvas may space or kern a hair differently from the page
    g.translate((r.left - host.left - box.l) * S, (r.top - host.top - box.t + asc * r.height / (asc + desc)) * S); g.scale(r.width / width(str) * S, r.height / (asc + desc) * S);
    write(str);
    g.restore();
  }
  const W = cv.width; const H = cv.height; const px = g.getImageData(0, 0, W, H).data; const ink = new Uint8Array(W * H); const clear = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { ink[i] = px[i * 4 + 3] > 127 ? 1 : 0; clear[i] = 1 - ink[i]; }
  const out = distance(ink, W, H); const into = distance(clear, W, H);
  const data = new Uint8Array(w * h); const k = 127 / (RANGE * S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = 0; j < OVER; j++) for (let i = 0; i < OVER; i++) { const q = (y * OVER + j) * W + x * OVER + i; s += ink[q] ? into[q] - 0.5 : 0.5 - out[q]; }
    data[y * w + x] = Math.max(0, Math.min(255, Math.round(128 + (s / (OVER * OVER) + BOLD * S) * k)));
  }
  return { data, width: w, height: h, box, range: RANGE, ink: letters };
}
