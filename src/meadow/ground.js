// The soil and thatch between the stems: a real photographed litter texture on the terrain, deep in the canopy's shade.
import * as THREE from 'three';
import { ground } from './terrain.js';
import { shared, LIGHT } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
${LIGHT}
uniform sampler2D uThatch;
varying vec3 vPos;
void main() {
  // Two scales and a slow tint, so the tile never shows as a grid.
  vec3 a = texture2D(uThatch, vPos.xz * 0.9).rgb * (0.55 + 0.9 * texture2D(uThatch, vPos.xz * 0.13 + 0.4).g);
  float patchy = 0.5 + 0.5 * sin(vPos.x * 0.7 + 2.0 * sin(vPos.z * 0.45)) * sin(vPos.z * 0.6 + 1.3);
  a = mix(a * vec3(0.30, 0.24, 0.16), a * vec3(0.20, 0.24, 0.10), patchy);     // damp earth to mossy litter
  // Under half a metre of stems almost no sun and little sky reaches the floor.
  vec3 col = a * (skyLight(vec3(0.0, 1.0, 0.0)) * 0.16 + uSunCol * 0.012 * wordShadow(vPos + vec3(0.0, 0.3, 0.0)));
  float dist = length(cameraPosition - vPos);
  gl_FragColor = vec4(pack(haze(col, dist)), cocAt(-(viewMatrix * vec4(vPos, 1.0)).z));
}`;

export function createGround(texture) {
  const geo = new THREE.PlaneGeometry(90, 46, 90, 92); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -22.5);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...shared, uThatch: { value: texture } } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;
  return { mesh, dispose() { geo.dispose(); mat.dispose(); } };
}
