// The numbers the camera, the baked city and the shaders agree on. Angles are given as tangents off the lens's
// axis, which is what a flat sensor measures. tools/build-assets.mjs bakes the city with these; change one and bake again.
export const TX = 0.60;     // the baked view reaches this far to either side (tan): room for a 21:9 frame
export const TY = 0.36;     // and this far up and down: room for a phone held upright
export const VFOV = 0.24;   // tan of half the frame's height on a landscape screen: a 50 mm lens on 35 mm film
export const VTALL = 0.30;  // and upright, where the long side of the film is the height (with room left to aim it)
export const DISC = 0.05;   // a far lamp's disc across, tan: a 50 mm at f/2 (25 mm of glass) focused on a pane 0.5 m away
export const GLOW = 12;     // city_glow.webp holds light from 1 to 1 + GLOW times paper white
export const WIDE = 8;      // city_wide.webp holds light up to WIDE
export const LON = 80;      // city_wide.webp reaches this many degrees to either side of the axis
export const LAT = 55;      // and this many above and below
export const YAW = 47;       // where the camera points in the panorama, degrees east of its centre
export const PITCH = 2.5;    // and above its horizon
export const GAIN = 1;      // exposure given to the panorama before anything else
