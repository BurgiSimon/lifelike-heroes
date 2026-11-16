// The ground: a hummock under the lens, a shallow dip, then a long rise to a crest just behind the word, so the
// near field is seen from above and the far field at a grazing angle with only sky beyond it.
import { D } from './config.js';

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function ground(x, z) {
  const d = -z;
  let y = 0.55 * Math.exp(-((d / 3.2) ** 2)) + 1.25 * smooth(7, 31, d) - 0.25;
  if (d > 31) y -= 0.03 * (d - 31) ** 2;
  // low swells, so no line in the field is ruler straight
  return y + 0.06 * Math.sin(x * 0.35 + d * 0.21) + 0.05 * Math.sin(x * 0.13 - d * 0.4 + 1.7);
}

export const EYE_Y = (eye) => ground(0, 0) + eye;
export const WORD_Y = ground(0, -D);
