import { FINE_N, FINE_PER_M } from './layout.js';

// All brush programs reject distance >=1.9 half-widths from their direction segment.
// Even a non-unit direction is contained by these component bounds: p = direction*t + r,
// |t|<=halfLength, |r|<1.9*halfWidth. Inputs/outputs stay in existing typed arrays.
export function writeBrushRect(out, at, brush, from, origin) {
  const x = brush[from], z = brush[from + 1], radius = brush[from + 5] * 1.9;
  const rx = Math.abs(brush[from + 2]) * brush[from + 4] + radius;
  const rz = Math.abs(brush[from + 3]) * brush[from + 4] + radius;
  out[at] = Math.max(origin[0], Math.floor((x - rx) * FINE_PER_M));
  out[at + 1] = Math.max(origin[1], Math.floor((z - rz) * FINE_PER_M));
  out[at + 2] = Math.min(origin[0] + FINE_N, Math.ceil((x + rx) * FINE_PER_M));
  out[at + 3] = Math.min(origin[1] + FINE_N, Math.ceil((z + rz) * FINE_PER_M));
}
