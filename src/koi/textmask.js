// The DOM headline, redrawn into a small canvas so the scene can react to it: red = the letters, slightly soft
// (they cast a shadow on the koi and the floor), green = a wide glow under all the copy (a quiet dip in exposure).
// Half the hero's CSS resolution is enough for both.
const DOWN = 0.5;

export function drawTextMask(cv, root) {
  const box = root.getBoundingClientRect();
  const w = Math.max(2, Math.round(box.width * DOWN)); const h = Math.max(2, Math.round(box.height * DOWN));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.shadowColor = 'transparent';
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const FAR = w + 4000; // shapes are drawn off-canvas and only their blurred shadow lands on it: blur without ctx.filter
  const soft = (colour, blur, paint) => { g.shadowColor = colour; g.shadowBlur = blur; g.shadowOffsetX = FAR; g.shadowOffsetY = 0; g.fillStyle = '#000'; paint(); };

  const h1 = root.querySelector('h1'); const node = h1.firstChild;
  const cs = getComputedStyle(h1); const size = parseFloat(cs.fontSize);
  const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  // one rect per word, straight from layout, so a wrapped headline casts a wrapped shadow
  const words = []; const range = document.createRange(); const text = node.textContent; const re = /\S+/g; let m;
  while ((m = re.exec(text))) { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); words.push([m[0], range.getBoundingClientRect()]); }
  const word = (str, r) => {
    g.save();
    g.font = font; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
    const met = g.measureText(str); const asc = met.fontBoundingBoxAscent ?? size * 0.9; const desc = met.fontBoundingBoxDescent ?? size * 0.25;
    const sy = r.height / (asc + desc);
    // canvas cannot ask for the 118% width axis by number, so the word is fitted to the width layout gave it
    g.translate((r.left - box.left) * DOWN - FAR, (r.top - box.top + asc * sy) * DOWN); g.scale((r.width / met.width) * DOWN, DOWN);
    g.fillText(str, 0, 0);
    g.restore();
  };
  soft('#f00', 3.2 + size * 0.02, () => { for (const [s, r] of words) word(s, r); });
  soft('#0f0', size * 0.32, () => { for (const [s, r] of words) word(s, r); });
  // the button and the plate line get the wide glow too
  soft('rgb(0,150,0)', 18, () => {
    for (const el of root.querySelectorAll('.koi__cue, .koi__note span')) {
      const r = el.getBoundingClientRect(); const pad = 6;
      g.beginPath(); g.roundRect((r.left - box.left - pad) * DOWN - FAR, (r.top - box.top - pad) * DOWN, (r.width + 2 * pad) * DOWN, (r.height + 2 * pad) * DOWN, 12); g.fill();
    }
  });
  g.shadowColor = 'transparent';
}
