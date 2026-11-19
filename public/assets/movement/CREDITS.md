# Movement hero: external assets

Every file in this folder that the hero did not make itself is listed here, with where it came from and its licence.
Everything else in the scene is the hero's own code.

| File | Made from | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `studio.webp` | Studio Small 09, 2k HDR. The half of the studio that the movement's plates can mirror (118° either side of the lens's axis, which leaves the movement toward the top edge of the white backdrop, so a plate tipped one way shows the wall and tipped the other shows the dark ceiling), flattened about that axis as a mirror ball flattens a room, at seven widths of blur (512 px down to 8 px, side by side). Each texel is a colour and a brightness (two halves of the file), so the lamps keep their real strength; lossless WebP, 1016 × 1024. | https://polyhaven.com/a/studio_small_09 | Sergej Majboroda (Poly Haven) | CC0 1.0 |

`studio.webp` is produced by `src/movement/tools/build-assets.mjs` from the 2k HDR (6 MB, not kept in the repo:
`find-asset.mjs get studio_small_09 hdr --res 2k`); how it is laid out and coded, and where the lens's axis points in
the panorama, are in `src/movement/optics.js`.

The movement itself is procedural (written for this hero): the plates and their Geneva stripes, the pearled mainplate,
the wheels, the escapement, the balance and its hairspring, the screws and the jewels. Its numbers are a real
movement's: a train of 80/10 and 75/10 to an 84-tooth fourth wheel, a 7-leaf escape pinion and a 15-tooth escape
wheel, which is 21,600 beats an hour. The engraved words are the page's own headline, set in Bodoni Moda (see the
project README).

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
