// The scene's sound: a still workshop, and in it the movement. Its tick is three sounds a few thousandths of a
// second apart (the fork unlocks, the tooth gives its push, the next tooth drops onto the pallet), a little higher
// one way than the other, which is why a watch says tick, tock. Winding is the click falling behind each tooth of
// the ratchet, and the grit of the crown. Levels are low on purpose: a bed near -40 dBFS, voices well under -20:
// a tick is heard six times a second for as long as the page is open.
export function voices(kit) {
  const src = kit.noise();
  const body = kit.filter('lowpass', 260, 0.4); const air = kit.filter('bandpass', 5200, 0.5); const airG = kit.gain(0.05);
  const swell = kit.gain(1); const bed = kit.gain(0.085);
  src.connect(body); body.connect(bed); src.connect(air); air.connect(airG); airG.connect(bed); bed.connect(swell); swell.connect(kit.dry);
  kit.sway(swell.gain, 0.07, 0.22); kit.sway(swell.gain, 0.19, 0.12); kit.sway(body.frequency, 0.05, 60);

  return {
    // one beat. odd: which way the balance went. at: s from now it falls (the page hears of a beat a frame late, so
    // it asks for the next one ahead of time, and the ticks stay even). loud: 0..1, how wide the balance swings.
    tick(odd = 0, at = 0, loud = 0.7) {
      const f = odd ? 4300 : 5100; const g = 0.04 + 0.035 * loud; const pan = 0.25;
      kit.burst({ f: f * 1.25, q: 2.2, at, attack: 0.0006, decay: 0.004, gain: g * 0.3, pan, send: 0.12 });
      kit.burst({ f, q: 2.6, at: at + 0.0034, attack: 0.0006, decay: 0.006, gain: g * 0.65, pan, send: 0.12 });
      kit.burst({ f: f * 0.82, q: 2.2, at: at + 0.0072, attack: 0.0006, decay: 0.012, gain: g, pan, send: 0.16 });
      kit.note({ f: odd ? 2950 : 3350, at: at + 0.0072, attack: 0.0008, decay: 0.03, gain: g * 0.12, pan, send: 0.2 });   // the plates ring, barely
    },
    // the click drops behind n teeth of the ratchet, one after another
    click(n = 1, pan = -0.4) {
      for (let i = 0; i < Math.min(n, 4); i++) {
        const at = i * 0.014;
        kit.burst({ f: 2600 + 300 * Math.random(), q: 3, at, attack: 0.0008, decay: 0.016, gain: 0.11, pan, send: 0.25 });
        kit.note({ f: 1750 + 120 * Math.random(), at, attack: 0.001, decay: 0.035, gain: 0.02, pan, send: 0.3, type: 'triangle' });
      }
    },
    // a turn of the crown between finger and thumb: the grit of the winding wheels under the clicks
    crown(pan = -0.4) {
      kit.burst({ f: 900, to: 1500, q: 0.7, attack: 0.05, decay: 0.3, gain: 0.03, pan, send: 0.2 });
    },
    // fully wound: the crown comes up against the spring and gives nothing
    stop(pan = -0.4) {
      kit.note({ f: 210, to: 150, attack: 0.002, decay: 0.07, gain: 0.07, pan, send: 0.2 });
      kit.burst({ f: 1400, q: 1.2, attack: 0.001, decay: 0.03, gain: 0.03, pan, send: 0.2 });
    },
  };
}
