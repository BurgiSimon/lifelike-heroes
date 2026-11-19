// The DOM headline, redrawn into a canvas so the scene can have it: the words are sign-written on the window's
// glass, and what the wall shows is their shadow. White = paint. Drawn one canvas pixel to a CSS pixel: by the time
// the light reaches the wall the sun's own width has blurred every edge by a dozen of them.
// grow: px by which each stroke is painted heavier on every side. The sun's width eats a shadow's edge, and a
// sign-writer who knows where his letters will be read from paints them stout.
export function drawLetters(cv, root, title, bare, grow = 0) {
  const box = root.getBoundingClientRect();
  const w = Math.max(2, Math.round(box.width)); const h = Math.max(2, Math.round(box.height));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const node = title.firstChild;
  if (bare || !node) return;   // the text is switched off: plain glass
  const cs = getComputedStyle(title); const size = parseFloat(cs.fontSize);
  g.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
  if ('fontStretch' in g) g.fontStretch = 'expanded';   // the nearest a canvas can ask for to the headline's width
  // one rect per word, straight from layout, so a wrapped headline is painted wrapped
  const range = document.createRange(); const text = node.textContent; const re = /\S+/g; let m;
  while ((m = re.exec(text))) {
    range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); const r = range.getBoundingClientRect();
    const met = g.measureText(m[0]); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
    g.save();
    // the rest of the way to that width: the word is fitted to the width layout gave it
    g.translate(r.left - box.left, r.top - box.top + asc * (r.height / (asc + desc))); g.scale(r.width / met.width, 1);
    g.fillText(m[0], 0, 0);
    if (grow > 0) { g.lineJoin = 'round'; g.lineWidth = 2 * grow; g.strokeStyle = '#fff'; g.strokeText(m[0], 0, 0); }
    g.restore();
  }
}
