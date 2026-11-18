// The night's sound: rain on the pane (a steady hiss, and the room's low hum under it), a tick for a drop that
// lands, a fuller one for the drop a click sends down, the rub of a hand on wet glass, and a breath.
// Every placed voice takes pan: -1 left to 1 right.
export function voices(kit) {
  // the rain: high noise that swells and thins a little, and a low wash under it
  const src = kit.noise();
  const high = kit.filter('bandpass', 5200, 0.6); const hiss = kit.gain(0.03);
  const low = kit.filter('lowpass', 380, 0.5); const wash = kit.gain(0.075);
  const bed = kit.gain(1);
  src.connect(high); high.connect(hiss); hiss.connect(bed);
  src.connect(low); low.connect(wash); wash.connect(bed);
  bed.connect(kit.dry);
  kit.sway(bed.gain, 0.09, 0.22); kit.sway(bed.gain, 0.23, 0.12); kit.sway(high.frequency, 0.05, 900);

  let rubbed = -1;
  return {
    // a drop lands on the glass: a dry tick, each a little different
    patter(pan) { kit.burst({ f: 2600 + 3200 * Math.random(), q: 2.5, attack: 0.001, decay: 0.03 + 0.03 * Math.random(), gain: 0.03 + 0.04 * Math.random(), pan, send: 0.25 }); },
    // the heavy one: the tap of it on the pane, and the note of the water as it starts to run
    drop(pan) {
      kit.burst({ f: 1500, q: 1.4, attack: 0.001, decay: 0.05, gain: 0.16, pan, send: 0.3 });
      kit.note({ f: 520, to: 300, attack: 0.004, decay: 0.16, gain: 0.07, pan, send: 0.4 });
      kit.note({ f: 880, to: 620, at: 0.07, attack: 0.004, decay: 0.09, gain: 0.025, pan, send: 0.4 });
    },
    // a hand drawn over wet glass: a soft rub, higher the faster it goes, a few times a second at most
    wipe(pan, speed) {
      const t = kit.ctx.currentTime; if (t - rubbed < 0.16) return; rubbed = t;
      kit.burst({ f: 620 + 500 * speed, to: 760 + 700 * speed, q: 1.6, attack: 0.05, decay: 0.2, gain: 0.05 + 0.05 * speed, pan, send: 0.3 });
    },
    breathe() { kit.burst({ f: 900, to: 600, q: 0.5, attack: 0.35, decay: 0.9, gain: 0.07, send: 0.35 }); },
  };
}
