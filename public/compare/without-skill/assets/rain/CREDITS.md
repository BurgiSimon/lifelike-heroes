# Night rain hero: external assets

Everything else in the scene is the hero's own code: the drops and their rules, the mist between them, the condensation and the hand that wipes it, the lamps of the boats on the river and the camera's grain are drawn by its shaders.

| File | Made from | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `bokeh.webp` | Shanghai Bund HDRI (8K HDR): a 52° view across the river, graded for a night exposure and thrown out of focus in linear light, so each lamp becomes a disc as it does in a lens; 2048 × 1400 | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |
| `haze.webp` | The same view under a wide Gaussian, 256 × 175: what the misted glass shows | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |
| `lens.webp` | The same panorama as a fisheye about the same axis (what a drop on the glass shows, upside down), 512 × 512, with every smaller level of it beside it in the same file | https://polyhaven.com/a/shanghai_bund | Greg Zaal (Poly Haven) | CC0 1.0 |
| `still.jpg` | A frame of the hero itself: what the page shows without WebGL 2 | — | — | — |

All three pictures are produced by `src/rain/tools/build-assets.mjs` from the panorama, and stored as the cube root of the light (a sixth, a quarter and a thirty-second of it), which the shaders undo.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
