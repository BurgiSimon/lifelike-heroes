// The sky: a window cut from a real HDRI (Poly Haven, kloppenheim_06_puresky), drawn on a dome behind everything.
import * as THREE from 'three';
import { SKY } from './config.js';
import { shared, LIGHT } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;                      // on the far plane: only where nothing else was drawn
}`;

const FRAG = /* glsl */`
${LIGHT}
uniform sampler2D uSky; uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z); float el = asin(d.y);
  vec2 uv = vec2(az / ${(2 * SKY.az * Math.PI / 180).toFixed(6)} + 0.5, (el - ${(SKY.el0 * Math.PI / 180).toFixed(6)}) / ${((SKY.el1 - SKY.el0) * Math.PI / 180).toFixed(6)});
  vec3 e = texture2D(uSky, clamp(uv, 0.001, 0.999)).rgb;
  // Undo the baker's curve: sqrt to 8 bit, a soft shoulder above KNEE.
  vec3 y = e * e * ${SKY.top.toFixed(1)};
  vec3 hi = ${SKY.knee.toFixed(1)} - ${(SKY.top - SKY.knee).toFixed(1)} * log(max(vec3(0.004), 1.0 - (y - ${SKY.knee.toFixed(1)}) / ${(SKY.top - SKY.knee).toFixed(1)}));
  vec3 c = mix(y, hi, step(${SKY.knee.toFixed(1)}, y));
  gl_FragColor = vec4(pack(c * uGain), 0.0);
}`;

export function createSky(texture) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uSky: { value: texture }, uGain: { value: 1 } }, side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 9;
  return { mesh, dispose() { geo.dispose(); mat.dispose(); } };
}
