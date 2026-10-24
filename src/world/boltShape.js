// A lightning bolt's shape (Phase 8 M11): a jagged main channel from the cloud to the ground by
// recursive midpoint displacement, branches that fork off and run on downward, and a couple of
// leaders that spread through the cloud. Procedural from a seed; writes segments into a flat array
// (no allocation) for render/lightningBolt.js. Segment s: x0 y0 z0 w0 x1 y1 z1 w1 at s*8, w the
// width factor (1 = the channel's).

export const MAX_SEGMENTS = 256;
const MAIN_DEPTH = 6;       // 64 segments
const BRANCH_DEPTH = 4;     // 16 each

/** @param {Float32Array} out  MAX_SEGMENTS × 8 floats. Returns the segment count. */
export function buildBolt(seed, topX, topY, topZ, gx, gy, gz, out) {
  let n = 0, rs = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  const rnd = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
  for (let i = 0; i < 4; i++) rnd();
  const emit = (x0, y0, z0, w0, x1, y1, z1, w1) => {
    if (n >= MAX_SEGMENTS) return;
    const o = n++ * 8;
    out[o] = x0; out[o + 1] = y0; out[o + 2] = z0; out[o + 3] = w0; out[o + 4] = x1; out[o + 5] = y1; out[o + 6] = z1; out[o + 7] = w1;
  };
  // Midpoint displacement: the offset is perpendicular to the segment, random in both directions.
  const sub = (x0, y0, z0, x1, y1, z1, disp, depth, w0, w1) => {
    if (depth === 0) { emit(x0, y0, z0, w0, x1, y1, z1, w1); return; }
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
    // Two perpendiculars: dir × up (horizontal), and dir × that.
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const a = (rnd() * 2 - 1) * disp, b = (rnd() * 2 - 1) * disp * 0.8;
    const mx = (x0 + x1) / 2 + ux * a + vx * b, my = (y0 + y1) / 2 + uy * a + vy * b, mz = (z0 + z1) / 2 + uz * a + vz * b;
    const wm = (w0 + w1) / 2;
    sub(x0, y0, z0, mx, my, mz, disp * 0.55, depth - 1, w0, wm);
    sub(mx, my, mz, x1, y1, z1, disp * 0.55, depth - 1, wm, w1);
  };
  const L = Math.sqrt((topX - gx) ** 2 + (topY - gy) ** 2 + (topZ - gz) ** 2);
  const mark = n;
  sub(topX, topY, topZ, gx, gy, gz, L * 0.11, MAIN_DEPTH, 0.7, 1);
  const mainN = n - mark;
  // Forks: from a point on the lower three-quarters of the channel, running on down and out.
  const forks = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < forks; k++) {
    const s = mark + Math.floor((0.2 + 0.7 * rnd()) * mainN), o = s * 8;
    if (s >= mark + mainN) continue;
    const sx = out[o + 4], sy = out[o + 5], sz = out[o + 6];
    const ang = rnd() * 6.2832, len = L * (0.1 + 0.2 * rnd()), drop = 0.45 + 0.4 * rnd();
    sub(sx, sy, sz, sx + Math.cos(ang) * len * 0.8, Math.max(sy - len * drop, gy), sz + Math.sin(ang) * len * 0.8, len * 0.1, BRANCH_DEPTH, 0.4, 0.08);
  }
  // Leaders through the cloud: near-horizontal reaches from the channel's top.
  for (let k = 0; k < 2; k++) {
    const s = mark + Math.floor(rnd() * 0.12 * mainN), o = s * 8;
    const sx = out[o + 4], sy = out[o + 5], sz = out[o + 6];
    const ang = rnd() * 6.2832, len = 250 + 450 * rnd();
    sub(sx, sy, sz, sx + Math.cos(ang) * len, sy - len * 0.12, sz + Math.sin(ang) * len, len * 0.1, BRANCH_DEPTH, 0.5, 0.1);
  }
  return n;
}
