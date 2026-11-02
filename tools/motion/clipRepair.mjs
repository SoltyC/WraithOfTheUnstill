#!/usr/bin/env node
// What the gate's faults can be repaired by, on the game clip, before it is judged again (docs/phase-10/motion-gate.md).
//   node tools/motion/clipRepair.mjs <in.bin> <out.bin> fit [feet] [loop=<seconds of overlap>]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FIELDS, FPS, readClip } from './clipGate.mjs';

const FEET = 39;
const SH = 21, EL = 27, HA = 33;
const smooth = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
const ease5 = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * u * (u * (u * 6 - 15) + 10); };

// SOMA stands 10 cm taller at the hip than the rig, on ankles rather than soles: fit it, or the hem rides up and the feet float.
const SOMA_PELVIS = 0.985, RIG_PELVIS = 0.88, SOMA_ANKLE = 0.05;

/**
 * Put a clip on the rig: the upper body drops by the difference in hip height, keeping the arms' own lengths, and the ankles
 * become soles. Every clip has this.
 * @returns {Float32Array} a new clip
 */
export function fitRig(v) {
  const T = v[0], o = v.slice(), drop = SOMA_PELVIS - RIG_PELVIS;
  for (let t = 0; t < T; t++) {
    const b = 1 + t * FIELDS;
    for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3]) o[b + k + 1] -= drop;
    o[b + FEET + 1] -= SOMA_ANKLE; o[b + FEET + 4] -= SOMA_ANKLE;
  }
  return o;
}

/**
 * Pin each foot where it lands. A planted run is low and slow; through it the ankle holds the place it landed, and it
 * eases in and out over `ease` frames so the step neither snaps nor drags. The knee solver takes up the difference.
 * @returns {Float32Array} a new clip
 */
export function lockFeet(v, { lift = 0.055, slow = 1.1, ease = 7 } = {}) {
  const T = v[0], o = v.slice(), at = (t, k) => 1 + t * FIELDS + k;
  const ys = []; for (let t = 0; t < T; t++) ys.push(v[at(t, FEET + 1)], v[at(t, FEET + 4)]);
  ys.sort((a, b) => a - b); const rest = ys[Math.floor(ys.length * 0.02)];
  for (const f of [FEET, FEET + 3]) {
    const planted = new Uint8Array(T);
    for (let t = 0; t < T; t++) {
      const a = Math.max(0, t - 1), b = Math.min(T - 1, t + 1);
      const sp = Math.hypot(v[at(b, f)] - v[at(a, f)], v[at(b, f + 2)] - v[at(a, f + 2)]) * FPS / (b - a);
      planted[t] = v[at(t, f + 1)] < rest + lift && sp < slow ? 1 : 0;
    }
    for (let t = 0; t < T;) {
      if (!planted[t]) { t++; continue; }
      let e = t; while (e + 1 < T && planted[e + 1]) e++;
      if (e - t >= 3) {
        // Stand at the plant's quietest frame: the foot barely moves, so the pin barely shifts the leg.
        let q = t, best = 1e9;
        for (let i = t; i < e; i++) { const s = Math.hypot(v[at(i + 1, f)] - v[at(i, f)], v[at(i + 1, f + 2)] - v[at(i, f + 2)]); if (s < best) { best = s; q = i; } }
        const x = v[at(q, f)], z = v[at(q, f + 2)];
        for (let i = Math.max(0, t - ease); i <= Math.min(T - 1, e + ease); i++) {
          const w = i < t ? ease5((i - t + ease + 1) / (ease + 1)) : i > e ? ease5((e + ease + 1 - i) / (ease + 1)) : 1;
          o[at(i, f)] = v[at(i, f)] + (x - v[at(i, f)]) * w;
          o[at(i, f + 2)] = v[at(i, f + 2)] + (z - v[at(i, f + 2)]) * w;
        }
      }
      t = e + 1;
    }
  }
  return o;
}

/**
 * Close a clip into a loop: its tail is dissolved into its head, so the last frame IS the first and performance.js plays the
 * period through them. The cost is the overlap's seconds off the clip's length.
 * @returns {Float32Array} a new clip
 */
export function closeLoop(v, seconds = 0.7) {
  const T = v[0], m = Math.round(seconds * FPS), n = T - m;
  if (n < FPS) throw new Error('clip too short to loop');
  const o = new Float32Array(1 + n * FIELDS); o[0] = n;
  o.set(v.subarray(1, 1 + n * FIELDS), 1);
  // The frames of the head [0, m] are blended toward the frames that follow the cut: head k = cut + k, by a falling weight.
  for (let k = 0; k <= m; k++) {
    const w = smooth(k / m);
    for (let c = 0; c < FIELDS; c++) o[1 + k * FIELDS + c] = v[1 + (n - 1 + k) * FIELDS + c] * (1 - w) + v[1 + k * FIELDS + c] * w;
  }
  // A straight blend of joints shortens the arms where the two poses differ: walk each arm back out to its own length.
  const b = (t, k) => 1 + t * FIELDS + k;
  const dist = (a, c, t) => Math.hypot(v[b(t, a)] - v[b(t, c)], v[b(t, a + 1)] - v[b(t, c + 1)], v[b(t, a + 2)] - v[b(t, c + 2)]);
  for (let t = 0; t <= m; t++) for (const side of [0, 3]) {
    const s = SH + side, e = EL + side, h = HA + side, upper = dist(s, e, 0), fore = dist(e, h, 0);
    const out = (from, to, l) => {
      const dx = o[b(t, to)] - o[b(t, from)], dy = o[b(t, to + 1)] - o[b(t, from + 1)], dz = o[b(t, to + 2)] - o[b(t, from + 2)], k = l / (Math.hypot(dx, dy, dz) || 1);
      o[b(t, to)] = o[b(t, from)] + dx * k; o[b(t, to + 1)] = o[b(t, from + 1)] + dy * k; o[b(t, to + 2)] = o[b(t, from + 2)] + dz * k;
    };
    out(s, e, upper); out(e, h, fore);
  }
  o.set(o.subarray(1, 1 + FIELDS), 1 + (n - 1) * FIELDS);
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, dst, ...ops] = process.argv.slice(2);
  let v = readClip(src);
  for (const op of ops) {
    if (op === 'fit') v = fitRig(v);
    else if (op === 'feet') v = lockFeet(v);
    else if (op.startsWith('loop')) v = closeLoop(v, +(op.split('=')[1] || 0.7));
    else throw new Error(`unknown repair ${op}`);
  }
  writeFileSync(dst, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
  console.log('wrote', dst, 'frames', v[0]);
}
