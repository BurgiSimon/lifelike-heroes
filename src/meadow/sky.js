// The sky: a window cut from a real HDRI (Poly Haven, kloppenheim_06_puresky), drawn on a dome behind everything.
// Its clouds drift with the wind; the sun and the land under it are added here.
import * as THREE from 'three';
import { SKY, SUN_SEEN } from './config.js';
import { LIGHT } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;                      // on the far plane: only where nothing else was drawn
}`;

const rad = (deg) => (deg * Math.PI / 180).toFixed(6);
const FRAG = /* glsl */`
${LIGHT}
uniform sampler2D uSky; uniform float uTime; uniform float uSunny;
varying vec3 vDir;
const vec3 SUN_SEEN = vec3(${SUN_SEEN.join(', ')});
// Undo the baker's curve: sqrt to 8 bit, a soft shoulder above KNEE.
vec3 decode(vec3 e) {
  vec3 y = e * e * ${SKY.top.toFixed(1)};
  vec3 hi = ${SKY.knee.toFixed(1)} - ${(SKY.top - SKY.knee).toFixed(1)} * log(max(vec3(0.004), 1.0 - (y - ${SKY.knee.toFixed(1)}) / ${(SKY.top - SKY.knee).toFixed(1)}));
  return mix(y, hi, step(${SKY.knee.toFixed(1)}, y));
}
vec3 broad(vec2 uv) { return decode(textureLod(uSky, uv, 7.5).rgb); }
// The plate with its broad light divided out: the clouds' own shapes, free to drift under a light that stays put.
vec3 shapes(vec2 uv) { return decode(texture2D(uSky, uv).rgb) / max(broad(uv), vec3(0.03)); }
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z); float el = asin(d.y);
  vec2 uv = clamp(vec2(az / ${rad(2 * SKY.az)} + 0.5, (el - ${rad(SKY.el0)}) / ${rad(SKY.el1 - SKY.el0)}), 0.001, 0.999);
  // The clouds go round with the wind. ponytail: the plate is a 76° window, not a panorama, so where its edge
  // comes round (minutes in) the other half is faded in over it; a full 360° band would need no such join.
  float u = fract(uv.x - uCloud.z); float whole = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
  vec3 c = mix(shapes(vec2(fract(u + 0.5), uv.y)), shapes(vec2(u, uv.y)), whole) * broad(uv);
  // The sun stays where the plate has it, behind the cloud's edge: its disc burns through and the air round it
  // glows, less while a cloud's shadow lies on the lens. Its rays shimmer a little.
  float ang = acos(clamp(dot(d, SUN_SEEN), -1.0, 1.0));
  float core = exp(-ang * ang / 0.004); float aura = exp(-ang / 0.2);
  float th = atan(d.y - SUN_SEEN.y, d.x - SUN_SEEN.x);
  c *= 1.0 + uSunny * (3.0 * core + 0.5 * aura) + 0.08 * aura * sin(th * 29.0 + 2.0 * sin(th * 7.0 + uTime * 0.21) + uTime * 0.13);
  c += uSunCol * uSunny * core * 1.5;
  // Land beyond the crest: a far ridge and a nearer line of trees, each the sky's own colour gone darker in the haze.
  float ridge = 0.022 + 0.007 * sin(az * 7.0 + 1.0) + 0.004 * sin(az * 17.0 + 2.0);
  float trees = 0.011 + 0.004 * sin(az * 11.0 + 0.3) + 0.0035 * abs(sin(az * 53.0 + 1.3 * sin(az * 31.0))) + 0.0015 * abs(sin(az * 131.0));
  c = mix(c, c * vec3(0.62, 0.68, 0.80), smoothstep(ridge + 0.0015, ridge - 0.0015, el));
  c = mix(c, c * vec3(0.42, 0.47, 0.52), smoothstep(trees + 0.001, trees - 0.001, el));
  // the one smooth gradient in the 8-bit scene: dithered here, before it is quantised, so it cannot band
  float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  gl_FragColor = vec4(pack(c) + (dn - 0.5) / 255.0, 0.0);
}`;

export function createSky(shared, texture) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uSky: { value: texture } }, side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 9;
  return { mesh, dispose() { geo.dispose(); mat.dispose(); } };
}
