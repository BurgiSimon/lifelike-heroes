// Page chrome of the demo pages: a Hide text tab, a Sound tab and an Options panel that slides in from the right edge;
// on a phone one menu button in the top left corner opens the panel, and the two switches sit inside it. It lives outside the hero
// and only talks to it through update() and action(). controls and actions come from the scene.
import './chrome.css';
import { soundPref } from './sound.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function chrome(hero, { controls = [], actions = [] } = {}) {
  const bar = document.createElement('div');
  bar.className = 'chrome';
  bar.innerHTML = `
    <div class="chrome__tabs">
      <button type="button" class="chrome__tab" data-text>Hide text</button>
      <button type="button" class="chrome__tab" data-sound>Sound: off</button>
      <button type="button" class="chrome__tab" data-open aria-expanded="false" aria-controls="chrome-panel">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path class="chrome__burger" d="M3 6h14M3 10h14M3 14h14"/><path class="chrome__cross" d="M5 5l10 10M15 5L5 15"/></svg>
        <span>Options</span>
      </button>
    </div>
    <form class="chrome__panel" id="chrome-panel" aria-label="Scene options" inert>
      <div class="chrome__actions chrome__small"><button type="button" data-text>Hide text</button><button type="button" data-sound>Sound: off</button></div>
      ${controls.map((c) => `<label class="chrome__row"><span>${c.label}</span><output></output>${c.options
        ? `<select name="${c.id}">${c.options.map((o) => `<option value="${o}"${o === c.value ? ' selected' : ''}>${cap(o)}</option>`).join('')}</select>`
        : `<input type="range" name="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">`}</label>`).join('')}
      <div class="chrome__actions">
        ${actions.map((a) => `<button type="button" data-action="${a.id}">${a.label}</button>`).join('')}
        <button type="reset">Reset</button>
      </div>
    </form>`;
  const open = bar.querySelector('[data-open]'); const form = bar.querySelector('form');

  // A switch stands twice: as an edge tab, and as its twin inside the panel for a phone. Its label says what a click does
  // (Hide text) or how things stand (Sound: off).
  const flip = (attr, label, apply, on = false) => {
    const all = bar.querySelectorAll(`[${attr}]`); const show = () => { for (const t of all) t.textContent = label(on); };
    for (const b of all) b.addEventListener('click', () => { on = !on; show(); apply(on); });
    show();
  };
  flip('data-text', (on) => (on ? 'Show text' : 'Hide text'), (on) => hero.update({ text: !on }));
  // Sound is off until a visitor asks for it, here or on the gallery; the choice then holds on every page (the page
  // mounts its scene with it).
  flip('data-sound', (on) => `Sound: ${on ? 'on' : 'off'}`, (on) => { soundPref.set(on); hero.update({ sound: on }); }, soundPref.get());

  const show = (on) => { bar.classList.toggle('is-open', on); form.inert = !on; open.setAttribute('aria-expanded', on); };
  open.addEventListener('click', () => show(form.inert));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !form.inert) { show(false); open.focus(); } });

  // A control's value as the hero takes it; a range also shows it beside its label.
  const read = (c) => {
    const el = form.elements[c.id];
    if (c.options) return el.value;
    el.previousElementSibling.value = `${el.value}${c.unit ? ` ${c.unit}` : ''}`;
    return +el.value;
  };
  controls.forEach(read);
  form.addEventListener('input', (e) => { const c = controls.find((k) => k.id === e.target.name); if (c) hero.update({ [c.id]: read(c) }); });
  // The form's own reset puts every control back to its default; the hero follows once it has.
  form.addEventListener('reset', () => setTimeout(() => hero.update(Object.fromEntries(controls.map((c) => [c.id, read(c)])))));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('click', (e) => { const id = e.target.dataset.action; if (id) hero.action(id); });

  document.body.append(bar);

  // The page opened on a still of the scene (.poster). It goes once the scene's root says the scene is drawn, or
  // that it never will be and its own fallback stands.
  // ponytail: read off the class names the three scenes happen to use (is-live, is-ready, koi--ready, *static); a
  // `ready` promise in the scene contract if a fourth scene names its states differently.
  const poster = document.querySelector('.poster'); const root = document.querySelector('.hero');
  if (poster && root) {
    const drawn = () => {
      if (!/\b(is-live|is-ready|koi--ready|is-static|koi--static)\b/.test(root.className)) return;
      watch.disconnect(); poster.classList.add('is-gone'); setTimeout(() => poster.remove(), 1600);
    };
    const watch = new MutationObserver(drawn); watch.observe(root, { attributes: true, attributeFilter: ['class'] });
    drawn();
  }
}
