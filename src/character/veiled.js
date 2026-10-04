// The Veiled (BRIEF §8.2): pilgrims built from the Wraith's own robe system with parameter
// variations — size, posture, dye, what they carry — so each reads by silhouette. Faces stay in the
// hood's darkness; no cowl light (that is the Wraith's alone).

/** Archetypes: scale (of the Wraith), standing hunch (rad), breath depth (rad), robe dye (rgb
 *  multiplier on the charcoal wool), a carried light (lantern), idle restlessness (s between
 *  posture shifts). */
export const ARCHETYPES = {
  staff: { scale: 1.1, hunch: 0.04, breath: 0.012, tint: [1.75, 1.45, 1.1], shift: [7, 13] },
  elder: { scale: 0.9, hunch: 0.42, breath: 0.02, tint: [1.45, 1.38, 1.5], shift: [10, 18] },
  child: { scale: 0.62, hunch: 0, breath: 0.016, tint: [2.3, 1.6, 0.85], shift: [3, 7] },
  lantern: { scale: 0.98, hunch: 0.08, breath: 0.012, tint: [0.95, 1.25, 2.1], shift: [8, 14], lantern: true },
  monk: { scale: 1.0, hunch: 0.14, breath: 0.01, tint: [2.4, 1.05, 0.95], shift: [12, 20] },
  pilgrim: { scale: 0.96, hunch: 0.1, breath: 0.012, tint: [1.5, 1.5, 1.4], shift: [9, 15] },
};

/**
 * The scaled world a Veiled's simulation runs in: positions map p_sim = o + (p_world − o)/s, and
 * heights the same way, so the figure (built at the Wraith's size) stands at size s on real ground.
 * @param {{ qx: number, qz: number, h: number, sample: () => void }} ground
 */
export function scaledGround(ground, xf, solids = null) {
  return {
    qx: 0.5, qz: 0.5, h: 0.5,
    sample() {
      const x = xf.ox + (this.qx - xf.ox) * xf.s, z = xf.oz + (this.qz - xf.oz) * xf.s;
      ground.qx = x; ground.qz = z;
      ground.sample();
      let h = ground.h;
      // Built floors (plinths) are ground too.
      if (solids !== null) { solids.qx = x; solids.qz = z; solids.qh = h; solids.floorAnyQ(); h = solids.h; }
      this.h = xf.oy + (h - xf.oy) / xf.s;
    },
  };
}

/** World → simulation space (in place on a 3-array-like {x, y, z} via out). */
export function toSim(xf, x, y, z, out) {
  out[0] = xf.ox + (x - xf.ox) / xf.s; out[1] = xf.oy + (y - xf.oy) / xf.s; out[2] = xf.oz + (z - xf.oz) / xf.s;
  return out;
}
