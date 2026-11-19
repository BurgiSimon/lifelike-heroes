// Sound for the scenes, synthesised with Web Audio: there are no audio files. A scene describes its voices as a
// function (kit) => ({ name(...args) {} }); rig() is the kit, a few building blocks on one AudioContext, and
// createSound() owns that context's life: built at the first switch-on (a browser only lets sound start from a
// click or a key press), faded in and out, asleep while switched off and while the tab is hidden.
// Levels are low on purpose: a bed sits near -40 dBFS and a voice peaks near -20 (scripts/sound-check.mjs holds them there).

export function rig(ctx, room = 2) {
  const master = ctx.createGain(); master.connect(ctx.destination);
  const dry = ctx.createGain(); dry.connect(master);
  // A room for the voices to ring in: an impulse of fading noise made here, heard through a low-pass so it stays soft.
  const n = Math.round(ctx.sampleRate * room); const impulse = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = impulse.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4; }
  const wet = ctx.createBiquadFilter(); wet.type = 'lowpass'; wet.frequency.value = 3200;
  const hall = ctx.createConvolver(); hall.buffer = impulse;
  const back = ctx.createGain(); back.gain.value = 0.5;
  wet.connect(hall); hall.connect(back); back.connect(master);
  // Four seconds of white noise, looped: every wind and every water here is this, filtered.
  const hiss = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  for (let d = hiss.getChannelData(0), i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // One-shot voices are dropped while a live context sleeps: its clock stands still, and everything asked of it
  // meanwhile would sound at once when it wakes.
  const live = typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
  const asleep = () => live && ctx.state !== 'running';
  // pan: -1 left to 1 right; send: how much of it goes to the room
  const place = (node, pan, send) => {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.7;
    node.connect(p); p.connect(dry);
    if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(wet); }
  };
  // up in `attack`, then fading: 43 dB down after `decay` seconds. Returns when it is silent and its source may stop.
  const shape = (node, t, attack, decay, gain, pan, send) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setTargetAtTime(0, t + attack, decay / 5);
    node.connect(g); place(g, pan, send);
    return t + attack + decay * 1.6;
  };
  const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  return {
    ctx, master, dry, wet,
    noise() { const s = ctx.createBufferSource(); s.buffer = hiss; s.loop = true; s.start(); return s; },
    filter,
    gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; },
    // a slow sway of a parameter about its value: ±depth at hz
    sway(param, hz, depth) { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); },
    // a pitched voice. `to` glides the pitch there while it fades (a bubble rises, a drop falls)
    note({ f, to = f, at = 0, attack = 0.005, decay = 0.5, gain = 0.05, pan = 0, send = 0.3, type = 'sine' }) {
      if (asleep()) return;
      const t = ctx.currentTime + at; const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay * 0.7);
      o.start(t); o.stop(shape(o, t, attack, decay, gain, pan, send));
    },
    // a breath of noise about the pitch f: a splash, a rustle. `to` moves the pitch there while it sounds
    burst({ f = 2000, to = f, q = 1, at = 0, attack = 0.005, decay = 0.1, gain = 0.05, pan = 0, send = 0.2 }) {
      if (asleep()) return;
      const t = ctx.currentTime + at; const s = ctx.createBufferSource(); s.buffer = hiss; s.loop = true;
      const band = filter('bandpass', f, q); s.connect(band);
      if (to !== f) { band.frequency.setValueAtTime(f, t); band.frequency.exponentialRampToValueAtTime(to, t + attack + decay * 0.7); }
      s.start(t, Math.random() * 3); s.stop(shape(band, t, attack, decay, gain, pan, send));
    },
  };
}

// The visitor's choice of sound on the demo pages, kept from page to page: the gallery's switch and every scene's
// Sound tab set it, and a scene page mounts with it. The scenes themselves never read it.
export const soundPref = {
  get() { try { return localStorage.getItem('lifelike-heroes:sound') === 'on'; } catch { return false; } },
  set(on) { try { localStorage.setItem('lifelike-heroes:sound', on ? 'on' : 'off'); } catch { /* storage is blocked: the choice lasts for this page */ } },
};

const KICK = ['pointerdown', 'pointerup', 'click', 'keydown'];   // the events a browser lets sound start from
export function createSound(voices, { room } = {}) {
  let ctx = null; let kit = null; let v = null; let on = false; let nap = 0;
  const wake = () => { if (on && ctx?.state === 'suspended' && !document.hidden) ctx.resume(); };
  const hide = () => { if (document.hidden) ctx?.suspend(); else wake(); };
  // Switched on by code, not by a click: the next press starts it. iOS lets sound start only from the end of a touch
  // (pointerup, click), not its start; capture, so it is awake before a scene's own click plays its first voice.
  for (const t of KICK) addEventListener(t, wake, true);
  document.addEventListener('visibilitychange', hide);
  return {
    set(want) {
      if (want === on) return;
      on = want;
      if (on && !ctx && window.AudioContext) { ctx = new AudioContext(); kit = rig(ctx, room); kit.master.gain.value = 0; v = voices(kit); }
      if (!ctx) return; // a browser without Web Audio stays silent
      clearTimeout(nap);
      kit.master.gain.cancelScheduledValues(ctx.currentTime); kit.master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.5 : 0.12);
      if (on) wake(); else nap = setTimeout(() => ctx?.suspend(), 700);
    },
    play(name, ...args) { if (on && v) v[name]?.(...args); },
    destroy() {
      for (const t of KICK) removeEventListener(t, wake, true); document.removeEventListener('visibilitychange', hide);
      clearTimeout(nap); on = false; v = null; ctx?.close(); ctx = null;
    },
  };
}
