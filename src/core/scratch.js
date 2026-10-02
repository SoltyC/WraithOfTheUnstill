// Scratch math. Pre-allocated Babylon math objects for per-frame code (BRIEF §14).
//
// Two patterns:
//  1. Module-level named temps in each hot module (preferred; zero bookkeeping).
//  2. The frame stacks below, for helpers that need a variable number of temps. Call
//     `scratchMark()` before and `scratchRelease(mark)` after; the stack never grows at runtime.

import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.vector.js';

const CAP = 64;

function makeStack(create) {
  const items = new Array(CAP);
  for (let i = 0; i < CAP; i++) items[i] = create();
  return { items, top: 0 };
}

const v3 = makeStack(() => new Vector3());
const q = makeStack(() => new Quaternion());
const m = makeStack(() => new Matrix());

function take(stack, name) {
  if (stack.top >= CAP) throw new Error('scratch ' + name + ' exhausted: missing scratchRelease?');
  return stack.items[stack.top++];
}

export const tmpV3 = () => take(v3, 'Vector3').setAll(0);
export const tmpQuat = () => take(q, 'Quaternion').set(0, 0, 0, 1);
export const tmpMat = () => take(m, 'Matrix');

/** Packed mark: three 10-bit stack heights. */
export function scratchMark() { return v3.top | (q.top << 10) | (m.top << 20); }
export function scratchRelease(mark) {
  v3.top = mark & 1023;
  q.top = (mark >> 10) & 1023;
  m.top = (mark >> 20) & 1023;
}

/** Called by the loop at frame end as a safety net; also asserts balance in dev. */
export function scratchFrameReset() {
  const leaked = v3.top + q.top + m.top;
  v3.top = 0; q.top = 0; m.top = 0;
  return leaked;
}

// Plain-number helpers used everywhere.
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate-independent exponential approach: fraction to move this frame for a given half-life. */
export const damp = (halfLife, dt) => (halfLife <= 0 ? 1 : 1 - Math.pow(2, -dt / halfLife));
/** Shortest signed angle difference a→b in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
