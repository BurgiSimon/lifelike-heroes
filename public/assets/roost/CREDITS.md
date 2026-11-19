# Roost hero: external assets

Every file in this folder that the hero did not make itself is listed here, with where it came from and its licence.
Everything else in the scene is the hero's own code.

| File | Made from | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `sky.webp` | Belfast Sunset (Pure Sky), 16k HDR. The part of the sky this hero's lens sees (toward the afterglow, 36° to the left of the sun, from just under the horizon to 33° above it), reprojected from the panorama to the lens's own flat projection, exposed for the cloud (× 0.16), its highlights rolled off, sRGB, 2048 × 1676, WebP quality 90. | https://polyhaven.com/a/belfast_sunset_puresky | Greg Zaal, Dimitrios Savva, Jarod Guest (Poly Haven) | CC0 1.0 |

`sky.webp` is produced by `src/roost/tools/build-assets.mjs` from the 16k HDR (200 MB, not kept in the repo:
`find-asset.mjs get belfast_sunset_puresky hdr --res 16k`); the numbers it is baked with are in `src/roost/optics.js`.

The starlings, the falcon, the sign, the roofline and the dome are procedural (written for this hero). The flock's rule is a
measured one: each bird minds its seven nearest neighbours, as M. Ballerini et al. found of the starlings over Rome
("Interaction ruling animal collective behavior depends on topological rather than metric distance", PNAS 105, 2008).
The sign's letters are the page's own headline, set in Mona Sans (see the project README).

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
