# Night rain hero: external assets

Every file in this folder that the hero did not make itself is listed here, with where it came from and its licence.
Everything else in the scene is the hero's own code.

| File | Made from | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `city_base.webp` | Shanghai Bund, 4k HDR. The view across the river (47° east of the panorama's centre, 2.5° above its horizon) as a 50 mm lens focused half a metre away draws it: reprojected to the lens's own flat projection (±0.60 by ±0.36 in tangent), every point spread into the aperture's disc in linear light, then the part up to paper white, sRGB, 2048 × 1229, WebP quality 86. | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |
| `city_glow.webp` | The same defocused view, the part brighter than paper white (the discs of the lamps): (c − 1) / 12, square-root encoded, 2048 × 1229, WebP quality 84. | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |
| `city_wide.webp` | The same panorama in focus, 160° × 110° about the same direction (longitude by latitude), for what the drops see far off the lens's axis: (c / 8) ^ (1 / 2.2), 1024 × 704, WebP quality 88. | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |

All three files are produced by `src/rain/tools/build-assets.mjs` from the 4k HDR (`find-asset.mjs get shanghai_bund hdr --res 4k`);
the numbers they are baked with are in `src/rain/optics.js`.

The rain, the mist, the writing on the glass and the lamp's glint on each drop are procedural (written for this hero); no other
external assets are used.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
