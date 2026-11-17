// The land under the sky: a real horizon (land.webp — a snow field, spruce, a bare rise; see CREDITS.md) that the
// shader relights for the night. Here: where it sits on the hero, where the sky ends above it (the chart needs to
// know), and where the observatory (drawn by the shader: a dome and a hut) stands on it.
import { clamp } from '../shared/kit.js';

const LAND = { span: 168, rise: 14, under: 3 }; // land.webp: degrees of azimuth, of altitude, and of those under the horizon
const DOME = { az: 20, r: 2.6 };              // the dome on the bare rise: degrees in from the right edge, radius in degrees

// The top of the land in every column of land.webp, as a share of its height: read once from its alpha.
export function profile(bitmap) {
  const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bitmap, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data; const tops = new Float32Array(c.width);
  for (let x = 0; x < c.width; x++) { let y = 0; while (y < c.height && px[(y * c.width + x) * 4 + 3] < 128) y++; tops[x] = 1 - y / c.height; }
  return tops;
}

export function buildGround(W, H, tops) {
  const U = clamp(H * 0.105, 54, 112);              // the land keeps its scale; a phone sees less of it
  const k = Math.max(U / 10, W / LAND.span);         // px per degree: a spruce stands about U tall; a very wide hero widens the band rather than run out of it
  const w = LAND.span * k; const h = LAND.rise * k; const left = W - w; // its right edge is the hero's: the open rise is always in view
  const height = (x) => { const f = clamp(((x - left) / w) * tops.length - 0.5, 0, tops.length - 1.001); const i = Math.floor(f); return (tops[i] + (tops[i + 1] - tops[i]) * (f - i)) * h; };
  const domeX = W - DOME.az * k; const r = DOME.r * k;
  let low = 1e9; for (let x = -3; x <= 1; x += 0.5) low = Math.min(low, height(domeX + x * r)); // the hut reaches 3 r to the left
  const foot = H - low + 3;                          // behind the crest: the snow's own edge covers the foot
  let top = 0; for (let x = 0; x <= W; x += 2) top = Math.max(top, height(x));
  return {
    U, left, w, h,
    top: Math.max(top, H - foot + r * 2.2),
    horizon: H - LAND.under * k,                     // the true horizon, out of sight behind the trees
    dome: { x: domeX, y: foot, r },
    // y (CSS px, down) where the sky ends at x.
    skyline(x) { return H - height(x); },
  };
}
