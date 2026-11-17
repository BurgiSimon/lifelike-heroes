// The word: Bodoni Moda 600 cut from steel plate and stood in the field. Real extruded geometry from the font's
// outlines, plus a mipped silhouette the grass reads the word's shadow from.
import * as THREE from 'three';
import { PATH, META } from './glyphs.js';
import { D, CAP } from './config.js';
import { ground } from './terrain.js';
import { LIGHT } from './glsl.js';

export const EM = CAP / META.cap;
export const SINK = 0.14;                   // how far the feet are set into the ground
const DEPTH = 0.34;                         // plate thickness

let cache = null;                           // the outlines never change: one set for the box, the geometry and the shadow
function shapes() {
  if (cache) return cache;
  const sp = new THREE.ShapePath();
  for (const c of PATH) {
    if (c[0] === 'M') sp.moveTo(c[1] * EM, c[2] * EM);
    else if (c[0] === 'L') sp.lineTo(c[1] * EM, c[2] * EM);
    else if (c[0] === 'Q') sp.quadraticCurveTo(c[1] * EM, c[2] * EM, c[3] * EM, c[4] * EM);
    else if (c[0] === 'C') sp.bezierCurveTo(c[1] * EM, c[2] * EM, c[3] * EM, c[4] * EM, c[5] * EM, c[6] * EM);
  }
  return (cache = sp.toShapes(false));
}

// Where the word stands, from its outlines alone: the frame and the DOM headline are laid out from this before any
// texture has arrived.
export function wordBox() {
  let x0 = 1e9; let x1 = -1e9; let top = -1e9;
  for (const s of shapes()) for (const p of s.getPoints(16)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); top = Math.max(top, p.y); }
  const width = x1 - x0;
  // The lowest ground along the word decides how deep the plate is set, so no foot floats over a swell.
  let low = 1e9; for (let x = -width / 2; x <= width / 2; x += 0.5) low = Math.min(low, ground(x, -D));
  return { cx: (x0 + x1) / 2, width, top, baseY: low - SINK };
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
  vec3 albedo = a1 * (0.4 + 3.2 * a2.g) * mix(0.8, 1.2, smoothstep(0.08, 0.2, streak)) * vec3(1.6, 1.15, 0.85);
  albedo = mix(albedo, vec3(0.085, 0.07, 0.05), 0.5 * exp(-up * 2.2) * a2.r * 6.0);
  float rough = clamp(texture2D(uRough, uv * 0.23).r * 1.05, 0.3, 1.0);
  // The grass stands against the feet: it shades them and throws its own colour back up.
  float occ = mix(0.45, 1.0, smoothstep(0.1, 1.5, up));
  vec3 bounce = vec3(0.11, 0.105, 0.045) * exp(-up * 0.9) * (0.5 - 0.5 * n.y);   // the sunlit field lights the feet and the undersides a little
  float ndl = max(dot(n, uSun), 0.0); float nv = max(dot(n, v), 0.0);
  // The low sun rakes the edges turned to it: a warm rim, warmest seen edge-on.
  vec3 sun = uSunCol * cloudSun(vPos.xz);
  // ponytail: the shaded faces get twice their sky light, as a photographer's fill would give, so the steel reads as steel, not as a cut-out
  vec3 col = albedo * ((skyLight(n) * occ + bounce) * 2.0 + sun * (ndl + 0.3 * pow(1.0 - nv, 3.0) * step(0.0, dot(n, uSun))));
  // Sheen: the sky mirrored in the plate where clean scale shows through the rust; rust itself mirrors nothing.
  vec3 r = reflect(-v, n);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0) * (1.0 - rough) * (1.0 - rough);
  col += envAt(r, 1.0 + rough * 6.0) * fres * occ * (1.0 - rough * 0.5);
  vec3 hv = normalize(uSun + v); float nh = max(dot(n, hv), 0.0);
  col += sun * ndl * pow(nh, mix(180.0, 14.0, rough)) * mix(0.9, 0.08, rough);
  float dist = length(cameraPosition - vPos);
  gl_FragColor = vec4(pack(haze(col, dist)), cocAt(dist));
}`;

export function createLetters(renderer, shared, textures) {
  const sh = shapes(); const box = wordBox();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 2, curveSegments: 16 });
  geo.translate(-box.cx, box.baseY, -D - DEPTH / 2);

  // Silhouette for the shadow: the same outlines, flat, white on black, with room around them.
  const PADX = 1.5; const rect = { x0: -box.width / 2 - PADX, y0: box.baseY - 0.2, w: box.width + PADX * 2, h: box.top + 1.2 };
  const rt = new THREE.WebGLRenderTarget(2048, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, samples: 4 });
  const flat = new THREE.ShapeGeometry(sh, 16); flat.translate(-box.cx, box.baseY, 0);
  const cam = new THREE.OrthographicCamera(rect.x0, rect.x0 + rect.w, rect.y0 + rect.h, rect.y0, -1, 1);
  const flatMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(flat, flatMat));
  // Drawn once, and again if the GL context was lost: a render target does not come back with its picture.
  const bake = () => { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null); };
  bake();
  shared.uMask.value = rt.texture; shared.uMaskRect.value.set(rect.x0, rect.y0, 1 / rect.w, 1 / rect.h); shared.uWordZ.value = -D;

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...shared, uEnv: { value: textures.env }, uPlate: { value: textures.plate }, uRough: { value: textures.rough }, uBaseY: { value: box.baseY }, uEnvMax: { value: 24 } },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 0;
  return { mesh, bake, dispose() { geo.dispose(); mat.dispose(); rt.dispose(); flat.dispose(); flatMat.dispose(); } };
}
