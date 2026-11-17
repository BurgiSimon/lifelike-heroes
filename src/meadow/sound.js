// The meadow's sound: wind over the field (a low body, and the hiss of the leaves above it) that rises with the wind
// option, with a gust and with a pointer brushing through the grass, and the small sounds of a flower coming up.

export function voices(kit, wind) {
  const src = kit.noise();
  const body = kit.filter('bandpass', 420, 0.6); const breath = kit.gain(1); const low = kit.gain(0);
  const leaves = kit.filter('bandpass', 2400, 1); const high = kit.gain(0);
  src.connect(body); body.connect(breath); breath.connect(low); low.connect(kit.dry);
  src.connect(leaves); leaves.connect(high); high.connect(kit.dry);
  // wind is never even: it breathes, and its pitch wanders
  kit.sway(breath.gain, 0.07, 0.28); kit.sway(breath.gain, 0.19, 0.16); kit.sway(body.frequency, 0.05, 90);

  const v = {
    // wind: the option (0 to 3); gust: 1 while one crosses the field; brush: the pointer's speed through the grass, px/ms
    air(w, gust, brush) {
      const t = kit.ctx.currentTime; const b = Math.min(1, brush / 1.5);
      low.gain.setTargetAtTime(0.012 + 0.045 * w + 0.08 * gust, t, gust ? 0.7 : 1.4);
      high.gain.setTargetAtTime(0.002 + 0.005 * w + 0.02 * gust + 0.035 * b, t, b > 0.05 ? 0.12 : 0.5);
      body.frequency.setTargetAtTime(400 + 60 * w + 260 * gust, t, 1);
    },
    // A flower comes up at u (0 left to 1 right), over the second it takes to grow: the soil gives, the stem rises
    // with a rustle that climbs as it does, leaves unfold in small dry crackles, and the head opens with a breath.
    sow(u) {
      const pan = u * 2 - 1;
      kit.burst({ f: 240, q: 0.9, decay: 0.14, gain: 0.42, pan, send: 0.15 });
      kit.burst({ f: 600, to: 2400, q: 1.2, at: 0.05, attack: 0.4, decay: 0.7, gain: 0.1, pan, send: 0.3 });
      for (let k = 0; k < 7; k++) {
        const p = (k + Math.random()) / 7;
        kit.burst({ f: 1400 + 2400 * p, q: 3, at: 0.1 + p * 0.9, attack: 0.003, decay: 0.03 + 0.03 * Math.random(), gain: 0.1 + 0.11 * Math.random(), pan, send: 0.25 });
      }
      kit.burst({ f: 1800, q: 0.7, at: 1.05, attack: 0.03, decay: 0.22, gain: 0.085, pan, send: 0.4 });
    },
  };
  v.air(wind, 0, 0);
  return v;
}
