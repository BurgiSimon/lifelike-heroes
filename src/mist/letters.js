// The DOM headline, redrawn into a canvas so the scene can have it: the words are written in the mist on the glass,
// which is to say the mist is gone where the letters are. Blue = the letters themselves, crisp; red = the same,
// soft (the band beside each stroke where the water that was pushed aside stands in beads).
// Drawn at the screen's own resolution, capped at four megapixels: the letters are looked at.
// Returns the letters' feet in CSS px: points along each word's baseline where there is a stroke, which is where
// that water collects and now and then lets a drop go.
export function drawLetters(cv, root, title, bare) {
  const box = root.getBoundingClientRect();
  const K = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4e6 / Math.max(1, box.width * box.height)));
  const w = Math.max(2, Math.round(box.width * K)); const h = Math.max(2, Math.round(box.height * K));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.shadowColor = 'transparent';
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const node = title.firstChild;
  if (bare || !node) return [];   // the text is switched off: nothing is written on the glass
  g.globalCompositeOperation = 'lighter';
  const FAR = w + 4000;   // shapes are drawn off-canvas and only their blurred shadow lands on it: blur without ctx.filter

  const cs = getComputedStyle(title); const size = parseFloat(cs.fontSize);
  const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  // one rect per word, straight from layout, so a wrapped headline is written wrapped
  const words = []; const range = document.createRange(); const text = node.textContent; const re = /\S+/g; let m;
  while ((m = re.exec(text))) { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); words.push([m[0], range.getBoundingClientRect()]); }
  const lines = [];
  const word = (str, r, far) => {
    g.save();
    g.font = font; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
    if ('fontStretch' in g) g.fontStretch = 'expanded';   // the nearest a canvas can ask for to the headline's width
    const met = g.measureText(str); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
    const sy = r.height / (asc + desc);
    // the rest of the way to that width: the word is fitted to the width layout gave it
    g.translate((r.left - box.left) * K - far, (r.top - box.top + asc * sy) * K); g.scale((r.width / met.width) * K, K);
    g.fillText(str, 0, 0);
    g.restore();
    if (!far) lines.push({ l: r.left - box.left, r: r.right - box.left, y: r.top - box.top + asc * sy });
  };
  g.fillStyle = '#00f'; for (const [s, r] of words) word(s, r, 0);
  g.shadowColor = '#f00'; g.shadowBlur = 3.5 * K; g.shadowOffsetX = FAR; g.shadowOffsetY = 0; g.fillStyle = '#000';
  for (const [s, r] of words) word(s, r, FAR);
  g.shadowColor = 'transparent';

  // the feet: a row of the canvas just above each baseline, read back once
  // (of the last line only: a drop from a line above would run down through the words below it)
  const feet = []; const last = Math.max(...lines.map((l) => l.y));
  for (const line of lines) {
    if (line.y < last - 2) continue;
    const y = Math.round((line.y - 2) * K); const x0 = Math.max(0, Math.floor(line.l * K)); const n = Math.min(w - x0, Math.ceil((line.r - line.l) * K));
    if (y < 0 || y >= h || n < 1) continue;
    const row = g.getImageData(x0, y, n, 1).data;
    for (let i = 0; i < n; i += Math.max(1, Math.round(5 * K))) if (row[i * 4 + 2] > 128) feet.push({ x: (x0 + i) / K, y: line.y + 1 });
  }
  return feet;
}
