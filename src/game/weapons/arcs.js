// Hit geometry for swings (docs §4, §11.2): a swept wedge in the ground plane, from the swing's
// angle a few frames ago to now, against the discs of a Shaped body's spine. Angles are measured
// from the facing, positive to the right (the pose's phi + twist), so the wedge the hit code tests
// is exactly the arc the staff, blade or maul is seen to cut. Fields in, bool out: nothing is
// passed as a double argument (DECISIONS.md, the hot-path convention).

const TAU = Math.PI * 2;

export const arc = {
  /** The swinger (world x, z), its facing (rad), the wedge (angles from the facing) and the annulus (m). */
  px: 0.5, pz: 0.5, yaw: 0.5 - 0.5, a0: 0.5 - 0.5, a1: 0.5 - 0.5, inner: 0.5 - 0.5, reach: 0.5,
  /** The target disc. */
  cx: 0.5, cz: 0.5, r: 0.5,
  /** Out: the distance to the target's centre and its bearing from the facing (for knock direction). */
  dist: 0.5, bearing: 0.5 - 0.5,

  /** Does the target disc touch the wedge × annulus? */
  test() {
    const dx = this.cx - this.px, dz = this.cz - this.pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    this.dist = d;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.bearing = Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz);
    if (d - this.r > this.reach || d + this.r < this.inner) return false;
    if (d <= this.r) return true;                                   // the Wraith stands inside it
    const hw = Math.asin(Math.min(1, this.r / d));
    const lo = Math.min(this.a0, this.a1) - hw, hi = Math.max(this.a0, this.a1) + hw;
    if (hi - lo >= TAU) return true;
    const b = this.bearing;
    return (b >= lo && b <= hi) || (b + TAU >= lo && b + TAU <= hi) || (b - TAU >= lo && b - TAU <= hi);
  },
};

/** Radius of a Shaped's body disc: its girth plus a hand. */
export function bodyRadius(arch) {
  const sh = arch.shape, g = (arch.rig && arch.rig.girth) || 0.44;
  return sh.hip * g * 0.9 + 0.1;
}
