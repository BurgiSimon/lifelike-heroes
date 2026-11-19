// The scene's sound, heard from a roof at dusk: the city below (a low wash that swells and settles), the starlings
// on the sign talking among themselves, and what the visitor sets off: a clap and its slap back off the wall
// opposite, the rush of a hundred birds going up, the small flutter of one coming back, the hush that crosses the
// flock when a falcon is in it. Every voice takes pan: -1 left to 1 right.
// Levels are low on purpose: a bed near -40 dBFS, a voice peaking near -20 (see src/shared/sound.js).
export function voices(kit) {
  const src = kit.noise();
  const far = kit.filter('lowpass', 260, 0.5); const wash = kit.gain(0.1); const swell = kit.gain(1);
  // the flock itself, a long way off: thousands of wings are a soft, high hiss
  const wings = kit.filter('bandpass', 2600, 0.5); const hiss = kit.gain(0.011);
  src.connect(far); far.connect(wash); wash.connect(swell);
  src.connect(wings); wings.connect(hiss); hiss.connect(swell);
  swell.connect(kit.dry);
  kit.sway(swell.gain, 0.06, 0.26); kit.sway(swell.gain, 0.17, 0.13); kit.sway(wings.frequency, 0.08, 700); kit.sway(hiss.gain, 0.13, 0.005);

  return {
    // two hands: a crack, and its echo off the house across the street
    clap(pan) {
      kit.burst({ f: 1900, to: 1300, q: 0.7, attack: 0.001, decay: 0.06, gain: 0.12, pan, send: 0.6 });
      kit.burst({ f: 1500, to: 1000, q: 0.8, at: 0.19, attack: 0.002, decay: 0.09, gain: 0.03, pan: -pan, send: 0.6 });
    },
    // birds going up off the sign: wingbeats, more of them and longer the more birds there are
    lift(pan, n = 1) {
      const many = Math.min(1, n / 60); const beats = Math.round(3 + 16 * many);
      for (let i = 0; i < beats; i++) kit.burst({ f: 1100 + 500 * Math.random(), to: 700, q: 0.9, at: i * 0.07 + 0.03 * Math.random(), attack: 0.012, decay: 0.07, gain: (0.022 + 0.05 * many) * (1 - i / (beats + 2)), pan: pan + (Math.random() - 0.5) * 0.5, send: 0.25 });
    },
    // one comes back and folds its wings
    land(pan) { for (let i = 0; i < 3; i++) kit.burst({ f: 1500, to: 900, q: 1.1, at: i * 0.06, attack: 0.008, decay: 0.05, gain: 0.034 - 0.008 * i, pan, send: 0.2 }); },
    // the flock starts at the falcon: a rush that passes over
    wave(pan) { kit.burst({ f: 1800, to: 900, q: 0.6, attack: 0.18, decay: 0.9, gain: 0.05, pan, send: 0.3 }); },
    // a starling on the sign says something: a click, a whistle, a creak, never the same twice
    chatter(pan) {
      const f = 2200 + 2400 * Math.random(); const kind = Math.random();
      if (kind < 0.4) kit.note({ f, to: f * (0.7 + 0.6 * Math.random()), attack: 0.004, decay: 0.07 + 0.08 * Math.random(), gain: 0.022, pan, send: 0.3 });
      else if (kind < 0.75) { kit.note({ f, attack: 0.002, decay: 0.02, gain: 0.02, pan, send: 0.2 }); kit.note({ f: f * 1.2, at: 0.05, attack: 0.002, decay: 0.02, gain: 0.016, pan, send: 0.2 }); }
      else kit.note({ f: f * 0.6, to: f * 0.9, attack: 0.02, decay: 0.16, gain: 0.016, pan, send: 0.3, type: 'triangle' });
    },
  };
}
