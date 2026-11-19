// The numbers the sky's build script (tools/build-assets.mjs) and the shaders have to agree on. The sky is kept as
// a flat picture in the lens's own projection: x is the tangent of the angle to the right of the lens's axis, y the
// tangent of the angle above the horizon.
export const SKY = {
  yaw: 0.56,         // where in the panorama the lens points, as a share of its width: the afterglow, with the sun's own spot left out of frame to the right
  half: 0.44,        // the picture reaches this far to each side (tangent: 23.7°)
  bottom: -0.06,     // from a little below the horizon
  top: 0.66,         // to 33° above it: a phone held upright sees that much sky
  width: 2048, height: 1676,   // px: about one texel to a screen pixel on a 1440 px wide window
  exposure: 0.16,    // the photographer's exposure of the panorama's light, for the cloud
  knee: 0.6,         // display light above this is rolled off
};
