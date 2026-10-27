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
  if (!s.cover) return;
  // The body pushes a dome above itself, filling its spawn hollow as it travels. A Ridge
  // preserved that hollow and its lateral cuts, so a buried Skitter looked like a crater.
  // Use one filling brush: overlapping plough/mound jobs have no guaranteed write order.
  ts.bx = b.x; ts.bz = b.z; ts.bdx = Math.sin(b.heading); ts.bdz = Math.cos(b.heading);
  ts.bl = 0.4; ts.bw = 0.65; ts.bd = 0.36; ts.bc = 0.2;
  ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
  if (s.state === 3) {
    const dx = Math.sin(b.heading), dz = Math.cos(b.heading);
    for (let k = 0; k < 3; k++) {
      const side = (k - 1) * 0.33;
      fx.ex = b.x + dz * side; fx.ez = b.z - dx * side; fx.ey = b.y + 0.40;
      fx.evx = -dx * 1.1 + dz * side; fx.evz = -dz * 1.1 - dx * side; fx.evy = 0.25 + k * 0.1;
      fx.esize = 0.20; fx.emit();
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
  for (let k = 0; k < 48; k++) {
    // Three narrow streams spill from the crown, accelerated down its sides. Many small
    // grains read as falling sand; a sparse ring of large airborne chunks read as pebbles.
    const age = (s.t * 2.5 + k / 48) % 1, lane = (k % 3 - 1) * 0.22;
    const spread = lane * (0.35 + age), back = 0.05 + age * age * 0.85;
    const o = (rec + k) * 16;
    out[o] = b.x + dz * spread - dx * back; out[o + 1] = b.y + 0.39 + 0.12 * Math.sin(age * Math.PI) - age * age * 0.32; out[o + 2] = b.z - dx * spread - dz * back;
    const size = 0.009 + (k % 4) * 0.002;
    out[o + 3] = size; out[o + 4] = dx; out[o + 5] = 0; out[o + 6] = dz; out[o + 7] = size * 1.4;
    out[o + 8] = 0; out[o + 9] = 1; out[o + 10] = 0; out[o + 11] = size;
    out[o + 12] = k * 17; out[o + 13] = 11; out[o + 14] = 0; out[o + 15] = Math.min(1, age * 5, (1 - age) * 5);
  }
}
