// The pointer's push on the grass: a small grid of springs laid over the field the way the original laid its
// blades — across the frame, and by depth down it. Each cell leans away from the pointer (and with its speed) on
// the original's spring; every blade and flower reads its lean from the grid in the vertex shader.
import * as THREE from 'three';
import { SPRING } from './config.js';

const GW = 96; const GH = 28;

export function createField(shared) {
  const o = new Float32Array(GW * GH); const v = new Float32Array(GW * GH);
  const half = new Uint16Array(GW * GH);
  const tex = new THREE.DataTexture(half, GW, GH, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  shared.uPush.value = tex;
  const rowY = new Float32Array(GH); const rowH = new Float32Array(GH); const rowS = new Float32Array(GH);
  let W = 1; let sprung = false;

  return {
    // rows: for a depth share p, the screen y of the ground there and the on-screen height of the grass standing on it
    layout(width, yAt, heightAt) {
      W = width;
      for (let j = 0; j < GH; j++) { const p = (j + 0.5) / GH; rowY[j] = yAt(p); rowH[j] = heightAt(p); rowS[j] = 0.24 + 0.76 * p ** 0.9; }
    },
    // f: the step in 60 Hz frames. ptr: { x, y, v } in px and px/ms, or x === null when away. Returns true while anything moves.
    step(f, ptr, reach) {
      if (ptr.x === null && !sprung) return false;
      let energy = 0;
      for (let j = 0; j < GH; j++) {
        const r = reach * (0.4 + 0.6 * rowS[j]); const cy = rowY[j] - rowH[j] * 0.5;
        for (let i = 0; i < GW; i++) {
          const k = j * GW + i; let want = 0;
          if (ptr.x !== null) {
            const bx = (i + 0.5) / GW * W; const d = Math.hypot(bx - ptr.x, cy - ptr.y) / r;
            if (d < 1) want = (1 - d) ** 2 * Math.min(1, Math.max(-1, (Math.sign(bx - ptr.x) || 1) * 0.6 + ptr.v * 0.4));
          }
          v[k] += ((want - o[k]) * SPRING.k - v[k] * SPRING.damping) * f; o[k] += v[k] * f;
          const e = Math.abs(o[k]) + Math.abs(v[k]); if (e > energy) energy = e;
          half[k] = THREE.DataUtils.toHalfFloat(o[k]);
        }
      }
      sprung = energy > 0.002;
      if (!sprung) { o.fill(0); v.fill(0); half.fill(0); }
      tex.needsUpdate = true;
      return true;
    },
    // everything upright again, at once (for the still picture)
    reset() { o.fill(0); v.fill(0); half.fill(0); sprung = false; tex.needsUpdate = true; },
    dispose() { tex.dispose(); },
  };
}
