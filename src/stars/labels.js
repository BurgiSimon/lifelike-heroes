// The chart's lettering on a 2D canvas over the sky, so it is crisp at any render scale: declinations along the
// meridian, the hours turning with the sky, the catalogue label under each pinned constellation.
const TAU = Math.PI * 2;
const MONO = '500 10px "JetBrains Mono Variable", ui-monospace, monospace';
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}h`);
const DECS = Array.from({ length: 14 }, (_, n) => { const dec = 90 - n * 15; return `${dec > 0 ? '+' : dec < 0 ? '−' : ''}${Math.abs(dec)}°`; });

export function createLabels(canvas) {
  const g = canvas.getContext('2d');
  let dpr = 1;
  return {
    resize(w, h) {
      dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    },
    draw(view, pins, skyline) {
      const { W, H, poleX, poleY, ring, rot, box } = view;
      const R = Math.max(poleX, W - poleX) + Math.max(poleY, H - poleY);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.font = MONO; g.textBaseline = 'middle'; g.fillStyle = 'rgb(214 222 236 / 0.5)';
      if ('letterSpacing' in g) g.letterSpacing = '0.6px';
      g.textAlign = 'left';
      for (let n = 1; n * ring < R && n < DECS.length; n++) {
        const text = DECS[n];
        for (let dir = -1; dir <= 1; dir += 2) {
          const y = poleY + dir * n * ring - 9; const behind = poleX + 40 > box.l && poleX < box.r && y > box.t - 8 && y < box.b + 8;
          if (!behind && y > 28 && y < skyline(poleX + 20) - 12) g.fillText(text, poleX + 8, y);
        }
      }
      g.fillText('MERIDIAN', poleX + 8, 16);
      g.textAlign = 'center';
      for (let h = 0; h < 24; h += 2) {
        const a = rot + (h * TAU) / 24; const ca = Math.cos(a); const sa = Math.sin(a);
        for (let n = 3; n <= 6; n += 3) {
          const rad = n * ring + 14; const x = poleX + ca * rad - sa * 11; const y = poleY + sa * rad + ca * 11;
          const behind = x > box.l - 14 && x < box.r + 14 && y > box.t - 8 && y < box.b + 8; // not behind the headline
          if (!behind && x > 12 && y > 12 && x < W - 12 && y < skyline(x) - 12 && Math.abs(x - poleX) > 26) g.fillText(HOURS[h], x, y);
        }
      }
      // Catalogue labels, centred under each pinned constellation.
      g.fillStyle = '#d6d8d4';
      if ('letterSpacing' in g) g.letterSpacing = '0.9px';
      for (const pin of pins) {
        if (!(pin.label > 0)) continue;
        if (pin.x > box.l - 40 && pin.x < box.r + 40 && pin.y > box.t - 8 && pin.y < box.b + 8) continue; // turned behind the headline
        if (pin.y > skyline(pin.x) - 10) continue;                                                       // set behind the ridge
        g.globalAlpha = pin.label; g.fillText(pin.text, pin.x, pin.y);
      }
      g.globalAlpha = 1;
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    },
  };
}
