// The Long Walker's ground (Phase 9 D10; docs/gameplay-design.md §5.1, dunes-design.md §4.3–4.4): its
// old circuit east of the Stride, the glass prints that mark it (Follow the Glass), the star megadune
// where it lies buried, and the camp's dry well it is brought home to. Coordinates follow
// docs/phase-9/figures/erg-plan.png (the dotted glass track) and the bake's seats
// (tools/bake-world/seats.mjs: ruin-long-walker 2436, 1124; the caravanserai 1810, 775).
// Pure data and helpers (tested in Node).

/** Where it lies buried, mid-stride, facing along its circuit. */
export const WALKER_SEAT = [2436, 1124];
/** The camp's dry well: the middle of the caravanserai's court (world/ruinKits.js: P(0, 1) from 1810, 775). */
export const CAMP_WELL = [1810.6, 775.8];
/** The caravanserai's gate faces the oasis pool (world/ruinKits.js): the way its head goes in to the well. */
export const CAMP_GATE_YAW = Math.atan2(1846 - 1810, 736 - 775);
/** The circuit, walked in this order and closed (W0 is the seat). It keeps clear of the obelisks, the
 *  colossus head and the temple, and stays east of the rift. */
export const CIRCUIT = [
  [2436, 1124], [2600, 1031], [2783, 888], [2822, 674], [2710, 512], [2535, 470], [2366, 595], [2400, 860],
];

/** Points along the closed circuit every `step` m: [x, z, heading] (heading atan2(dx, dz)). */
export function circuitSamples(step) {
  const out = [];
  let carry = 0;
  for (let k = 0; k < CIRCUIT.length; k++) {
    const a = CIRCUIT[k], b = CIRCUIT[(k + 1) % CIRCUIT.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), h = Math.atan2(dx, dz);
    for (let s = carry; s < L; s += step) out.push([a[0] + dx * s / L, a[1] + dz * s / L, h]);
    carry = (carry - L) % step; if (carry < 0) carry += step;
  }
  return out;
}

/** The glass prints (Follow the Glass): left and right feet alternating along the circuit, every
 *  ~45 m, skipping the stretch by the seat (the Walker itself stands there). Print 0 is the last
 *  before the seat, so following the indices down walks the circuit's way to it. [x, z, heading, side]. */
export function trackPrints() {
  const s = circuitSamples(45), out = [];
  for (let k = s.length - 1; k >= 2; k--) {
    const [x, z, h] = s[k], side = k % 2 ? 1 : -1;
    if (Math.hypot(x - WALKER_SEAT[0], z - WALKER_SEAT[1]) < 70) continue;
    out.push([x + Math.cos(h) * side * 13, z - Math.sin(h) * side * 13, h, side]);
  }
  return out;
}

const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
export const wrapPi = wrap;

/** Where to walk to rejoin (or keep to) the circuit from (x, z): a point 60 m along the nearest leg
 *  from the nearest point on it (so it joins at a slant, and rounds each corner), into out = [x, z]. */
export function circuitTarget(x, z, out) {
  let best = 0, bd = Infinity, bt = 0;
  for (let k = 0; k < CIRCUIT.length; k++) {
    const a = CIRCUIT[k], b = CIRCUIT[(k + 1) % CIRCUIT.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    const dx = a[0] + ex * t - x, dz = a[1] + ez * t - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = k; bt = t; }
  }
  let k = best, a = CIRCUIT[k], b = CIRCUIT[(k + 1) % CIRCUIT.length];
  let L = Math.hypot(b[0] - a[0], b[1] - a[1]), s = bt * L + 60;
  if (s > L) { s -= L; k = (k + 1) % CIRCUIT.length; a = CIRCUIT[k]; b = CIRCUIT[(k + 1) % CIRCUIT.length]; L = Math.hypot(b[0] - a[0], b[1] - a[1]); s = Math.min(s, L); }
  out[0] = a[0] + (b[0] - a[0]) * s / L; out[1] = a[1] + (b[1] - a[1]) * s / L;
  return out;
}

/** The compass's next print (Follow the Glass): from the player at p ({ x, z }), the print to make for —
 *  the one after the nearest along the way to the Walker; null when the Walker is the goal. */
export function nextPrint(prints, p) {
  let k = -1, bd = Infinity;
  for (let i = 0; i < prints.length; i++) { const dx = prints[i][0] - p.x, dz = prints[i][1] - p.z, d = Math.sqrt(dx * dx + dz * dz); if (d < bd) { bd = d; k = i; } }
  if (k < 0) return null;
  if (bd > 30) return prints[k];        // not on the track yet: the nearest print
  return k > 0 ? prints[k - 1] : null;  // on it: the next toward the seat (print 0's next is the Walker)
}
