// The scene's sound, heard from inside the room: the lime tree outside the window (leaves in a breeze, thicker
// when it gusts), the hush of the street beyond the glass, and the small glass sounds of the crystals: one
// rings as it is hung, and taps the pane when a gust swings it back. Every voice takes pan: -1 left to 1 right.
// Levels are low on purpose: a bed near -40 dBFS, a voice peaking near -20 (see src/shared/sound.js).
export function voices(kit) {
  const src = kit.noise();
  // leaves: a high, dry hiss through the glass
  const leaf = kit.filter('bandpass', 4200, 0.5); const hiss = kit.gain(0.02); const swell = kit.gain(1);
  // the room: the street, low and far
  const far = kit.filter('lowpass', 240, 0.5); const hush = kit.gain(0.085);
  src.connect(leaf); leaf.connect(hiss); hiss.connect(swell);
  src.connect(far); far.connect(hush); hush.connect(swell);
  swell.connect(kit.dry);
  kit.sway(swell.gain, 0.06, 0.25); kit.sway(swell.gain, 0.17, 0.13); kit.sway(leaf.frequency, 0.05, 900); kit.sway(hiss.gain, 0.11, 0.008);

  // cut glass, struck: a few partials that are not quite a chord, the high ones dying first
  const ring = (f, gain, pan, at = 0) => {
    kit.note({ f, at, attack: 0.002, decay: 1.5, gain, pan, send: 0.5 });
    kit.note({ f: f * 2.76, at, attack: 0.002, decay: 0.8, gain: gain * 0.4, pan, send: 0.5 });
    kit.note({ f: f * 5.4, at, attack: 0.001, decay: 0.35, gain: gain * 0.18, pan, send: 0.4 });
  };
  const NOTES = [1568, 1760, 2093, 1319, 2349, 1976];   // each crystal has its own pitch, by its size
  let rustled = -1;
  return {
    // a crystal is hung: it rings once against the hook, and again, softer, as it settles
    hang(pan, n = 0) { ring(NOTES[n % NOTES.length], 0.075, pan); ring(NOTES[n % NOTES.length] * 1.003, 0.025, pan, 0.19); },
    // a swinging crystal touches the pane
    tap(pan, hard = 0.2) { kit.note({ f: 2900, to: 2500, attack: 0.001, decay: 0.09, gain: Math.min(0.06, 0.02 + hard * 0.08), pan, send: 0.4 }); },
    // a gust reaches the tree: the leaves rush, then let go
    rush(pan) { kit.burst({ f: 3200, to: 4600, q: 0.6, attack: 0.5, decay: 2.2, gain: 0.05, pan, send: 0.2 }); },
    // the visitor's own breeze through the leaves: a short rustle, a few times a second at most
    rustle(pan, speed = 400) {
      const t = kit.ctx.currentTime; if (t - rustled < 0.22) return; rustled = t;
      kit.burst({ f: 3600 + Math.min(1500, speed), q: 0.7, attack: 0.06, decay: 0.3, gain: 0.03, pan, send: 0.15 });
    },
  };
}
