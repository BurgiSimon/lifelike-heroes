// The night's sound: a low, slow chord that never quite repeats, a far bell now and then, a glass tick as the
// pencil finds another star, and one bell per star when a constellation is inked. pan: -1 left to 1 right.
const SCALE = [0, 2, 4, 7, 9];   // pentatonic on A, the chord's own notes among them
const step = (k) => 2 ** ((SCALE[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5)) / 12);

export function voices(kit) {
  const { ctx } = kit;
  // the chord: A, E, A, E, B, each voice soft-edged and swelling on a clock of its own
  const pad = kit.gain(1); const soft = kit.filter('lowpass', 900, 0.5);
  pad.connect(soft); soft.connect(kit.dry); const far = kit.gain(0.5); soft.connect(far); far.connect(kit.wet);
  [[110, 0.0066, 0.031], [164.81, 0.0088, 0.047], [220.4, 0.0088, 0.039], [329.63, 0.006, 0.061], [493.88, 0.0033, 0.053]].forEach(([f, level, hz]) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = kit.gain(level); kit.sway(g.gain, hz, level * 0.7);
    o.connect(g); g.connect(pad); o.start();
  });

  const bell = (k, gain, pan, at = 0, decay = 1.6) => {
    const f = 220 * step(k); const soften = Math.min(1, 520 / f) ** 0.6; // high notes ring quieter
    kit.note({ f, at, decay, gain: gain * soften, pan, send: 0.7 });
    kit.note({ f: f * 2, at, decay: decay * 0.35, gain: gain * soften * 0.25, pan, send: 0.7 });
  };
  let ticked = -1;
  return {
    // a constellation of `count` stars is inked: one bell per star, in step with the lines (`stagger` s apart);
    // the chord swells as the aurora does, up in a second and gone in ten
    pin(count, n, pan, stagger) {
      for (let k = 0; k < count; k++) bell(2 + (n % 2) + k, 0.06, pan, k * stagger);
      const t = ctx.currentTime; pad.gain.setTargetAtTime(1.7, t, 0.5); pad.gain.setTargetAtTime(1, t + 1.5, 3);
    },
    // the pencil's nearest star changed
    tick(star, pan) { if (ctx.currentTime - ticked < 0.14) return; ticked = ctx.currentTime; bell(10 + (star % 5), 0.03, pan, 0, 0.5); },
    clear() { for (let k = 0; k < 4; k++) bell(9 - k * 2, 0.03, 0, k * 0.12, 1.2); },
    twinkle() { bell(10 + Math.floor(Math.random() * 6), 0.028, Math.random() * 2 - 1, 0, 2.6); },
  };
}
