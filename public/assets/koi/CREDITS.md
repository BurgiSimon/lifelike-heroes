# Koi pond hero: external assets

Everything else in the scene is the hero's own code: the water, its caustics and reflections, the lily pads, blooms, fallen leaves, petals and pollen are drawn by its shaders, the koi's skins are painted into a canvas at load (`src/koi/skins.js`), and the shadow of the pavilion's roof beams is a few lines of maths.

| File | Made from | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `pebbles_diff.webp` | Ganges River Pebbles, diffuse map (2K JPG), recompressed | https://polyhaven.com/a/ganges_river_pebbles | Poly Haven | CC0 1.0 |
| `pebbles_nor.webp` | Ganges River Pebbles, OpenGL normal map (2K JPG), recompressed | https://polyhaven.com/a/ganges_river_pebbles | Poly Haven | CC0 1.0 |
| `pebbles_aux.webp` | Ganges River Pebbles, ambient occlusion (from the ARM map) in red and displacement in green, 1K | https://polyhaven.com/a/ganges_river_pebbles | Poly Haven | CC0 1.0 |
| `canopy.webp` | Epping Forest 01 HDRI (tonemapped JPG), reprojected to a 1024 px zenith-up view of the canopy; mirrored by the water and by the wet lily pads | https://polyhaven.com/a/epping_forest_01 | Poly Haven | CC0 1.0 |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
