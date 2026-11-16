// The real sky: 41 411 stars to magnitude 8 (stars.bin, brightest first) laid out on the chart's own plane.
// Chart plane = azimuthal equidistant about the north celestial pole: a star sits (90° − Dec) degrees from the pole
// at the angle of its right ascension, so turning the sky is one 2D rotation and RA runs clockwise, as it does
// for someone looking up at the pole.
const RAD = Math.PI / 180;

// B–V colour index → linear sRGB at unit luminance. Temperature by Ballesteros' formula, chromaticity by the Kim
// et al. fit of the Planckian locus; then pulled 45 % toward white, which is how a sensor (and an eye) sees stars.
function starColour(bv, out, o) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = Math.min(25000, Math.max(1667, T)); const u = 1000 / t;
  const x = t < 4000 ? -0.2661239 * u ** 3 - 0.2343589 * u * u + 0.8776956 * u + 0.17991 : -3.0258469 * u ** 3 + 2.1070379 * u * u + 0.2226347 * u + 0.24039;
  const y = t < 2222 ? -1.1063814 * x ** 3 - 1.3481102 * x * x + 2.18555832 * x - 0.20219683
    : t < 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  const X = x / y; const Z = (1 - x - y) / y; // Y = 1
  const r = 3.2406 * X - 1.5372 - 0.4986 * Z; const g = -0.9689 * X + 1.8758 + 0.0415 * Z; const b = 0.0557 * X - 0.204 + 1.057 * Z;
  const k = 0.55;
  out[o] = Math.max(0, 1 + (r - 1) * k); out[o + 1] = Math.max(0, 1 + (g - 1) * k); out[o + 2] = Math.max(0, 1 + (b - 1) * k);
}

export async function loadCatalog(url, signal) {
  const raw = new Uint16Array(await (await fetch(url, { signal })).arrayBuffer());
  const n = raw.length / 4;
  const sky = new Float32Array(n * 2);   // chart-plane position, degrees from the pole
  const mag = new Float32Array(n);
  const pos = new Float32Array(n * 3);   // the same two and the magnitude, as the GPU takes them
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ra = (raw[i * 4] / 65535) * 360 * RAD; const pd = 90 - ((raw[i * 4 + 1] / 65535) * 180 - 90);
    sky[i * 2] = pd * Math.cos(ra); sky[i * 2 + 1] = pd * Math.sin(ra);
    mag[i] = raw[i * 4 + 2] / 1000 - 2;
    pos[i * 3] = sky[i * 2]; pos[i * 3 + 1] = sky[i * 2 + 1]; pos[i * 3 + 2] = mag[i];
    starColour(raw[i * 4 + 3] / 1000 - 1, col, i * 3);
    seed[i] = ((Math.imul(i + 1, 0x9e3779b9) >>> 0) / 4294967296);
  }
  return { n, sky, mag, pos, col, seed };
}
