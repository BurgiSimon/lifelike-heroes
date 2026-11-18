// The scene's sound, heard from inside the room: rain on the glass (a soft hiss that thickens and thins, over the
// low wash of the city beyond it), the tick of a heavy drop landing, and the small wet sounds of the visitor's own
// doing: a drop gathering and letting go, a fingertip rubbing mist off glass. Every voice takes pan: -1 left to 1 right.
// Levels are low on purpose: a bed near -40 dBFS, a voice peaking near -20 (see src/shared/sound.js).
export function voices(kit) {
  const src = kit.noise();
  // the city and the weather outside, through a closed window: low and slow
  const far = kit.filter('lowpass', 300, 0.5); const wash = kit.gain(0.1); const swell = kit.gain(1);
  // the rain on the pane itself: a narrow hiss
  const pane = kit.filter('bandpass', 3400, 0.6); const hiss = kit.gain(0.012);
  src.connect(far); far.connect(wash); wash.connect(swell);
  src.connect(pane); pane.connect(hiss); hiss.connect(swell);
  swell.connect(kit.dry);
  kit.sway(swell.gain, 0.07, 0.28); kit.sway(swell.gain, 0.19, 0.14); kit.sway(pane.frequency, 0.045, 700); kit.sway(far.frequency, 0.031, 70);

  let rubbed = -1;
  return {
    // a heavy drop lands on the far side of the glass: a dull tap, lower the bigger the drop
    tick(pan, r = 5) { kit.burst({ f: 2600 - 190 * r, to: 900, q: 1.6, attack: 0.002, decay: 0.05, gain: 0.03 + 0.004 * r, pan, send: 0.25 }); },
    // a rain drop gives way and starts down the pane
    slip(pan) { kit.burst({ f: 1500, to: 700, q: 2.5, attack: 0.02, decay: 0.16, gain: 0.05, pan, send: 0.2 }); },
    // the visitor's drop: it gathers with a small wet click, a moment before it goes
    drip(pan) {
      kit.note({ f: 520, to: 880, attack: 0.004, decay: 0.07, gain: 0.07, pan, send: 0.3 });
      kit.note({ f: 1240, to: 1700, at: 0.05, attack: 0.003, decay: 0.05, gain: 0.03, pan, send: 0.3 });
    },
    // and lets go: a short trickle, falling
    run(pan) { kit.burst({ f: 1900, to: 800, q: 3, attack: 0.03, decay: 0.34, gain: 0.075, pan, send: 0.3 }); },
    // a fingertip on wet glass: a soft rub, a few times a second at most, a little brighter the faster the hand
    wipe(pan, speed = 400) {
      const t = kit.ctx.currentTime; if (t - rubbed < 0.16) return; rubbed = t;
      const f = 700 + Math.min(1400, speed * 0.7);
      kit.burst({ f, to: f * 1.25, q: 1.3, attack: 0.05, decay: 0.2, gain: 0.05, pan, send: 0.15 });
    },
  };
}
