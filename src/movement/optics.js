// The numbers the asset builder (tools/build-assets.mjs) and the shaders have to agree on. Nothing here draws.

// The studio the movement is photographed in, as the movement sees it: every direction within REACH of the lens's
// axis, flattened the way a mirror ball flattens a room (stereographic about the axis: x and y are the direction's
// own x and y over 1 + z). The file holds LEVELS copies side by side, each half the size of the last and blurred
// wider (BLUR, the half-width of the blur in degrees): a polished bevel reads the first, a grained plate the later
// ones. A studio's lamps are hundreds of times brighter than its walls, so each texel is two bytes deep in effect:
// a colour (square root of colour over M) in the top half of the file, and M (fourth root of M over MAX) below it.
export const ENV = {
  size: 512,                             // texels across the sharpest level
  reach: 118,                            // degrees off the axis the map holds: a bevel at 45° on a tilted plate looks past 90
  levels: 7,
  blur: [0, 1.2, 2.5, 5, 10, 19, 34],    // degrees
  max: 96,                               // the brightest light the file holds, in scene units (the studio's wall is about 1)
  // Where the studio stands round the bench: the point of the panorama the lens's axis leaves the movement toward
  // (fractions across and down the picture), and the turn about that axis, degrees.
  zenith: [0.14, 0.283], roll: 180,
  exposure: 1,
};
// Which way the studio's light leans, as a plate facing the lens gets it: toward the top of the picture, a little
// left (unit x, y), measured from the panorama by build-assets.mjs, which prints it (21° off the lens's axis). fall
// is how far a shadow lies from the edge that throws it, per mm of height: the bright wall is broad, so an edge's
// shadow is laid by its far half, further off the axis than its middle.
export const KEY = { x: -0.11, y: 0.99, fall: 0.6 };
export const ENV_K = Math.tan((ENV.reach / 2) * Math.PI / 180);   // the stereographic radius of the map's edge
