# Craft: why these scenes read as photographs

A photograph is a record of light that left a real place, passed through air and a lens, and landed on a sensor. A
render gives itself away wherever it breaks that chain: light with no source, surfaces with no history, a picture
no lens could have taken. The three scenes hold up because each link is honest. This file goes link by link, with
where each idea lives in the code.

Contents: [Real ingredients](#real-ingredients) · [Light](#light) · [Material](#material) ·
[Depth and air](#depth-and-air) · [Lens and film](#lens-and-film) · [Nothing repeats](#nothing-repeats-nothing-is-straight) ·
[Things touch](#things-touch) · [Type in the picture](#type-in-the-picture) · [Motion](#motion) ·
[Fast by construction](#fast-by-construction) · [The tells](#the-tells)

## Real ingredients

Use the real thing wherever the subject holds still; write code for what has to move.

| The eye knows it too well to fake | What the scenes used |
| --- | --- |
| A sky | A photographed HDRI: backdrop *and* light source (`src/meadow/sky.js`, light constants in `config.js`) |
| Ground, stone, rust, straw | Scanned PBR sets: colour, normal, roughness, occlusion, height (`public/assets/koi`, `public/assets/meadow`) |
| What is overhead and gets mirrored | A photograph of a forest canopy, reprojected to look straight up (`koi/glsl/composite.js`, `skyAt`) |
| Where things are in nature | Measured data: 41,411 stars with true position, brightness and colour (`src/stars/catalog.js`) |
| A horizon line | A strip cut from a panorama, keyed and relit (`src/stars/ground.js`, `tools/build-assets.mjs`) |
| Letterforms | The outlines of a real typeface, extruded (`src/meadow/letters.js`, `glyphs.js`) |

Procedural, because it must answer to time and touch: water and its caustics, wind, grass and flowers, koi skins
(painted scale by scale into a texture at load, `src/koi/skins.js`), the aurora, cloud shadows.

A real ingredient still has to be relit to belong. The star chart's horizon is a *daylight* photograph reduced to
luminance and lit again by the aurora above it; the meadow's sky has its broad light divided out so its clouds can
drift while the light stays put. Dropping a photograph in untouched makes a collage.

Prepare assets offline and commit the result: resize to what the screen can show (2K is usually plenty), WebP at
80 to 85 for colour, 90+ for normal maps, pack single-channel maps together (the pond's `pebbles_aux.webp` holds
occlusion in red and height in green). A build script next to the scene (`src/stars/tools/build-assets.mjs`) is
the honest record of how a file was made when it took more than a resize.

## Light

**One key light and one sky, decided once, used by every surface.** In each scene the sun's direction and colour
are constants at the top of the shared GLSL (`koi/glsl/common.js`: `SUN_A`, `SUNCOL`, `SKYCOL`; `meadow/config.js`:
`SUN`, `SUN_COL`, `SH`), and nothing is lit by anything else. The moment one object has its own private light, the
picture stops being one place.

- **Work in linear light, unclamped.** Sunlit surfaces are several times "paper white" (`SUNCOL` is about 3 to 4).
  The scene goes into a half-float target and is folded into the display's range only at the very end. Clamping
  early is what makes highlights grey and bloom fake.
- **The sky lights the shade.** Shadows are not black, they are sky-coloured. The meadow carries the HDRI's light
  as nine spherical-harmonic terms so a blade facing any way gets the sky that is actually there
  (`meadow/glsl.js`, `skyLight`).
- **When the sky is a photograph, take the light from the same photograph.** The meadow's `SUN`, `SUN_COL` and
  `SH` were measured from its HDRI offline: the sun's direction is the brightest spot, its colour is what that spot
  delivers to a card facing it, and the nine `SH` terms are the rest of the sky integrated (irradiance over π, in
  the basis `skyLight` spells out). `find-asset.mjs get <sky> hdr` fetches the `.hdr`; three's `HDRLoader` reads it
  in Node, as `src/stars/tools/build-assets.mjs` does. A sky from one place and a sun from another never match.
- **Every shadow agrees, and softens with distance.** The word's shadow in the meadow is its silhouette read at a
  blurrier mip the further the shadow has travelled (`wordShadow`). The pond's beam shadows take a penumbra that
  widens with depth (`goboAt(p, soft)`).
- **Something stands between the light and the subject.** Roof beams over the pond, clouds over the meadow. A
  light that falls evenly on everything looks like a studio; a broken light looks like a place. It also gives a
  reason for the light to change over time (cloud shadows crossing, `cloudSun`).
- **Light bounces and gets blocked where things meet.** The grass throws its colour up onto the steel's feet and
  shades them (`letters.js`: `bounce`, `occ`). The pond floor uses the scan's own occlusion map.
- **Light the shaded side like a photographer would,** when a subject would otherwise read as a cut-out, and mark
  it as a choice (`letters.js` doubles the sky fill, under a `ponytail:` note).

## Material

- **Albedo comes from the scan, and is never pure.** No surface is one colour; nothing natural is fully
  saturated, fully black or fully white.
- **History is what makes a surface real.** Rust settles to a dark patina, rain streaks run straight down a
  plate, steel is paler near damp grass (`letters.js`). Algae gathers in the gaps between stones and in deep
  water (`composite.js`, `film`). Decide what has happened to the surface and draw that.
- **Shine only where the material has it.** Rust mirrors nothing; clean scale does. Roughness comes from a map,
  Fresnel decides how much the surface mirrors at a glancing angle, and what it mirrors is the real sky.
- **Thin things are lit in the vertex shader.** A grass blade is one to three pixels wide; there is nothing for a
  fragment to add (`meadow/grass.js`).

## Depth and air

Light is changed by what it passes through, and that change is how the eye reads distance.

- Air: the far field picks up haze lit from behind (`meadow/glsl.js`, `haze`). Starlight near the horizon passes
  through more air, dims, and loses its blue first (`stars/shaders.js`, `extinction`).
- Water: red goes first with depth, and sunlight scatters a green-teal haze into it (`koi/glsl/common.js`,
  `throughWater`, `SIGMA`, `HAZE`). Deep floor is also read at a blurrier mip, as a lens focused near the surface
  would see it.
- Focus: only what this lens at this aperture would blur. The meadow is a 41 mm at f/2.8 focused on the word, so
  only grass near the lens goes soft (`config.js`, `LENS`; `post.js`). Blurring the background "because it looks
  cinematic" on a wide shot is a tell.
- Scale: give the eye something whose size it knows (a flower, a lily pad, a spruce).

## Lens and film

The scaffold's `filmFrag` (from the pond's `postFrag`) does these in a camera's order. Retune the numbers for each
picture; keep the order.

1. **Bloom from real highlights only.** Bright-pass with a knee well above white (about 2.4 to 5 in scene units),
   blur at a quarter of the size, add back at a small weight. If the whole picture glows, the threshold is too low.
2. **Falloff toward the corners,** applied to scene light, gentle.
3. **Veiling glare** if the sun is in or near the frame: a warm lift on its side (`meadow/post.js`, `uGlare`).
4. **The tone curve: AgX** (three's `AgXToneMapping`), which rolls highlights off as film does and does not turn
   bright colours neon. Push colour *before* the curve, on scene light, where the curve can still fold it in.
5. **A restrained grade** on display light: a little contrast, cool shadows under warm lights. If you can see
   the grade, it is too much.
6. **sRGB encoding**, written out in the shader (the renderer's own output conversion is off).
7. **Grain**, fine, strongest in the mid-tones, and a final half-bit of dither. The grain is also what stops skies
   from banding. It moves with the frames; a still keeps frame 0 so the picture really stands still.

Sensors and optics have habits worth copying when they apply: a point of light is a small soft disc with a faint
halo, not a pixel (`stars/shaders.js`, the Moffat profile in `starVert`/`starFrag`); a sensor's green channel
clips first, so the brightest aurora pales toward white; a burnt-out glint has a ragged edge.

Do not add what this camera would not do: lens flares on an overcast day, chromatic aberration, heavy vignettes,
film scratches. Each is a signature of "made to look like a photo".

## Nothing repeats, nothing is straight

- **Tiling must never show.** The pond lays its scanned stones as overlapping patches on a triangle grid, each
  patch turned and offset, joined along the gaps between stones (`composite.js`, the floor block). The steel
  samples its rust at two unrelated scales (`letters.js`).
- **Warp every line nature drew.** "No front is a straight line", "no two fronts are as strong" (`meadow/glsl.js`,
  `weather`). Crests wander and fork. Beams run a little off the frame's axis.
- **Vary every instance** by a hash of its index: height, hue, phase, lean, dryness. Mix species.
- **No visible loop.** Sum motions whose periods have nothing to do with each other; the sound beds do the same
  ("a low chord that never quite repeats").
- **But the same on every load.** All of that variation comes from `rnd(i)`, so the scene is reproducible.

## Things touch

Objects that float are the surest sign of a render. Where two things meet, something happens: letters are sunk
into the ground (`SINK`) with grass standing against their feet; a lily pad throws a crisp shadow from the surface
and its meniscus focuses a bright rim round it (`composite.js`, `rim`); the same ripples that focus the caustics
bend the shadows (`wob`); a koi's back just breaks the surface and pushes a bow wave.

## Type in the picture

Three ways, best first:

1. **The headline is an object in the scene.** Meadow: outlines of Bodoni Moda extruded as steel plate
   (`letters.js`). The DOM `<h1>` is still there, laid exactly where the steel word stands (`index.js`, `place`),
   and fades to transparent, not hidden, once the scene is drawn, so assistive tech and the no-WebGL fallback
   have it.
2. **The headline is drawn into the scene from the DOM's own layout.** Koi: `textmask.js` reads each word's
   rectangle and paints the letters into a mask texture; the shader turns them into stone on the pond's bed, with
   a bevel, a shadow and the caustics running over them. It re-reads on resize and when fonts arrive.
3. **The scene keeps quiet under DOM type.** Stars, and the scaffold: `index.js` measures the lines of the
   headline, `render.js` builds a feathered mask from them, and the shader dims the scene there (most from the
   brightest light) so nothing competes.

A headline that belongs to the picture still has to be read at a glance, and that is where this goes wrong: letters
made of the scene's own stuff (mist, stone, shadow) drift toward the tone of what surrounds them. `check-hero.mjs`
measures it from the still, with the text and without: the pond's stone letters stand about 2 to 1 against the bed,
the steel word 2.9 to 1 against sky and grass, the chart's type 8 to 1. Under the pond's figure a headline is too
faint; give the letters an edge the eye can find (a rim of light, a shadow, a cleaner or darker ground behind them).

Whichever it is: small type (the cue, the plate line) never depends on what passes beneath it. It sits on its own
strip of dark tape or smoked glass, chosen to keep 4.5:1 over the brightest part of the picture. `text: false`
must remove the headline *from the picture too* (the steel word leaves the field, and its shadow with it).

## Motion

- **Rules, not timelines.** A wave equation on a small grid drives the pond's rings, refraction and caustics from
  one surface (`koi/glsl/water.js`). Grass leans by a function of position and time. Koi steer. State lives in
  plain objects that a Node script can step (`koi/pond.js` and `scripts/pond-check.mjs`).
- **Fixed-step simulations** take an accumulator so they run the same at 60 and 144 Hz
  (`koi/renderer.js`, `frame`).
- **Springs for anything pushed.** The pointer's field in the meadow is rows of springs; values are per 60 Hz
  frame and scaled by `f = dt * 60` (`config.js`, `SPRING`; `field.js`).
- **Mass and delay.** A gust reaches the far grass later. A pellet falls before it splashes. Koi notice, then turn.
- **It does things when left alone,** on no fixed schedule, and rests when there is truly nothing to draw (the
  meadow skips frames when calm and settled).
- **A response is proportional.** A slow pointer attracts koi, a fast one scatters them.

## Fast by construction

Target: 60 Hz on a laptop's integrated GPU (the scenes were developed on Intel Iris Xe) at roughly 1.3 to 2.2
megapixels. The software renderer in a sandbox cannot tell you whether you made it, so reason about cost:

- **Count full-resolution passes** and what each pixel does in them. One fixed camera lets almost everything
  else be smaller.
- **Soft things go in small targets.** Bloom at a quarter, the aurora at a half or quarter, the wave grid at 4 px
  cells, caustics capped at 1.3 megapixels, shadows at half. Read coarse mips where blur is wanted instead of
  blurring.
- **Slow things update less often** (the aurora every second or third frame).
- **Do the work once.** Bake what never changes (the word's silhouette, koi skins, what each blade's neighbours
  shade). Upload buffers only when they changed. Sort instances near to far once so the depth test rejects most.
- **Compile before the first frame** (`renderer.compileAsync`, `post.js` `compile`) and decode images off the
  main thread (`createImageBitmap`, `stars/render.js`), or the page freezes as it opens.
- **A low tier** (`?q=low`, and touch devices by default in the meadow): fewer instances, no bloom, smaller
  targets, coarser sums. Then the governor (`kit.js`) trades render resolution for frame time by itself.
- The first frames cannot be saved by a governor: open at a sensible pixel budget (`index.js`, `top`), and on a
  phone at about a megapixel (`opening()` in `kit.js`, the governor's `start`).
- **A grid laid over the frame takes the frame's shape.** A phone is tall: a sheet of cells laid out for a wide
  frame has cells three times taller than wide there (`koi/renderer.js`, `lay`, keeps the caustics' cells square).

## The tells

Ask these of every render, largest first. Each "no" is the next thing to fix.

1. Can I point to where the light comes from, and do all shadows agree with it?
2. Is the shade coloured by the sky, or is it grey or black?
3. Does anything repeat, tile, or line up too neatly?
4. Does every object touch what it stands on or floats in?
5. Is anything pure white, pure black, or more saturated than paint?
6. Do highlights roll off, or do they clip to a flat patch? Does only the truly bright glow?
7. Does distance (or depth of water, or thickness of air) change colour and contrast?
8. Is the sharpness what one lens would give, or is everything equally crisp?
9. Is there banding in any smooth gradient? Aliasing or shimmer on thin things as they move?
10. Does the headline look lit by this scene, or pasted over it? Can the small type always be read?
11. With the text hidden, is it still a good photograph?
12. Left alone for a minute, does a pattern in the motion show itself?
13. Does a click leave something physical behind, and does it feel like the thing it is?
14. On the phone sheet: is the composition still a picture, or a crop of the desktop one?
15. Beside the three stills in `public/assets/gallery/`: does it belong?
