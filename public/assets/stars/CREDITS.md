# Star chart hero — external assets

| File | What it is | Source | Licence |
| --- | --- | --- | --- |
| `sky.webp` | The deep star field and Milky Way behind the catalogue stars. Reprojected from the 8k plate carrée map (`starmap_2020_8k.exr`, celestial coordinates) to an azimuthal equidistant map about the north celestial pole, gamma 2.2, 4096², WebP quality 90. | NASA/Goddard Space Flight Center Scientific Visualization Studio, *Deep Star Maps 2020* — https://svs.gsfc.nasa.gov/4851 (built from Gaia DR2, Hipparcos-2 and Tycho-2) | Public domain (NASA media usage guidelines); credit: NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC. |
| `stars.bin` | 41 411 stars to magnitude 8: right ascension, declination, V magnitude and B–V colour index, sorted brightest first, 4 × Uint16 per star. Converted from `data/stars.8.json`. | d3-celestial by Olaf Frohn — https://github.com/ofrohn/d3-celestial (star data from the XHIP extended Hipparcos compilation) | BSD 3-Clause, © 2015 Olaf Frohn |
| `land.webp` | The horizon under the sky: a snow field, a spruce forest and a bare rise with lone spruces. A 168° × 14° band at the horizon of the 8k HDRI (`stierberg_sunrise_8k.hdr`), mirrored, reduced to luminance (gamma 2.2), its clear sky keyed out into the alpha channel, 2560 × 214. The hero relights it for the night; the observatory on it (a dome and a hut with a lit window) is drawn by the shader. | Poly Haven, *Stierberg Sunrise* by Grzegorz Wronkowski — https://polyhaven.com/a/stierberg_sunrise | CC0 1.0 (public domain) |

All three files are produced by `src/stars/tools/build-assets.mjs` from the sources above.

The aurora, the airglow, the observatory (dome, hut and its window light), the meteor and the chart are procedural (written for this hero); no other external assets are used.

## BSD 3-Clause notice for d3-celestial data

Copyright (c) 2015, Olaf Frohn. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
