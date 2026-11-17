// The DOM headline, redrawn into a canvas so the scene can have it. The letters lie on the pond's bed, cut from pale
// stone: blue = the letters themselves, crisp; red = the same, soft (their bevel, and the shadow they throw on the
// bed beside them); green = a wide glow under the button (a quiet dip in exposure, so its label stays readable).
// Drawn at the screen's own resolution, capped at four megapixels: the letters are looked at.
export function drawTextMask(cv, root) {
  const box = root.getBoundingClientRect();
  const K = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4e6 / Math.max(1, box.width * box.height)));
  const w = Math.max(2, Math.round(box.width * K)); const h = Math.max(2, Math.round(box.height * K));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.shadowColor = 'transparent';
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  if (root.classList.contains('koi--bare')) return; // the text is switched off: no letters on the bed, no glow
  g.globalCompositeOperation = 'lighter';
  const FAR = w + 4000; // shapes are drawn off-canvas and only their blurred shadow lands on it: blur without ctx.filter
  const soft = (colour, blur, paint) => { g.shadowColor = colour; g.shadowBlur = blur; g.shadowOffsetX = FAR; g.shadowOffsetY = 0; g.fillStyle = '#000'; paint(FAR); g.shadowColor = 'transparent'; };

  const h1 = root.querySelector('h1'); const node = h1.firstChild;
  const cs = getComputedStyle(h1); const size = parseFloat(cs.fontSize);
  const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  // one rect per word, straight from layout, so a wrapped headline is laid out wrapped
  const words = []; const range = document.createRange(); const text = node.textContent; const re = /\S+/g; let m;
  while ((m = re.exec(text))) { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); words.push([m[0], range.getBoundingClientRect()]); }
  const word = (str, r, far) => {
    g.save();
    g.font = font; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
    if ('fontStretch' in g) g.fontStretch = 'expanded';   // the nearest a canvas can ask for to the headline's 118% width
    const met = g.measureText(str); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
    const sy = r.height / (asc + desc);
    // the rest of the way to that width: the word is fitted to the width layout gave it
    g.translate((r.left - box.left) * K - far, (r.top - box.top + asc * sy) * K); g.scale((r.width / met.width) * K, K);
    g.fillText(str, 0, 0);
    g.restore();
  };
  g.fillStyle = '#00f'; for (const [s, r] of words) word(s, r, 0);
  soft('#f00', 3 * K, (far) => { for (const [s, r] of words) word(s, r, far); });
  // the button's label is small type over moving light (the plate line sits on its own smoked glass, in CSS)
  soft('rgb(0,150,0)', 36 * K, (far) => {
    for (const el of root.querySelectorAll('.koi__cue')) {
      const r = el.getBoundingClientRect(); const pad = 6;
      g.beginPath(); g.roundRect((r.left - box.left - pad) * K - far, (r.top - box.top - pad) * K, (r.width + 2 * pad) * K, (r.height + 2 * pad) * K, 24 * K); g.fill();
    }
  });
}
