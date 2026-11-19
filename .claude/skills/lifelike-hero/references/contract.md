# The scene contract

Every scene is one module with the same small shape, so a page can host any of them the same way, the gallery
and the demo furniture work without knowing which scene they hold, and a scene can be lifted into another site.
`check-hero.mjs` tests most of this; the reasons are here for when a check fails or a scene has to depart from
the scaffold.

Contents: [The module](#the-module) · [The DOM](#the-dom) · [States](#states) · [Input](#input) ·
[Motion and its absence](#motion-and-its-absence) · [When WebGL is not there](#when-webgl-is-not-there) ·
[Phones](#phones) · [Quality](#quality) · [Sound](#sound) · [Files a new scene touches](#files-a-new-scene-touches) ·
[A scene in another project](#a-scene-in-another-project)

## The module

```js
import mount, { controls, actions } from './src/<id>/index.js';

const hero = mount(root, { /* options */ });   // root: an element with class="hero"
hero.update({ speed: 1.5 });                    // any options, at any time
hero.action('feed');                            // what the button does; ignored until the scene has loaded
hero.destroy();                                 // the root is handed back exactly as it came
```

- **`mount(root, options)`** is the default export. It must be safe to call before fonts, textures or WebGL are
  ready: it lays out the DOM at once, and the picture arrives when it can.
- **Options are tidied, never trusted.** One function (`tidy` or `read`) turns whatever a page passes into values
  inside the ranges the scene was built for: numbers clamped, counts rounded, enums checked, rubbish replaced by
  the default. `update()` merges and tidies again. A page's slider must not be able to break a buffer size.
- **Two options every scene has:** `text` (default true; false shows the scene alone, with the headline gone from
  the picture too) and `sound` (default false).
- **`controls` and `actions`** are exported so a page can build its own panel: `{ id, label, min, max, step,
  value, unit? }` or `{ id, label, options, value }`, and `{ id, label }`. Their ranges are the ones `tidy` holds.
- **`destroy()`** stops the loop, removes every listener and observer, releases GPU resources and *the context
  itself* (`renderer.forceContextLoss()`: browsers allow only a handful, and mounts would otherwise pile up until
  the oldest is dropped), closes the sound, and leaves the root with no children, classes, attributes or inline
  styles of the scene's. Abort listeners before releasing the context, or the loss handler runs on a root that
  has already been handed back.
- **Two scenes on one page must not interfere:** uniforms are objects made per mount, never module-level state.

## The DOM

```html
<canvas class="x__canvas" aria-hidden="true"></canvas>
<h1 class="x__title">Low Water</h1>
<button type="button" class="x__cue">Drop a pebble</button>
<p class="x__note"><span>Saltmarsh · home hero</span><span>Tórshavn · 2026</span></p>
<p class="sr-only" role="status"></p>
```

- The headline is **one real `<h1>`**, always. When the scene draws the letters itself the `<h1>` becomes
  transparent (opacity 0), never `display: none` or `visibility: hidden`: assistive tech reads it, and it is what
  shows before the scene arrives and when it never does.
- The main action has **a real `<button>`**, first in the tab order. It acts at a seeded spot of its own, a
  different one each time, the same ones on every load.
- **`role="status"`** announces what an action did, in a sentence ("Pellet 3 dropped; the koi swim to it.").
- Every **canvas is `aria-hidden`**: the picture is decoration to a screen reader; the words carry the meaning.
- Styles are a BEM block named after the scene, in `style.css` beside it; shared tokens come from `base.css`.

## States

The root element carries the scene's state as classes, and CSS does the rest:

| Class | Means | CSS does |
| --- | --- | --- |
| `is-ready` | the first frame is drawn | fades the canvas in (and, where the scene draws the letters, the `<h1>` out) |
| `is-static` | WebGL is missing or its context is lost | hides the canvas and the cue, shows a still ground in the picture's colours |
| `is-bare` | `text: false` | hides headline, cue and captions (`visibility: hidden`, so the layout holds) |
| `is-still` | reduced motion | removes transitions |

The page chrome watches for `is-ready` or `is-static` to lift the opening picture, so use those names (the older
scenes' `is-live` and `koi--ready` are also recognised; see the `ponytail:` note in `src/shared/chrome.js`).

## Input

- **Hover belongs to fine pointers:** gate on `finePointer()` and skip `pointerType === 'touch'`: a finger that
  merely passes over the scene does nothing.
- **A finger gets the tap, the button and a stroke.** `stroke(root, { move, end }, signal)` from the kit is a
  finger drawn sideways across the scene. Give it what a hand on this subject would really do (the grass parts
  and a row is sown, a finger trails in the pond, the misted glass is wiped), not a copy of the hover for its own
  sake. It starts after a few pixels, a stroke that starts upright is the page's scroll, and the click it might
  end with is swallowed. Say in the README what a phone can do.
- **Act on `click`, not `pointerdown`,** and give the root `touch-action: pan-y pinch-zoom`: a scroll that starts
  on the scene stays a scroll, and a reader can still zoom. A drag that the scene uses (sowing a row, turning the
  sky) starts only after a few pixels of travel, and the click that ends it is swallowed.
- **Pointer positions are measured against the canvas's box** each time; the page may have scrolled.
- Listeners are added with an `AbortController` signal (or collected for removal) so `destroy()` cannot miss one.

## Motion and its absence

- `loop(root, tick)` from the kit runs only while the scene is on screen and the tab is visible, and hands `tick`
  a clamped `dt` in seconds. Do not start your own `requestAnimationFrame` loop.
- **Reduced motion** (`reducedMotion()`: the system setting, or `?reduced` in the address bar) means no loop at
  all. The scene draws one settled frame of a chosen moment (`STILL_T`) and draws again only when the visitor
  does something, showing the outcome complete. The grain does not move either: two screenshots a second apart
  must be identical.
- Redraws without a loop are coalesced into one frame (`once()`).
- Layout comes from a `ResizeObserver` on the root, and again when `document.fonts.ready` resolves, because the
  real typeface moves the headline's lines.

## When WebGL is not there

- **No WebGL 2** (or no float render targets, if the scene needs them): add `is-static`, log one `console.info`,
  throw nothing. The headline stands on a still ground; the cue is hidden because there is nothing to act on.
- **A lost context** (`webglcontextlost`: a GPU process restart, a driver reset): `preventDefault()`, stop
  drawing, add `is-static`. On `webglcontextrestored`, either let three.js rebuild its resources (re-bake any
  render target you filled once) or build a fresh renderer, then remove `is-static`.
- A texture that fails to load is the same case as no WebGL: fall back, do not half-draw.

## Phones

- **The screen's own edges.** Pages are `viewport-fit=cover`, so the picture runs under a notch and round corners.
  Place type and buttons with `--edge-l`, `--edge-r` and `+ var(--edge-b)` from `base.css`, not `--gutter`
  alone, so they keep clear of them.
- **On its side** a phone is 320 to 430 px tall, and there the hero takes the screen's height (`base.css` lifts
  its 420 px floor): the scene's layout has to hold at that height, with the plate line on screen.
  `check-hero.mjs` photographs it at 844 × 390.
- **A cue a thumb can hit:** 44 px tall under `(pointer: coarse)`. Hover looks go under `(hover: hover)`, or a
  tapped button keeps its hover look on a phone.
- **A lighter start:** see `opening()` under Quality.

## Quality

- `quality()` is `'low'`, `'high'` or `'auto'`. `low` is a genuinely cheaper scene: fewer instances, no bloom,
  smaller targets. The screenshot tools pass `q=high`.
- `governor()` scales the render pixel ratio between a floor and a ceiling to hold the frame rate; the scene
  resizes its targets in `onChange`. Choose the ceiling for the first frames, which no governor can save, and pass
  `start: opening(w, h, ceiling)`: a screen without a fine pointer (a phone, a tablet) then opens at about a
  megapixel, and the governor climbs from there when the frames have room.
- CSS size and render size are separate: `renderer.setSize(w * ratio, h * ratio, false)` and let CSS stretch
  the canvas.

## Sound

`sound.js` exports `voices(kit)`, which builds the bed (connected to `kit.dry`) and returns one function per
voice. The scene calls `snd.play('name', ...args)`; nothing sounds unless the `sound` option is on, and no
AudioContext exists until then. Beds sit near −40 dBFS and voices peak near −20; `scripts/sound-check.mjs` renders
each offline and holds them there, so add the scene to its `SCENES` table.

## Files a new scene touches

`new-hero.mjs` writes the first group, `add-to-gallery.mjs` edits the second, the third is by hand.

| File | What |
| --- | --- |
| `src/<id>/*` | the scene |
| `<id>.html` | its page: mounts it, hands `controls` and `actions` to the chrome |
| `public/assets/<id>/CREDITS.md` | one row per file: what it was made from, source, author, licence |
| `vite.config.js` | the page joins `build.rollupOptions.input` |
| `index.html` | the card: `<a href="<id>.html" data-id="<id>">Name <span>Client · Line</span></a>` |
| `src/gallery/style.css` | `--<id>` in both `:root` rules (wide, tall) and `[data-id='<id>'] { --still: var(--<id>); }` |
| `scripts/stills.mjs` | the id joins the default list |
| `<id>.html` | the `.poster` rules and `<div class="poster">`: the page opens on the still its card closed on |
| `public/assets/gallery/<id>-wide.jpg`, `-tall.jpg` | made by `scripts/stills.mjs <id>` |
| `src/gallery/index.js` | `draw()`: a trace for the lit card in the scene's own manner (optional, but each of the three has one) |
| `scripts/gallery-check.mjs` | `ORDER`, the `% 3` next to it, `shown: 3` |
| `scripts/sound-check.mjs` | a row in `SCENES` |
| `README.md` | a visitor's section with a picture (`docs/readme/<id>.jpg`), "How each scene works", the options and credits tables, the project layout, and the word "three" wherever it counts scenes |
| `package.json`, `index.html` | descriptions and titles that say "three" |

Asset paths in source are always the literal `'/assets/<id>/...'` (quote first): the build's `asset-base` plugin
rewrites exactly that pattern for GitHub Pages, where the site lives under `/<repo>/`.

## A scene in another project

A scene needs only `src/shared/kit.js`, `src/shared/sound.js`, `src/shared/base.css`, its own folder and its
`public/assets/<id>/`, plus `three` and the fonts `base.css` imports. It is written for Vite (it imports CSS from
JavaScript). The scaffold expects this repo's layout; to start a scene elsewhere, copy those shared files and
the template in `assets/template/` by hand and replace the `{{...}}` tokens.
