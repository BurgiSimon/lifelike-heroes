// The numbers the whole meadow agrees on: where things stand, the light, the lens, the weather.
// World: metres, y up, the camera at x = z = 0 looking down −z, the word standing at z = −D.

export const D = 26;                 // lens to the word
export const CAP = 3.4;              // cap height of the letters
export const EYE = 1.0;              // lens above the ground it stands on
export const SHARE = 0.84;           // the word's share of the frame width
export const FAR_EDGE = 30.5;        // the field's far edge (the crest), where a click in the sky lands
export const NEAR_PLANT = 2.6;       // nothing is planted nearer the lens than this

// Light, baked from the HDRI by the sky tool (kloppenheim_06_puresky, sun 20° left of the view axis). The key is
// lifted to 12° (the sky has it at 8°) so the word's shadow ends mid-field and the near grass stands in the sun.
export const SUN = [-0.3346, 0.2079, -0.9191];
export const SUN_COL = [4.6, 3.0, 1.45];               // radiance of a white card facing the sun through the cloud gap
export const SKY = { knee: 3, top: 6, envMax: 24, az: 38, el0: -3, el1: 58 };
// Sky irradiance / π as nine SH terms (basis: 1, y, z, x, xy, yz, 3z²−1, xz, x²−y²).
export const SH = [[1.4423, 1.6872, 2.0884], [0.6731, 0.8462, 1.131], [-0.4329, -0.3578, -0.2507], [-0.2594, -0.207, -0.1258], [-0.0797, -0.0698, -0.0491], [-0.1427, -0.1348, -0.1104], [0.132, 0.1276, 0.1159], [0.1263, 0.1122, 0.0895], [0.0711, 0.059, 0.0338]];

// Lens: a 41 mm at about f/1.6 on full frame, focused on the word. CoC radius as a share of the frame width is
// LENS.a × |D / depth − 1|; the post blur covers radii up to LENS.max, nearer blades are widened in geometry instead.
export const LENS = { a: 0.0006, max: 0.004 };
export const FORE = 4.4;             // nearer than this a blade's blur outgrows the post pass: it joins the foreground layer

// Wind. The original's pixels become metres at mid-field: a 3.2 m ripple every 4.8 s, a gust front every 15 m and
// 9 s at a breeze, travelling right and away from the lens so a front reaches the far grass later.
const TH = 0.44;
export const WIND = {
  dir: [Math.cos(TH), -Math.sin(TH)],            // in (x, z)
  ripple: { k: 6.2832 / 3.2, w: 1.3, amp: 0.06 },
  gust: { k: 6.2832 / 15, w: 0.7, amp: 0.2 },
  lean: 0.07,                                    // steady lean per unit of wind above a breeze
  burst: { speed: 10, width: 4.2, lean: 0.55 },  // the one-off gust: m/s, half-width in m, rad at its crest
};

export const SPRING = { k: 0.012, damping: 0.1 };    // per 60 Hz frame, as the original
export const GROW = 1.1; export const FADE = 0.6;    // s a flower takes to grow, and to leave
export const SOW = 44;                               // px of drag between two sown flowers
export const SEEDS = { rate: 0.5, cap: 60, perGust: 0.8 };  // per second at a breeze, most in the air, m of gust travel per seed
// Flowers there on load, as [share of the width, depth 0..1 down the field], straight from the original.
export const START = [[0.07, 0.8], [0.2, 0.44], [0.34, 0.92], [0.5, 0.62], [0.63, 0.34], [0.79, 0.86], [0.92, 0.52]];
export const CURVE = 1.5;                            // screen y = horizon + (foot − horizon) × depth^CURVE
// Petal palette of the original, as species: clay → coral avens, plum → scabious, sky → cornflower, accent → poppy.
export const PETALS = { mixed: [3, 2, 1, 3, 0, 2, 1], accent: [0] };
