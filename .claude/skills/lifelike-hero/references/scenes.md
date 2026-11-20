# The three scenes: where each technique lives

Read the file before borrowing from it: each opens with a comment that says what it is for and which units it
works in. Line counts are a guide to how much there is to read.

## Shared (`src/shared`): import, do not edit

| File | What it gives a scene |
| --- | --- |
| `kit.js` | `clamp`, `lerp`, `rnd(i)` (seeded 0..1), `reducedMotion()` (also `?reduced`), `finePointer()`, `quality()` (`?q=low|high`, else `auto`), `loop(el, cb)` (runs only on screen and in a visible tab, `dt` clamped), `governor({ min, max, onChange })` (render pixel ratio follows frame time) |
| `sound.js` | `createSound(voices, { room })` owns the AudioContext's life; `rig()` is the kit a scene's `voices(kit)` builds from: `noise()`, `filter()`, `gain()`, `sway()`, `note({...})`, `burst({...})`, with `kit.dry` and `kit.wet` (the room) |
| `base.css` | fonts (`--font-sans`, `--font-serif`, `--font-mono`), `--gutter`, `--ease-out`, `.hero` (fills the first screen; its canvas fills it), `.sr-only` |
| `chrome.js`, `chrome.css` | the demo pages' Hide text / Sound / Options furniture, built from a scene's `controls` and `actions`; lifts the page's opening picture when the root gets `is-ready` or `is-static` |

## Meadow (`src/meadow`): a view with depth

A level camera 1 m above the ground looks down −z at a word 26 m away. World units are metres, y up.

| Want | Look at |
| --- | --- |
| The numbers a whole scene agrees on, each with its unit and reason | `config.js` (51 lines) |
| A view camera: frame shifted so verticals stay vertical, laid out from the headline's own width, per aspect | `index.js`, `place` and `layout` |
| A DOM headline laid exactly over 3D letters | `index.js`, `place` (sets `--title-size`, `--title-top`); `style.css` |
| A pixel on screen to a point on the ground | `index.js`, `groundAt` |
| An HDRI as backdrop, with drifting clouds, a sun disc and a far ridge | `sky.js` (60) |
| Sky light as spherical harmonics, a mipped silhouette as a soft shadow, cloud shadows, haze | `glsl.js`, `LIGHT` |
| Wind as a function of place and time: ripple, slanted gust fronts, a one-off burst; the same on CPU and GPU | `glsl.js`, `WIND_GLSL`, `weatherAt` |
| 80,000 instanced blades and several species of plant, lit and bent in the vertex shader | `grass.js` (405) |
| Things that grow and wilt over time, with a cap | `flowers.js`; `index.js`, `plant` and `trim` |
| Extruded type from font outlines, a weathered PBR material, an environment reflection | `letters.js` (108), `glyphs.js` |
| A pointer as a field of springs sampled by the shader | `field.js` (50) |
| Particles carried by the same wind | `seeds.js` |
| Near-field depth of field, a bloom pyramid, veiling glare, AgX, grade, grain | `post.js` (199) |
| An 8-bit multisampled scene target that still holds bright light (`pack`/`unpack`) | `glsl.js`, `PACK`; `post.js`, `UNPACK` |
| Skipping frames when nothing changes; replanting only when the frame takes in new ground | `index.js`, `tick`, `layout` |
| Responding to reduced motion being switched while the page is open | `index.js`, `calm` |

## Koi pond (`src/koi`): a surface seen from above

World space is the hero box in CSS pixels, y down, z toward the lens. Everything is full-screen passes and a few
instanced meshes, composited in one "photograph" pass.

| Want | Look at |
| --- | --- |
| The frame as a list of passes, each target sized for what it holds | `renderer.js` (241), top comment and `render` |
| A wave equation on a texture, with drops, a soaking margin, a fixed step | `glsl/water.js`, `simFrag`; `renderer.js`, `stepSim`, `frame` |
| Wind ripples as a tileable sum of waves | `glsl/water.js`, `windFrag`; `renderer.js`, the `waves` block |
| Caustics: a sheet of triangles displaced by the surface's slope, drawn additively | `glsl/water.js`, `causticVert`/`causticFrag` |
| Looking through a rippled surface: refraction, depth colour, Fresnel sky, sun glitter | `glsl/composite.js` (203) |
| A scanned texture laid so that nothing repeats | `glsl/composite.js`, the floor block |
| A gobo: the shadow of something off-frame (roof beams) with a penumbra | `glsl/common.js`, `goboAt` |
| Shadows as a blurred mask; bright meniscus rims from the same mask | `renderer.js`, the `mask`/`shadow` targets; `composite.js`, `rim` |
| The DOM headline drawn into a texture from its own layout, then lit as part of the scene | `textmask.js` (45); `index.js`, `fit` |
| Creatures as a chain of joints with steering rules | `pond.js` (229), `fish.js` |
| Rules that draw nothing, and a Node script that proves them | `pond.js`; `scripts/pond-check.mjs` |
| A texture painted in a 2D canvas at load (varieties of koi skin) | `skins.js` |
| A still for reduced motion that shows an action's outcome | `renderer.js`, `still`; `index.js`, `feed` |
| Rebuilding the renderer after a lost context | `index.js`, `boot`, `fallback` |
| Restrained bloom, falloff, AgX, grade, grain in one pass | `glsl/composite.js`, `postFrag` (the scaffold's `filmFrag` is this) |

## Star chart (`src/stars`): real data over a night sky

Screen space is CSS pixels, y down. Two frames meet: the chart plane turns about the pole; the air, aurora and
land sit in a ground frame along the bottom edge.

| Want | Look at |
| --- | --- |
| A binary data file decoded into GPU buffers | `catalog.js` (39) |
| Building assets from public sources, reprojecting a panorama, keying a sky out | `tools/build-assets.mjs` |
| Points with a lens's profile, true brightness and colour, twinkle | `shaders.js`, `starVert`/`starFrag` |
| Atmospheric extinction and airglow toward a horizon | `shaders.js`, `air`, `skyFrag` |
| A procedural aurora in a small target, with its coarse mips as its glow | `shaders.js`, `auroraFrag`; `render.js` |
| A photographed horizon, relit; a small procedural building on it | `ground.js` (35), `shaders.js`, `groundFrag` |
| The scene kept quiet under DOM type: a feathered mask from the headline's lines | `index.js`, `measure`; `render.js`, `mask` (the scaffold has this) |
| Crisp one-pixel lines at any pixel ratio | `shaders.js`, `hair` |
| Instanced quads (one per line segment) in a y-down space: the flip reverses their winding, so the material is `DoubleSide` or nothing is drawn | `render.js`, `additive`, `lineGeo` |
| Interaction state as buffers the renderer reads; nothing allocated per frame | `chart.js` (231) |
| Lines that draw themselves edge by edge, named, with a cap and fade | `chart.js`, `INK` |
| Text labels on a second 2D canvas over the WebGL one | `labels.js` (94) |
| A drag that turns the scene, with inertia, without stealing vertical scroll | `index.js`, the pointer block |
| Printing an exact CSS colour through the tone curve | `index.js`, `emit` |
| Layout that ignores a phone's address bar coming and going | `index.js`, `size` |
| A finger drawn sideways across a scene (and an upright one left to the page) | `src/shared/kit.js`, `stroke`; used by `meadow/index.js` (sows a row), `koi/index.js` (trails in the water), `mist/index.js` (wipes the glass), `light/index.js` (is the breeze), `roost/index.js` (is the falcon), `movement/index.js` (tilts it in the hand) |

## Tools (`scripts/`)

| Script | Use |
| --- | --- |
| `shot.mjs <page>` | One screenshot, with `--steps` to move, click, drag, press keys, evaluate, measure frames, and take more shots. `--soft` for software rendering, `--mobile`, `--reduced`, `--q low`. Prints what the page logged. |
| `stills.mjs [ids]` | The gallery stills and opening pictures: each scene without text, settled, wide and tall. |
| `gpu.mjs <page>` | Frame times on the Windows host's real GPU (the author's WSL machine only). |
| `pond-check.mjs`, `gallery-check.mjs`, `sound-check.mjs` | Self-checks; a new scene joins the last two. |
