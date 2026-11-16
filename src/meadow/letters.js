// The word: Bodoni Moda 600 cut from steel plate and stood in the field. Real extruded geometry from the font's
// outlines, plus a mipped silhouette the grass reads the word's shadow from.
import * as THREE from 'three';
import { PATH, META } from './glyphs.js';
import { D, CAP } from './config.js';
import { ground } from './terrain.js';
import { shared, LIGHT } from './glsl.js';

export const EM = CAP / META.cap;
const DEPTH = 0.34; const SINK = 0.14;      // plate thickness; how far the feet are set into the ground

function shapes() {
  const sp = new THREE.ShapePath();
  for (const c of PATH) {
    if (c[0] === 'M') sp.moveTo(c[1] * EM, c[2] * EM);
    else if (c[0] === 'L') sp.lineTo(c[1] * EM, c[2] * EM);
    else if (c[0] === 'Q') sp.quadraticCurveTo(c[1] * EM, c[2] * EM, c[3] * EM, c[4] * EM);
    else if (c[0] === 'C') sp.bezierCurveTo(c[1] * EM, c[2] * EM, c[3] * EM, c[4] * EM, c[5] * EM, c[6] * EM);
  }
  return sp.toShapes(false);
}

const VERT = /* glsl */`
varying vec3 vPos; varying vec3 vNrm;
void main() {
  vPos = position; vNrm = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
${LIGHT}
uniform sampler2D uEnv; uniform sampler2D uPlate; uniform sampler2D uRough; uniform float uBaseY; uniform float uEnvMax;
varying vec3 vPos; varying vec3 vNrm;

vec3 envAt(vec3 d, float lod) {
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  vec3 e = textureLod(uEnv, uv, lod).rgb; e = e * e * uEnvMax;
  // below the horizon the plate mirrors the field, not the HDRI's empty ground
  return mix(vec3(0.05, 0.06, 0.025) * (0.6 + 2.0 * max(0.0, -d.z)), e, smoothstep(-0.06, 0.03, d.y));
}
void main() {
  vec3 n = normalize(vNrm); vec3 v = normalize(cameraPosition - vPos);
  // Plate mapped flat on the faces, along the depth on the edges; two scales so no tile repeats along the word.
  vec2 uv = abs(n.z) > 0.5 ? vPos.xy : vec2(vPos.z + vPos.x * 0.3, vPos.y);
  vec3 a1 = texture2D(uPlate, uv * 0.23).rgb; vec3 a2 = texture2D(uPlate, uv * 0.061 + 0.37).rgb;
  float streak = texture2D(uPlate, vec2(uv.x * 0.33, uv.y * 0.017)).r;     // rain runs straight down a plate
  float up = vPos.y - uBaseY;                                              // height above the feet
  // Weathering steel with years on it: the photographed rust, settled to a dark patina, streaked by run-off,
  // paler and dustier near the ground where the grass keeps it damp.
  vec3 albedo = a1 * (0.4 + 3.2 * a2.g) * mix(0.55, 1.2, smoothstep(0.08, 0.2, streak)) * vec3(0.42, 0.42, 0.5);
  albedo = mix(albedo, vec3(0.085, 0.07, 0.05), 0.5 * exp(-up * 2.2) * a2.r * 6.0);
  float rough = clamp(texture2D(uRough, uv * 0.23).r * 1.05, 0.3, 1.0);
  // The grass stands against the feet: it shades them and throws its own colour back up.
  float occ = mix(0.25, 1.0, smoothstep(0.1, 1.5, up));
  vec3 bounce = vec3(0.10, 0.11, 0.035) * exp(-up * 0.9) * (0.5 - 0.5 * n.y);
  float ndl = max(dot(n, uSun), 0.0);
  vec3 col = albedo * (skyLight(n) * occ + bounce + uSunCol * ndl);
  // Sheen: the sky mirrored in the plate, sharper on clean scale than on rust.
  vec3 r = reflect(-v, n); float nv = max(dot(n, v), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0) * (1.0 - rough * 0.6);
  col += envAt(r, 1.0 + rough * 6.0) * fres * occ * (1.0 - rough * 0.5);
  vec3 hv = normalize(uSun + v); float nh = max(dot(n, hv), 0.0);
  col += uSunCol * ndl * pow(nh, mix(180.0, 14.0, rough)) * mix(0.9, 0.08, rough);
  float dist = length(cameraPosition - vPos);
  gl_FragColor = vec4(pack(haze(col, dist)), cocAt(dist));
}`;

export function createLetters(renderer, textures) {
  const sh = shapes();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 2, curveSegments: 16 });
  geo.computeBoundingBox();
  const bb = geo.boundingBox; const width = bb.max.x - bb.min.x;
  // The lowest ground along the word decides how deep the plate is set, so no foot floats over a swell.
  let low = 1e9; for (let x = -width / 2; x <= width / 2; x += 0.5) low = Math.min(low, ground(x, -D));
  const baseY = low - SINK;
  geo.translate(-(bb.min.x + bb.max.x) / 2, baseY, -D - DEPTH / 2);
  geo.computeBoundingBox();

  // Silhouette for the shadow: the same outlines, flat, white on black, with room around them.
  const PADX = 1.5; const rect = { x0: -width / 2 - PADX, y0: baseY - 0.2, w: width + PADX * 2, h: (bb.max.y - bb.min.y) + 1.2 };
  const rt = new THREE.WebGLRenderTarget(2048, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, samples: 4 });
  const flat = new THREE.ShapeGeometry(sh, 16); flat.translate(-(bb.min.x + bb.max.x) / 2, baseY, 0);
  const cam = new THREE.OrthographicCamera(rect.x0, rect.x0 + rect.w, rect.y0 + rect.h, rect.y0, -1, 1);
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })));
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
  flat.dispose(); scene.children[0].material.dispose();
  shared.uMask.value = rt.texture; shared.uMaskRect.value.set(rect.x0, rect.y0, 1 / rect.w, 1 / rect.h); shared.uWordZ.value = -D;

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...shared, uEnv: { value: textures.env }, uPlate: { value: textures.plate }, uRough: { value: textures.rough }, uBaseY: { value: baseY }, uEnvMax: { value: 24 } },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 0;
  return { mesh, width, baseY, top: bb.max.y + baseY, dispose() { geo.dispose(); mat.dispose(); rt.dispose(); } };
}
