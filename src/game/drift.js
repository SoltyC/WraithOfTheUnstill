// The robes on the water (release-cinematic.md shots 16–17, "the signature frame"): the city's people, released, come up out of
// the Sounding as empty cloth, face down, arms spread — they look like the Wraith. Thousands, out to the mist, in drifts the
// way flotsam gathers. Pure (tests/robes.test.js): where each lies, and the cloth's shape (a near one in detail, a far one in a
// few triangles). render/drift.js draws them.

import { SOUNDING } from '../world/sounding.js';
import { ihash, n1 } from './wave.js';

export const ROBES = { count: 8000, near: 360, nearR: 40, spacing: 1.45, r: 236 };

const h01 = (a, b) => ihash((Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0) / 4294967296;
/** Drift density at (x, z) relative to the centre, 0..1: long wind-rows of flotsam and the odd gap. */
export function driftAt(x, z) {
  const a = 0.6, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
  const rows = 0.5 + 0.5 * Math.sin(v * 0.11 + 3 * (n1(u * 0.02) - 0.5));
  const patch = n1(x * 0.013 + 7) * n1(z * 0.017 + 3);
  return Math.min(1, 0.25 + 0.75 * rows * (0.5 + patch));
}

/**
 * Where they lie: [{ x, z (world), yaw, scale, dye (0..5), seed, near }] — `near` the ones close to the centre (the camera's
 * frame), drawn in detail. Deterministic.
 */
export function placeRobes(o = ROBES) {
  const out = [], cell = o.spacing, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  let k = 0;
  for (let tries = 0; out.length < o.count && tries < o.count * 40; tries++) {
    const a = h01(tries, 1) * Math.PI * 2, r = Math.sqrt(h01(tries, 2)) * o.r;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Denser near the middle, and along the drifts.
    if (r > 70 && h01(tries, 3) > driftAt(x, z) * 0.85) continue;   // (the middle, where they came up, is full)
    const i = Math.floor(x / cell), j = Math.floor(z / cell);
    let clash = false;
    for (let di = -1; di <= 1 && !clash; di++) for (let dj = -1; dj <= 1; dj++) {
      const Q = grid.get(key(i + di, j + dj));
      if (Q && Q.some((q) => Math.hypot(q.x - x, q.z - z) < cell)) { clash = true; break; }
    }
    if (clash) continue;
    const p = { x, z, yaw: h01(tries, 4) * Math.PI * 2, scale: 0.88 + 0.24 * h01(tries, 5), dye: Math.floor(h01(tries, 6) * 6), seed: h01(tries, 7), near: false };
    const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(p); out.push(p); k++;
  }
  // The nearest to the centre in detail.
  const byR = out.map((p, i) => [Math.hypot(p.x, p.z), i]).sort((a, b) => a[0] - b[0]);
  for (let q = 0; q < Math.min(o.near, byR.length) && byR[q][0] < o.nearR; q++) out[byR[q][1]].near = true;
  for (const p of out) { p.x += SOUNDING.x; p.z += SOUNDING.z; }
  return out;
}

/**
 * One robe's cloth, lying face down (local: x across, z along — the hood at +z — y up off the water), as a list of grids.
 * detail: 1 near, 0 far. Returns { pos: [x, y, z, ...], nrm, idx }.
 */
export function robeTemplate(detail = 1) {
  const pos = [], nrm = [], idx = [];
  // The cloth's height off the water at a point of a part: trapped air in the hood and the back, folds running down the skirt,
  // the edges sinking.
  const grid = (nu, nv, at, height) => {
    const o = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, v = j / nv;
      const [x, z] = at(u, v), y = height(u, v);
      const e = 0.01, [xu, zu] = at(Math.min(1, u + e), v), [xv, zv] = at(u, Math.min(1, v + e));
      const yu = height(Math.min(1, u + e), v), yv = height(u, Math.min(1, v + e));
      const ax = xu - x, ay = yu - y, az = zu - z, bx = xv - x, by = yv - y, bz = zv - z;
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      pos.push(x, y, z); nrm.push(nx / l, ny / l, nz / l);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = o + j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  };
  const D = detail > 0.5;
  // The body: from the hem (v 0, fanned out and spread on the water) through the waist to the shoulders and the hood (v 1).
  const halfW = (v) => v < 0.45 ? 0.56 - 0.24 * (v / 0.45) : v < 0.76 ? 0.32 - 0.03 * ((v - 0.45) / 0.31) : 0.29 * Math.cos((v - 0.76) / 0.24 * Math.PI * 0.5) + 0.0;
  grid(D ? 14 : 4, D ? 22 : 6, (u, v) => {
    const w = halfW(v) * (v > 0.97 ? 0.2 : 1);
    // The hem's scallop: it lies in waves where it fanned out.
    const hem = v < 0.12 ? 0.04 * Math.sin(u * 7) * (1 - v / 0.12) : 0;
    return [u * w, -1.0 + v * 1.95 + hem];
  }, (u, v) => {
    // Soaked wool lies within a few cm of the water; only the air caught under the back and the hood domes it up, rounded.
    const edge = Math.pow(Math.abs(u), 3);
    const back = 0.045 * Math.sin(Math.PI * Math.min(1, v * 1.2)) * (1 - u * u);
    const hq = 1 - ((v - 0.86) / 0.13) ** 2 - u * u / 0.45;
    const hood = hq > 0 ? 0.1 * Math.pow(hq, 0.6) : 0;
    const folds = D ? 0.015 * Math.sin(u * 11 + Math.sin(v * 5) * 1.4) * Math.max(0, 1 - v * 1.6) : 0;
    return back + hood + folds - 0.03 * edge;
  });
  // The sleeves: spread from the shoulders, a little forward, flattened, the cuffs flared and sunk.
  for (const s of [-1, 1]) {
    const ang = s * (1.35 + 0.08 * s), ca = Math.cos(ang), sa = Math.sin(ang);
    grid(D ? 6 : 2, D ? 10 : 2, (u, v) => {
      const len = 0.08 + v * 0.66, w = 0.1 + 0.1 * v * v;   // the cuff opens out flat, wide as the forearm's cloth
      const ax = sa * len, az = 0.42 + ca * len * 0.35 + 0.1 * v;
      return [s * 0.24 + ax + u * w * ca * s, az - u * w * Math.abs(sa)];
    }, (u, v) => 0.035 * (1 - u * u) * (1 - v * 0.5) - 0.02 * v * v);
  }
  return { pos, nrm, idx };
}
