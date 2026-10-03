// Knockdown (the Warden's shockwave): the Wraith is lifted and thrown back, tumbling onto its
// back, slides through the snow, lies there while the owner holds it down (the release
// cinematic), then gets up. It owns the Wraith's position while active (the owner holds the
// controller) and outputs a body frame for the pose override — the same path the climb uses:
// right r, up u (pelvis → head), forward f (chest). Allocation-free; inputs and outputs are
// fields (no doubles passed as arguments).

export const knockTuning = {
  speed: 10,        // m/s thrown back
  up: 6,            // m/s lifted
  gravity: 16,
  friction: 3.2,    // 1/s sliding on the back through snow
  lieHeight: 0.22,  // m: pelvis above the snow, lying
  standHeight: 0.85, // m: pelvis above the feet, standing (as the climb's hand-off)
  minDown: 1.1,     // s lying before it may get up
  riseTime: 1.35,   // s getting up
};

const FLY = 1, DOWN = 2, RISE = 3;

/** @param {{ qx: number, qz: number, h: number, sample: () => void }} ground */
export function createKnockdown(ground) {
  const T = knockTuning;
  return {
    active: false, phase: 0, t: 0.5 - 0.5,
    /** Pelvis (world) and velocity. */
    x: 0.5, y: 0.5, z: 0.5, vx: 0.5 - 0.5, vy: 0.5 - 0.5, vz: 0.5 - 0.5,
    /** Thrown direction (unit, horizontal) and the fall angle (0 upright … π/2 on its back). */
    dx: 1.5 - 0.5, dz: 0.5 - 0.5, theta: 0.5 - 0.5,
    /** Body frame out. */
    rx: 0.5, ry: 0.5, rz: 0.5, ux: 0.5, uy: 0.5, uz: 0.5, fx: 0.5, fy: 0.5, fz: 0.5,
    /** Feet (for the controller) out. */
    footX: 0.5, footY: 0.5, footZ: 0.5,
    /** True while sliding on the snow (the owner ploughs a groove). */
    sliding: false,
    /** Inputs: dt; hold it down (cinematic); hit: start feet (hx, hy, hz) and direction (hdx, hdz). */
    dt: 0.5, hold: false, hx: 0.5, hy: 0.5, hz: 0.5, hdx: 1.5 - 0.5, hdz: 0.5 - 0.5,
    /** Landing this frame (owner: puff of snow, a thump). */
    landed: false,

    hit() {
      const l = Math.hypot(this.hdx, this.hdz) || 1;
      this.dx = this.hdx / l; this.dz = this.hdz / l;
      this.x = this.hx; this.y = this.hy + T.standHeight; this.z = this.hz;
      this.vx = this.dx * T.speed; this.vz = this.dz * T.speed; this.vy = T.up;
      this.theta = 0; this.t = 0; this.phase = FLY; this.active = true;
      this._frame();
    },
    /** Straight back to standing (skipped cinematic). */
    reset() {
      if (!this.active) return;
      ground.qx = this.x; ground.qz = this.z; ground.sample();
      this.theta = 0; this.y = ground.h + T.standHeight; this.phase = 0; this.active = false; this.sliding = false;
      this._frame();
    },
    update() {
      this.landed = false; this.sliding = false;
      if (!this.active) return;
      const dt = this.dt;
      this.t += dt;
      ground.qx = this.x; ground.qz = this.z; ground.sample();
      const gy = ground.h;
      if (this.phase === FLY) {
        this.vy -= T.gravity * dt;
        this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
        // Tumbling back onto its back over the flight.
        this.theta += (Math.PI * 0.5 - this.theta) * Math.min(1, dt * 4.5);
        if (this.y <= gy + T.lieHeight && this.vy < 0) {
          this.y = gy + T.lieHeight;
          if (this.vy < -5) { this.vy = -this.vy * 0.22; this.landed = true; }
          else { this.vy = 0; this.phase = DOWN; this.t = 0; this.landed = true; }
        }
      } else if (this.phase === DOWN) {
        // Sliding on its back, then still.
        const k = Math.exp(-T.friction * dt);
        this.vx *= k; this.vz *= k;
        this.x += this.vx * dt; this.z += this.vz * dt;
        ground.qx = this.x; ground.qz = this.z; ground.sample();
        this.y = ground.h + T.lieHeight;
        this.theta += (Math.PI * 0.5 - this.theta) * Math.min(1, dt * 8);
        this.sliding = Math.hypot(this.vx, this.vz) > 0.6;
        if (!this.hold && this.t > T.minDown) { this.phase = RISE; this.t = 0; }
      } else {
        // Getting up: sits up, gathers the legs, stands.
        const u = Math.min(1, this.t / T.riseTime), e = u * u * (3 - 2 * u);
        this.theta = Math.PI * 0.5 * (1 - e);
        this.y = gy + T.lieHeight + (T.standHeight - T.lieHeight) * e;
        if (u >= 1) { this.active = false; this.phase = 0; }
      }
      this._frame();
    },
    _frame() {
      // Facing back toward where it came from (f0 = −d); falling back rotates up toward d.
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      this.ux = this.dx * s; this.uy = c; this.uz = this.dz * s;
      this.fx = -this.dx * c; this.fy = s; this.fz = -this.dz * c;
      // r = u × f
      this.rx = this.uy * this.fz - this.uz * this.fy;
      this.ry = this.uz * this.fx - this.ux * this.fz;
      this.rz = this.ux * this.fy - this.uy * this.fx;
      this.footX = this.x - this.ux * T.standHeight; this.footY = this.y - this.uy * T.standHeight; this.footZ = this.z - this.uz * T.standHeight;
    },
  };
}
