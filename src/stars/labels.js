// The chart's lettering on a 2D canvas over the sky, so it is crisp at any render scale: declinations along the
// meridian, the hours turning with the sky, the catalogue label of each pinned constellation. Nothing here pops:
// a label fades as it nears the headline, the land or another label.
const TAU = Math.PI * 2;
const MONO = '500 10px "JetBrains Mono Variable", ui-monospace, monospace';
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}h`);
const DECS = Array.from({ length: 14 }, (_, n) => { const dec = 90 - n * 15; return `${dec > 0 ? '+' : dec < 0 ? '−' : ''}${Math.abs(dec)}°`; });
const unit = (v) => Math.min(1, Math.max(0, v));

export function createLabels(canvas) {
  const g = canvas.getContext('2d');
  let dpr = 1; let stale = true; let sig = NaN; let rot0 = 0;
  const shown = new Float32Array(16 * 5); let nShown = 0; // pin labels on screen: l, t, r, b, strength
  let rects = []; let cue = null; let skyline = null;     // this frame's view, for the helpers below

  // How much of a label centred at (x, y), `half` wide to each side, shows: none near a line of the headline or down
  // in the land.
  const clear = (x, y, half) => {
    let d = 1e9;
    for (const r of rects) d = Math.min(d, Math.hypot(Math.max(r.l - x - half, x - half - r.r, 0), Math.max(r.t - y - 5, y - 5 - r.b, 0)));
    return unit((d - 4) / 22) * unit((skyline(x) - 10 - y) / 16);
  };
  // The chart's own lettering gives way to the cue and to the catalogue labels.
  const room = (x, y, half) => {
    if (x + half > cue.l - 6 && x - half < cue.r + 6 && y + 5 > cue.t - 4 && y - 5 < cue.b + 4) return 0;
    let v = 1;
    for (let o = 0; o < nShown * 5; o += 5) if (x + half > shown[o] - 6 && x - half < shown[o + 2] + 6 && y + 5 > shown[o + 1] - 6 && y - 5 < shown[o + 3] + 6) v = Math.min(v, 1 - shown[o + 4]);
    return v;
  };
  const put = (pin, x, y, a) => {
    if (a < 0.01) return;
    g.globalAlpha = a; g.fillText(pin.text, x, y);
    if (nShown < 16) { const o = nShown++ * 5; shown[o] = x - pin.w / 2; shown[o + 1] = y - 5; shown[o + 2] = x + pin.w / 2; shown[o + 3] = y + 5; shown[o + 4] = a; }
  };

  return {
    resize(w, h) {
      dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      stale = true;
    },
    touch() { stale = true; },
    draw(view, pins, land) {
      const { W, H, poleX, poleY, ring, rot } = view;
      const R = Math.max(poleX, W - poleX) + Math.max(poleY, H - poleY);
      // Redrawn only when the sky has moved a quarter pixel out there, or a label changed strength.
      let s = pins.length; for (const p of pins) s += p.label * (p.n + 1);
      if (!stale && s === sig && Math.abs(rot - rot0) * R < 0.25) return;
      stale = false; sig = s; rot0 = rot; rects = view.rects; cue = view.cue; skyline = land;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.font = MONO; g.textBaseline = 'middle'; g.textAlign = 'center';

      // Catalogue labels, centred under each pinned constellation; over it when there is no room underneath.
      g.fillStyle = '#d6d8d4'; nShown = 0;
      g.shadowColor = 'rgb(5 7 11 / 0.9)'; g.shadowBlur = 5; // a little night of its own: a label may lie on the aurora
      if ('letterSpacing' in g) g.letterSpacing = '0.9px';
      for (const pin of pins) {
        if (!(pin.label > 0)) continue;
        pin.w ??= g.measureText(pin.text).width;
        const half = pin.w / 2;
        const x = pin.x > 0 && pin.x < W ? Math.min(Math.max(pin.x, half + 10), Math.max(half + 10, W - half - 10)) : pin.x; // kept on the screen while its stars are
        const under = unit((clear(x, pin.y, half) - 0.4) * 5); // one place or the other, with a short crossing: never two faint copies
        put(pin, x, pin.y, pin.label * under);
        put(pin, x, pin.top, pin.label * (1 - under) * clear(x, pin.top, half) * unit((pin.top - 10) / 10));
      }

      g.fillStyle = '#d6deec'; g.shadowBlur = 0;
      if ('letterSpacing' in g) g.letterSpacing = '0.6px';
      for (let h = 0; h < 24; h += 2) {
        const a = rot + (h * TAU) / 24; const ca = Math.cos(a); const sa = Math.sin(a);
        for (let n = 3; n <= 6; n += 3) {
          const rad = n * ring + 14; const x = poleX + ca * rad - sa * 11; const y = poleY + sa * rad + ca * 11;
          if (x < 12 || y < 12 || x > W - 12 || y > H) continue;
          const v = clear(x, y, 10) * room(x, y, 10) * unit((Math.abs(x - poleX) - 18) / 10);
          if (v > 0.01) { g.globalAlpha = 0.5 * v; g.fillText(HOURS[h], x, y); }
        }
      }
      g.textAlign = 'left';
      for (let n = 1; n * ring < R && n < DECS.length; n++) {
        for (let dir = -1; dir <= 1; dir += 2) {
          const y = poleY + dir * n * ring - 9;
          if (y < 28) continue;
          const v = clear(poleX + 20, y, 12) * room(poleX + 20, y, 12);
          if (v > 0.01) { g.globalAlpha = 0.5 * v; g.fillText(DECS[n], poleX + 8, y); }
        }
      }
      g.globalAlpha = 0.5; g.fillText('MERIDIAN', poleX + 8, 16);
      g.globalAlpha = 1;
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    },
  };
}
