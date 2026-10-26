// What the Bell-mace's plunge does to the world around it (docs/mace-design.md §1, §3): the dent the
// toll stamps (scaled by the stored height), its cracks, the ring of spray and powder, the burst of
// wind that ripples the grass, the ice star's cracks and slush, the Downdraft's scour, the dunk's
// second impact, the camera and the sound. Every call is an event on the frame of an impact, never
// per frame; the terrain state and the particle sink are the ones the other weapons use.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';

/** @param {{ ts: any, fx: any, ground: any, wind?: any, sfx?: any, SFX?: any, combat: any, clock: any }} ctx */
export function createPlungeFx(ctx) {
  const { ts, fx, ground, combat, clock } = ctx;
  const wind = ctx.wind || null, sfx = ctx.sfx || null, SFX = ctx.SFX || null;
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const stamp = (x, z, dx, dz, l, w, d, c, k, wet, berm) => {
    ts.bx = x; ts.bz = z; ts.bdx = dx; ts.bdz = dz; ts.bl = l; ts.bw = w; ts.bd = d; ts.bc = c; ts.bk = k; ts.bwet = wet; ts.bbias = 0; ts.bberm = berm;
    ts.stamp();
  };

  return {
    /** The toll at (x, gy, z): `hc` the stored height (capped), `R` the toll's radius. */
    toll(x, gy, z, hc, R, P) {
      const u = hc / P.hMax;
      // The dent: a small one from a hop, the maul's crater only at the cap. Powder or turf is thrown outward and lies flat in a ring.
      stamp(x, z, 1, 0, 0, 0.6 + 0.9 * u, 0.06 + 0.44 * u, 0.7, BRUSH.PLOUGH, 0, 0.5 + 0.6 * u);
      stamp(x, z, 1, 0, 0, R * 0.9, 0.01, 0.4, BRUSH.FLATTEN, 0, 0.2);
      const cracks = hc >= 12 ? 5 : hc >= 6 ? 3 : 0;
      for (let c = 0; c < cracks; c++) {
        const a = c / cracks * Math.PI * 2 + 0.3, len = 0.6 + 1.4 * u;
        stamp(x + Math.sin(a) * len * 0.9, z + Math.cos(a) * len * 0.9, Math.sin(a), Math.cos(a), len, 0.06, 0.04 + 0.1 * u, 0.3, BRUSH.SCORE, 0, 0);
      }
      // Spray: a ring of the ground thrown up.
      const n = 10 + Math.round(26 * u);
      for (let c = 0; c < n; c++) {
        const a = c / n * Math.PI * 2 + rnd(), sp = (1.2 + 1.8 * u) * (0.5 + rnd());
        fx.ex = x + Math.sin(a) * 0.3; fx.ey = gy + 0.05; fx.ez = z + Math.cos(a) * 0.3;
        fx.evx = Math.sin(a) * sp * 1.4; fx.evz = Math.cos(a) * sp * 1.4; fx.evy = 1 + rnd() * (1.5 + 3 * u); fx.esize = 0.05 + 0.08 * rnd();
        fx.emit();
      }
      if (wind !== null) wind.burst(x, z, 0.6 + u);
      combat.pendShake += P.shake * (0.3 + u); combat.pendKick += P.kick * (0.3 + u);
      clock.hitStop = Math.max(clock.hitStop, P.stop * (0.5 + 0.5 * u));
      if (sfx !== null) {
        sfx.x = x; sfx.y = gy + 0.5; sfx.z = z; sfx.gain = 0.7 + 0.6 * u; sfx.tone = u; sfx.play(SFX.TOLL);
        if (hc >= 8) { sfx.gain = 0.6 + 0.6 * u; sfx.play(SFX.BOOM); }
      }
    },

    /** The ice star: six cracks of `len` m from (x, z) at `yaw`, slush written where the arms run. */
    star(x, z, yaw, len) {
      for (let a = 0; a < 6; a++) {
        const ang = yaw + a * Math.PI / 3, s = Math.sin(ang), c = Math.cos(ang);
        stamp(x + s * len * 0.5, z + c * len * 0.5, s, c, len * 0.5, 0.16, 0.05, 0.4, BRUSH.SCORE, 0.95, 0);
        for (let k = 0; k < 5; k++) {
          const d = len * (0.2 + 0.18 * k);
          fx.ex = x + s * d; fx.ey = ground.h + 0.08; fx.ez = z + c * d;
          fx.evx = s * 2 + (rnd() - 0.5) * 1.5; fx.evz = c * 2 + (rnd() - 0.5) * 1.5; fx.evy = 1.5 + 2 * rnd(); fx.esize = -(0.05 + 0.07 * rnd());      // negative: slush
          fx.emit();
        }
      }
    },

    /** The Downdraft scours the impact: loose powder and sand blow out of a ring. */
    scour(x, z, R) {
      stamp(x, z, 1, 0, 0, R + 1.2, 0.06, 0.4, BRUSH.STRIP, 0, 0.9);
      if (wind !== null) wind.burst(x, z, 1.8);
    },

    /** The third plunge of a frost bell: the ring freezes. */
    freeze(x, z, R) { stamp(x, z, 1, 0, 0, R, 0, 0.5, BRUSH.FREEZE, 0, 0); },

    /** A small dent and spray where a dunked body lands. */
    dunk(x, gy, z, R, P) {
      stamp(x, z, 1, 0, 0, R * 0.55, 0.28, 0.7, BRUSH.PLOUGH, 0, 0.8);
      for (let c = 0; c < 22; c++) {
        const a = rnd() * Math.PI * 2, sp = 1.5 + 2.5 * rnd();
        fx.ex = x + Math.sin(a) * 0.3; fx.ey = gy + 0.05; fx.ez = z + Math.cos(a) * 0.3;
        fx.evx = Math.sin(a) * sp; fx.evz = Math.cos(a) * sp; fx.evy = 1.2 + 3 * rnd(); fx.esize = 0.06 + 0.09 * rnd();
        fx.emit();
      }
      combat.pendShake += P.shake * 0.5; combat.pendKick += P.kick * 0.4;
      if (sfx !== null) { sfx.x = x; sfx.y = gy + 0.3; sfx.z = z; sfx.gain = 1; sfx.play(SFX.BOOM); sfx.play(SFX.CRUNCH); }
    },

    /** The Downdraft's gust straight down under the Wraith: a burst of air and powder. */
    downdraft(x, y, z) {
      for (let c = 0; c < 18; c++) {
        const a = rnd() * Math.PI * 2, r = 0.3 + 0.5 * rnd();
        fx.ex = x + Math.sin(a) * r; fx.ey = y + 0.2; fx.ez = z + Math.cos(a) * r;
        fx.evx = Math.sin(a) * 1.2; fx.evz = Math.cos(a) * 1.2; fx.evy = -6 - 4 * rnd(); fx.esize = 0.05 + 0.06 * rnd();
        fx.emit();
      }
      if (sfx !== null) { sfx.x = x; sfx.y = y; sfx.z = z; sfx.gain = 0.9; sfx.play(SFX.WHOOSH); }
    },
  };
}
