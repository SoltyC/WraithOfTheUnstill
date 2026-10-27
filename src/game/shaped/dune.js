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
  if (s.state === 3) {
    fx.ex = b.x; fx.ez = b.z; fx.ey = b.y + 0.12;
    fx.evx = -Math.sin(b.heading) * 1.4; fx.evz = -Math.cos(b.heading) * 1.4; fx.evy = 0.7;
    fx.esize = 0.08; fx.emit();
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
    const side = (c & 1) ? 1 : -1;
    chunks[o] += side * dt * 0.7;
    chunks[o + 1] += (2 - 7 * st.plateAge) * dt;
    chunks[o + 2] -= dt * 0.3;
    chunks[o + 15] = Math.min(1, Math.max(0, (2 - st.plateAge) * 2));
  }
}
