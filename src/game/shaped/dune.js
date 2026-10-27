// Dune material answers and the travelling skitter cover. All state belongs to the slot.
import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export function frontal(b, dx, dz) {
  // A strike travels from the attacker toward the body; the head faces the attacker.
  return dx * Math.sin(b.heading) + dz * Math.cos(b.heading) < -0.35;
}
export function strip(s) {
  if (s.arch === 'plateback' && !s.st.plateOff) s.st.seamK = 0;
  if (s.arch === 'skitter') { s.cover = false; s.coverTime = 2.5; }
}
export function erupt(s) {
  if (s.arch === 'skitter') { s.cover = false; s.coverTime = 2.5; }
}
export function popPlate(s) {
  if (s.arch !== 'plateback' || s.st.plateOff) return false;
  s.st.plateOff = true; s.st.plateAge = 0; s.st.seamK = 0;
  return true;
}
export function duneStep(s, ts, fx, frost, dt) {
  if (s.arch !== 'skitter') return;
  const b = s.body;
  s.coverTime = Math.max(0, s.coverTime - dt);
  const ice = frost && frost.iceAt(b.x, b.z);
  s.cover = (s.state === 2 || s.state === 3) && s.coverTime === 0 && !ice;
  if (!s.cover && s.state !== 3) return;
  // A displaced mound and its depression move together, through the shared state brush.
  ts.bx = b.x; ts.bz = b.z; ts.bdx = Math.sin(b.heading); ts.bdz = Math.cos(b.heading);
  ts.bl = 0.35; ts.bw = 0.7; ts.bd = 0.18; ts.bc = 0.2;
  ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1; ts.stamp();
  // Heap the raised centre after cutting the channel; the following plough clears its wake.
  ts.bl = 0.2; ts.bw = 0.5; ts.bd = 0.24; ts.bc = 0; ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
  if (s.state === 3) {
    const dx = Math.sin(b.heading), dz = Math.cos(b.heading);
    for (let k = 0; k < 3; k++) {
      const side = (k - 1) * 0.33;
      fx.ex = b.x + dz * side; fx.ez = b.z - dx * side; fx.ey = b.y + 0.12;
      fx.evx = -dx * 1.7 + dz * side; fx.evz = -dz * 1.7 - dx * side; fx.evy = 0.8 + k * 0.15;
      fx.esize = 0.16; fx.emit();
    }
  }
}

// Detached shell chunks keep their last rendered position and tumble down independently.
export function stepPlate(s, chunks, rec, dt) {
  const st = s.st, rig = s.rig;
  if (!st.plateOff) return;
  st.plateAge += dt;
  for (let c = rig.plate0; c < rig.plate1; c++) {
    const o = (rec + c) * 16;
    if (st.plateAge > 2) { chunks[o + 15] = 0; continue; }
    const side = (c & 1) ? 1 : -1, scatter = (c * 7 % 11) * 0.13;
    chunks[o] += side * dt * (0.9 + scatter);
    chunks[o + 1] += (2 + scatter * 2 - 7 * st.plateAge) * dt;
    chunks[o + 2] += ((c % 3) - 1) * 0.7 * dt;
    chunks[o + 15] = Math.min(1, Math.max(0, (2 - st.plateAge) * 2));
  }
}

// Coarse grains in the stream use the existing sand chunk pipeline; their analytic motion is
// phase-offset across the telegraph, so the warning remains visible even where fine dust fades.
export function writeStream(s, out, rec) {
  if (s.arch !== 'skitter' || s.state !== 3 || !s.cover) return;
  const b = s.body, dx = Math.sin(b.heading), dz = Math.cos(b.heading);
  for (let k = 0; k < 24; k++) {
    const age = (s.t * 2.5 + k * 0.19) % 1, angle = k * 2.399;
    const lateral = Math.cos(angle) * (0.25 + age * 0.6), back = Math.sin(angle) * (0.25 + age * 0.6);
    const o = (rec + k) * 16;
    out[o] = b.x + dz * lateral - dx * back; out[o + 1] = b.y + 0.25 + 0.8 * age * (1 - age); out[o + 2] = b.z - dx * lateral - dz * back;
    const size = 0.045 + (k % 4) * 0.012;
    out[o + 3] = size; out[o + 4] = dx; out[o + 5] = 0; out[o + 6] = dz; out[o + 7] = size * 1.4;
    out[o + 8] = 0; out[o + 9] = 1; out[o + 10] = 0; out[o + 11] = size;
    out[o + 12] = k * 17; out[o + 13] = 11; out[o + 14] = 0; out[o + 15] = Math.min(1, age * 5, (1 - age) * 5);
  }
}
