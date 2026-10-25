// Death (docs §11.7): the Wraith re-forms at the last shrine and its carried marks stay where it fell,
// marked by its robe's imprint. Walking there takes them back; dying again first loses them (the new
// drop, of whatever was earned since, replaces the old). Weapons and items are never lost.
// Pure logic; systems/economy.js owns where, the terrain stamp and the light.

export const DROP = { reach: 2.6 };

export function createDrop() {
  const self = {
    /** The marks lying in the world, and where; marks 0 = none. */
    marks: 0, x: 0.5 - 0.5, z: 0.5 - 0.5,
    /** Marks lost to a second death, over this save (telemetry). */
    lost: 0,
    get active() { return self.marks > 0; },
    /** The Wraith died at (x, z) carrying `inv.marks`: they fall there; a drop not yet recovered is lost. Returns the marks dropped. */
    die(inv, x, z) {
      self.lost += self.marks;
      self.marks = inv.marks; self.x = x; self.z = z;
      if (inv.marks > 0) { inv.marks = 0; inv.version++; }
      return self.marks;
    },
    /** Per frame while alive: close enough takes them back. Returns the marks recovered (0 mostly). */
    recover(inv, px, pz) {
      if (self.marks === 0) return 0;
      const dx = px - self.x, dz = pz - self.z;
      if (dx * dx + dz * dz > DROP.reach * DROP.reach) return 0;
      const n = self.marks; self.marks = 0; inv.addMarks(n);
      return n;
    },
    serialize() { return self.marks > 0 ? { marks: self.marks, x: self.x, z: self.z } : null; },
    restore(s) {
      if (s && s.marks > 0 && Number.isFinite(s.x) && Number.isFinite(s.z)) { self.marks = Math.floor(s.marks); self.x = s.x; self.z = s.z; } else self.marks = 0;
    },
  };
  return self;
}
