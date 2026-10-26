// The dropped marks' beacon (docs §11.7): a candle-flame with a halo, a thin column of light and
// embers rising from it, drawn as the Wraith view's world glows (additive sprites, no new pipeline).
// Sized with distance so it reads from ~30 m at night and ~10 m in daylight (the glow is pushed up
// by day, when the sky would swallow it). Allocation-free: numbers pass through the view's typed
// fields and a Float64Array, never as call arguments.

const EMBERS = 4, SLOTS = 4 + EMBERS;

/** @param {any} g  shared boot context */
export function createDropBeacon(g) {
  const v = g.wraithView, clock = g.clock;
  let lit = false;
  // q: 0 x, 1 y, 2 z (set by the owner; the embers borrow x and z, which the owner rewrites each frame), 9 camera distance (m); 3 night-and-day boost, 4 distance scale, 5 flame flicker, 6 time, 7 phase, 8 sway.
  const q = new Float64Array(10);
  /** Slot i at (q.x, q.y + up, q.z) in the flame's orange × k, size × the distance scale. */
  function put(i, up, k, size) {
    v.gi = i; v.gx = q[0]; v.gy = q[1] + up; v.gz = q[2];
    v.gr = 1.0 * k; v.gg = 0.62 * k; v.gb = 0.26 * k; v.gsize = size * q[4]; v.gon = k > 0 ? 1 : 0;
    v.worldGlow();
  }
  return {
    /** The owner writes q[0..2] (the drop's position) and q[9] (the camera's distance, m) before update(). */
    q,
    /** Per frame: `on` while a drop lies within sight. */
    update(on) {
      const x = q[0], z = q[2];
      if (!on) {
        if (lit) { lit = false; q[4] = 1; for (let i = 0; i < SLOTS; i++) put(i, 0, 0, 0.1); }
        return;
      }
      lit = true;
      const t = clock.simTime, day = 1 - (g.worldLights ? g.worldLights.night : 0);
      q[3] = 1 + day * 1.1; q[4] = 1 + q[9] * 0.07; q[6] = t;
      q[5] = 0.85 + 0.15 * Math.sin(t * 11.3) * Math.sin(t * 7.1 + 1.3);
      const b = q[3], fl = q[5];
      put(0, 0.5, 0.65 * b, 1.2);                   // halo
      put(1, 0.42, 1.4 * fl, 0.26);                 // flame
      put(2, 1.4, 0.7 * b * fl, 0.4);               // the column
      put(3, 2.6, 0.5 * b * fl, 0.34);
      for (let i = 0; i < EMBERS; i++) {
        q[7] = (t * 0.42 + i / EMBERS) % 1; q[8] = q[7] * 6.28 + i * 1.9;
        const a = Math.sin(q[7] * 3.1416) * b;
        q[0] = x + Math.sin(q[8]) * 0.32 * q[7]; q[2] = z + Math.cos(q[8]) * 0.32 * q[7];
        put(4 + i, 0.5 + q[7] * 3.2, a * 1.1, 0.07);
      }
    },
  };
}
