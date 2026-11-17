// The pond's sound: still water that laps a little, a drip now and then, the plop of a pellet, the gulp of the koi
// that takes it, and the stir of a pointer skimming the surface. Every voice takes pan: -1 left to 1 right.
export function voices(kit) {
  // the water: low noise that swells and settles, and a thin shimmer of its surface
  const src = kit.noise();
  const deep = kit.filter('lowpass', 600, 0.5); const lap = kit.gain(1); const bed = kit.gain(0.085);
  const top = kit.filter('bandpass', 1900, 1.1); const shimmer = kit.gain(0.012);
  src.connect(deep); deep.connect(bed); bed.connect(lap);
  src.connect(top); top.connect(shimmer); shimmer.connect(lap);
  lap.connect(kit.dry);
  kit.sway(lap.gain, 0.11, 0.3); kit.sway(lap.gain, 0.27, 0.18); kit.sway(deep.frequency, 0.06, 140);

  // a bubble: a tone that rises as it fades
  const bubble = (f, gain, pan, at = 0, decay = 0.09) => kit.note({ f, to: f * 1.7, at, attack: 0.004, decay, gain, pan, send: 0.4 });
  let stirred = -1;
  return {
    drip(pan) { bubble(900 + 1300 * Math.random(), 0.017 + 0.02 * Math.random(), pan, 0, 0.06); },
    pellet(pan) {
      bubble(250, 0.11, pan, 0, 0.16);
      kit.burst({ f: 2400, q: 0.8, decay: 0.09, gain: 0.05, pan, send: 0.3 });
      bubble(720, 0.03, pan, 0.1); bubble(980, 0.02, pan, 0.19, 0.07);
    },
    gulp(pan) { bubble(190, 0.08, pan, 0, 0.1); bubble(270, 0.05, pan, 0.09, 0.08); },
    // the pointer stirs the surface: a low slosh under two or three small bubbles, a few times a second at most
    skim(pan) {
      const t = kit.ctx.currentTime; if (t - stirred < 0.22) return; stirred = t;
      kit.burst({ f: 420, q: 0.6, attack: 0.07, decay: 0.3, gain: 0.12, pan, send: 0.3 });
      for (let k = 0; k < 2 + (Math.random() < 0.5 ? 1 : 0); k++) bubble(480 + 700 * Math.random(), 0.012 + 0.01 * Math.random(), pan, 0.03 + 0.09 * k + 0.04 * Math.random(), 0.07);
    },
  };
}
