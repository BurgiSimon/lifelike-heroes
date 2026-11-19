---
name: lifelike-hero
description: Build a new "lifelike hero" for the lifelike-heroes project - a full-screen WebGL scene for the top of a website that passes for a photograph and reacts when touched, in the manner of the meadow, the koi pond and the star chart. Use this whenever the user asks for a new hero, a new scene or another gallery card in this repo ("make another hero", "add a scene of ...", "a fourth one - rain on a window"), wants a photoreal or lifelike interactive header, background or WebGL scene "like the others", or wants an existing scene to look more real or behave better, even if they never say the word "hero". It brings a scaffold (a running scene that already keeps the project's contract), a contract check that photographs the scene in every state, the gallery wiring, a finder for real CC0 textures and skies, and the craft notes on why these scenes read as photographs.
---

# Lifelike hero

A hero in this project is the picture at the top of a web page, drawn live: it should pass for a photograph, and it
should answer when it is touched. Three exist (`src/meadow`, `src/koi`, `src/stars`). This skill is for making the
next one as good as those.

The work has two halves, and they fail in different ways.

- **The picture.** Whether it reads as a photograph is decided by light, material and lens, and by looking at it
  again and again. Nothing can check this but an eye. This is where the time should go.
- **The contract.** Every scene is a well-behaved module: the same small API, real text, a keyboard path, a still
  for reduced motion, a fallback without WebGL, a clean `destroy()`. This is checkable, so a scaffold gives it to
  you on day one and a script holds you to it. Do not spend the picture's time rebuilding it by hand.

## The shape of the work

1. Decide the photograph, in words, before any code.
2. Start from the scaffold: a running page that already keeps the contract.
3. Gather real ingredients.
4. Build the picture by looking: render, compare with a photograph, fix the largest thing that gives it away. Repeat.
5. Give it its life: what moves by itself, what a pointer does, the one verb, the sound.
6. Hold it to the contract.
7. Finish: stills, the gallery card, credits, README, checks.

Steps 4 and 5 are most of the work and they interleave. Do not polish a material before the light is right, and do
not wire the gallery before the picture is worth a card.

## 1. Decide the photograph

A hero is not "a scene with koi in it". It is one photograph: somebody stood in one place with one lens at one
moment of the day, for a client who had a reason to want that picture. Deciding this first is what keeps the
scene from turning into a tech demo, because every later question (what is in focus, where shadows fall, what the
headline is made of) then has an answer.

Write the brief as the opening comment of `src/<id>/index.js`, as the three scenes do, and say it to the user in a
few lines before building. It names:

| | Meadow | Koi pond | Star chart |
| --- | --- | --- | --- |
| Client and page | Fieldnote, cover of the Weather issue | Halden, Stillwater Pavilion project page | Meridian Observatory, home |
| Camera | level, 1 m up, a 41 mm at f/2.8 focused on the word | straight down on shallow water | a long exposure about the celestial pole |
| Light | a low sun through storm cloud, 20° left | mid-morning sun through slatted roof beams | starlight, an aurora, a lit window |
| What moves by itself | wind: a ripple, slanted gust fronts, seeds, cloud shadows | koi wander, pads drift, caustics | the sky turns, stars twinkle, curtains shift |
| The headline | steel letters standing in the field | stone letters on the pond's bed | type over a sky kept quiet beneath it |
| Hover | grass parts round the pointer | slow: koi come over. Fast: they bolt | a pencilled line joins the nearest stars |
| The one verb | sow a flower (drag: a row) | feed: a pellet falls, rings spread | pin a constellation; it gets a name |
| What is real | HDRI sky, scanned rust and thatch, a typeface's outlines | scanned pebbles, a canopy photograph | 41,411 catalogued stars, NASA's Milky Way, a real horizon |

Things that make a brief good:

- **One verb, with a consequence that stays.** A click does one physical thing that lasts and has rules (a flower
  grows and later wilts when there are too many; a pellet falls, may roll off a lily pad, and is eaten). Hover is
  the gentle, continuous version. The verb also has a real button, which is the keyboard's way in.
- **The headline belongs to the picture, and can still be read.** Best is an object in the scene, lit by the
  scene's light. Otherwise the scene must make room for it. Type merely laid over a busy picture is the commonest
  way these fall short; a headline so much part of the picture that it sinks into it is the other
  (`check-hero.mjs` measures how well it stands out).
- **Something is real.** Decide which ingredients are photographed, scanned or measured (step 3).
- **It can be drawn at 60 Hz on a laptop's integrated graphics.** One fixed camera makes this possible: everything
  can be composed for that one view.

If the user gave only a subject ("a rainy window"), make the rest up with conviction, including the invented
client and the copy, and carry on. If the hero rebuilds an existing 2D one (the three came from the
AwardComponents repo), keep the original's copy, options and behaviour and say so in the brief.

## 2. Start from the scaffold

From the project root:

```bash
node .claude/skills/lifelike-hero/scripts/new-hero.mjs tidepool --name "Tide pool" --title "Low Water" \
  --client "Saltmarsh" --line "home hero" --place "Tórshavn · 2026" --cue "Drop a pebble" --action drop
```

This writes `src/tidepool/` (`index.js`, `render.js`, `shaders.js`, `sound.js`, `style.css`), `tidepool.html` and
`public/assets/tidepool/CREDITS.md`, and adds the page to `vite.config.js`. `npm run dev` (after `npm install`, if
`node_modules` is missing) then serves it at `http://localhost:5173/tidepool.html`. Leave the dev server running in
the background: every tool below talks to it. If port 5173 is taken, run `npx vite --port 5180` and give the tools
`BASE=http://localhost:5180`.

What you get is a stand-in scene (damp sand under a low sun) with every wire live: options with ranges, the
loop and the frame-rate governor, hover and click, the button, the status line, the still for reduced motion, the
fallback, a lost context and its return, sound, and the film pass (bloom, falloff, AgX, grade, grain). It passes
the contract check as it stands. Lines marked `STARTER` belong to the stand-in and are yours to replace; the
check counts the ones left.

Then read the existing scene nearest to yours before writing much, because most problems you will meet are
solved there:

- a surface seen from above, layers composited in 2D, a simulation in a texture: `src/koi`
- a view with depth, a real camera, thousands of instanced things, depth of field: `src/meadow`
- real data drawn as points and lines, DOM labels, a drag with inertia: `src/stars`

`references/scenes.md` maps each technique to its file. When a scene outgrows the five files, split it as those
do: rules that draw nothing in one module (so they can be run in Node, as `scripts/pond-check.mjs` does), the
renderer in another, GLSL beside it.

## 3. Gather real ingredients

The eye is an expert on skies, ground, bark, stone and rust, and it is not fooled by noise functions standing in
for them. Use a photograph or a scan wherever the thing holds still, and keep procedural work for what has to move
(water, wind, growth, light). Poly Haven is CC0 throughout:

```bash
node .claude/skills/lifelike-hero/scripts/find-asset.mjs search wet sand
node .claude/skills/lifelike-hero/scripts/find-asset.mjs files damp_sand
node .claude/skills/lifelike-hero/scripts/find-asset.mjs get damp_sand Diffuse --res 2k --width 2048 --out public/assets/tidepool/sand_diff.webp
```

`get` prints the row for `public/assets/<id>/CREDITS.md`; paste it in. Every file in that folder must be credited
there (the check enforces it), and only public-domain or openly licensed material goes in. Keep a scene's assets
around 1 to 3 MB. Load them in `render.js` (the `load` helper is there), always through the literal path
`'/assets/<id>/...'`, which the build rewrites for GitHub Pages.

If the network is closed or nothing fits, say so and build the ingredient procedurally to the same standard;
do not quietly settle for a gradient.

## 4. Build the picture by looking

This is the loop that made the three scenes, and there is no substitute for it:

```bash
node scripts/shot.mjs tidepool --soft --out /tmp/tidepool.png --wait 6000
```

(If that stops with "Executable doesn't exist", you are in a sandbox: see "In a sandbox without a GPU" below.)

Then open the PNG and look at it as a picture editor would: *if this arrived as a photograph, what would make me
say it is not one?* Name the largest such thing, fix that one, render again. `references/craft.md` lists the usual
tells and how the three scenes got past each; read it before this step, and again when a picture is stuck.

Work in this order, because each layer hides the faults of the ones after it:

1. **Light.** One key light and one sky, in linear, unclamped values, with shadows that all agree.
2. **Material.** Real albedo, variation at two scales, nothing that repeats.
3. **Depth and air.** What distance, water or night air does to the light on its way to the lens.
4. **Lens and film.** The scaffold's film pass, retuned to this picture, and only what this lens would do.
5. **Life.** Motion and touch (step 5).

Useful ways to look:

- Put it beside `public/assets/gallery/*.jpg`. Would it hang on the same wall?
- `--steps` drives it: `--steps "move:0.5,0.6;wait:400;click:0.3,0.7;wait:1200;shot:after.png"`. `--mobile`,
  `--reduced` and `--q low` show the other states; `check-hero.mjs` renders all of them onto one sheet.
  For a picture without the page's tabs, begin the steps with `eval:document.querySelector('.chrome').remove()`.
- Crop in. Zoomed out, most things look fine; faults live at 100 %.
- Ask the user for a real photograph of the subject if they have one in mind.

Say plainly what still gives the picture away when you report; the user will see it anyway.

## 5. Give it its life

- **Simulate, do not animate.** The scenes feel alive because things follow rules (a wave equation, springs,
  steering), not timelines. A response has mass and delay; nothing snaps and nothing loops visibly.
- **The same scene on every load.** Use `rnd(i)` from the kit for anything placed or chosen, so the stills, the
  gallery card and the live page agree. `Math.random()` is for sound and for timing that nobody could compare.
- **Time comes from `dt`, clamped.** The loop hands you seconds; a stalled tab must not fling the scene.
- **Hover is for a mouse or pen.** Gate it on `finePointer()` and ignore `pointerType === 'touch'`. Act on
  `click`, not `pointerdown`, so a scroll that starts on the scene stays a scroll.
- **A finger gets a stroke.** The scaffold wires the kit's `stroke()`: a finger drawn sideways across the scene
  (an upright one stays the page's scroll). Give it what a hand on this subject would really do: part the grass,
  trail in the water, wipe the glass. Look at the scene on a phone held both ways; `check-hero.mjs` does too.
- **Without motion, show the result.** Under reduced motion there is no loop: an action draws one settled frame
  of its outcome (the flower fully grown, the rings a second old).
- **Sound** is a function `voices(kit)` in `sound.js`: a quiet bed that never quite repeats, and one small voice
  per thing that happens, panned to where it happened. It is synthesised, there are no audio files, and it stays
  silent until asked. Keep the levels where `src/shared/sound.js` says.

## 6. Hold it to the contract

```bash
node .claude/skills/lifelike-hero/scripts/check-hero.mjs tidepool --out /tmp/check-tidepool
```

It needs the dev server. It drives the page live, under reduced motion, on a phone (upright and on its side) and
with WebGL taken away, and prints one line per check: `MUST` is the contract, `SHOULD` is the manner of the three
scenes (fix it or know why not). It also writes `sheet.jpg`, every state on one page. Open it: a scene that is right live is often
wrong on the phone or in its still.

`references/contract.md` has every rule with its reason, for when a check fails or a scene needs something the
scaffold does not do. What no script can tell you: whether the type keeps its contrast over the brightest thing
that can pass beneath it, and how fast it runs on a real GPU.

## 7. Finish

```bash
node scripts/stills.mjs tidepool                 # public/assets/gallery/tidepool-wide.jpg and -tall.jpg
node .claude/skills/lifelike-hero/scripts/add-to-gallery.mjs tidepool --label "Tide pool" --sub "Saltmarsh · Low Water"
```

`add-to-gallery.mjs` adds the card, its stills, the page's opening picture and the stills default, then prints
what is left for a hand: the card's trace on the gallery, the two checks that count scenes, the README. Do those,
then run `node scripts/gallery-check.mjs`, `node scripts/sound-check.mjs`, `check-hero.mjs` once more and
`npm run build`.

The README is written for visitors first, in plain words ("Click the water to drop some food"); the developer
part comes after the rule. A new scene gets a section in each, in that voice.

Commit messages in this repo are one imperative sentence about what a visitor would notice ("Let koi pellets fall
in, and roll off a lily pad").

## In a sandbox without a GPU

Cloud sessions have no GPU and no browser of Playwright's own, so the project's scripts stop with "Executable
doesn't exist". Load the skill's browser helper first, and render in software:

```bash
node --import ./.claude/skills/lifelike-hero/scripts/browser.mjs scripts/shot.mjs tidepool --soft --out /tmp/tidepool.png
node --import ./.claude/skills/lifelike-hero/scripts/browser.mjs scripts/stills.mjs tidepool
```

(The skill's own scripts do this already.) The software renderer draws the same picture, about a frame a second
on a heavy scene, and that changes how to work:

- **The scene's clock runs slow.** The loop clamps each frame to 0.1 s, so at one frame a second ten seconds of
  waiting show one second of the scene. Anything timed (a mist creeping back, a drop running, a gust crossing)
  looks about ten times slower than it is. Do not tune timing from what a screenshot shows after a wait. Keep the
  rules in a module that draws nothing and step them in Node (`scripts/pond-check.mjs` does this for the pond), or
  work the time out from the frame count.
- **Look at a smaller frame while iterating.** `--size 720x450` draws about four times faster than the default
  1440x900; go back to full size to judge detail. `check-hero.mjs` takes several minutes, so run it at
  milestones, not after every change.
- **Frame rates mean nothing here.** Design for speed by construction (`references/craft.md`, "Fast by
  construction"), and ask the user to run `node scripts/shot.mjs <id> --steps "fps:3000"` on their own machine
  before calling a scene finished.
- **Say what you could not see.** Nobody has watched the scene move at full speed; put that in the report.

## The manner of the code

New code should read as if the same hand wrote it:

- Plain JavaScript modules and hand-written GLSL on three.js. No framework, no new dependency without a reason.
- Comments say *why*, in plain sentences, as a person would explain the scene: `// click, not pointerdown: a touch
  scroll that starts on the water must not feed.` Never restate what the line does.
- Every number has a name, a unit and a reason: `const FALL = 0.32;   // s a pellet is in the air before it comes down`.
- A deliberate shortcut is marked `ponytail:` with what the proper version would be, so it can be found later.
- Scene state lives in world or CSS-pixel units that `index.js` and the shaders agree on, and the file says which.

## Reference files

- `references/craft.md` - why the three scenes read as photographs, the tells that give a render away, and how to
  keep it fast. Read before step 4.
- `references/scenes.md` - a map from technique to file across the three scenes. Read when you need to know how
  something was done.
- `references/contract.md` - the scene contract rule by rule with reasons, the files a new scene touches, and how
  to use a scene outside this repo. Read when a check fails or the scaffold does not fit.
