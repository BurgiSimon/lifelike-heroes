// The scene's sound. STARTER: open air over the sand (a low bed that swells and settles, never quite the same
// twice) and one voice, the soft thud of a mark being left. Every voice takes pan: -1 left to 1 right.
// Levels are low on purpose: a bed near -40 dBFS, a voice peaking near -20 (see src/shared/sound.js).
export function voices(kit) {
  const src = kit.noise();
  const body = kit.filter('lowpass', 520, 0.5); const swell = kit.gain(1); const bed = kit.gain(0.085);
  src.connect(body); body.connect(bed); bed.connect(swell); swell.connect(kit.dry);
  kit.sway(swell.gain, 0.09, 0.3); kit.sway(swell.gain, 0.23, 0.15); kit.sway(body.frequency, 0.05, 130);

  return {
    // a mark is left: the sand gives with a low thud, and the thrown grains hiss as they settle
    mark(pan) {
      kit.note({ f: 150, to: 70, decay: 0.16, gain: 0.1, pan, send: 0.3 });
      kit.burst({ f: 3400, to: 2200, q: 0.8, at: 0.03, attack: 0.01, decay: 0.3, gain: 0.035, pan, send: 0.3 });
    },
  };
}
