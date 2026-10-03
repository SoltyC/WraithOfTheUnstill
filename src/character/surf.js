// Snow-surf (BRIEF §9.3): the traversal mode the game is played in most, so it is tuned for feel.
// Pure logic over plain numbers (testable in Node, allocation-free): the capsule controller asks
// it for the horizontal velocity while it is engaged and keeps doing the vertical and ground work.
//
// Model: a heading and a speed. A crest of compressed snow pushes the Wraith forward toward a
// cruising speed; gravity along the slope adds or takes away speed; air and snow drag cap it.
// Steering asks for a turn rate; the turn is limited by how much sideways grip a carve has
// (lateral acceleration), so turning at speed is wide and weighty, and every carve bleeds a
// little speed. The carve's lateral acceleration sets the lean (into the turn) that the body,
// camera and wake read. Entering eases in from the current velocity; letting go brakes down to a
// walk before handing back, so neither end snaps.

export const surfTuning = {
  cruise: 13,           // m/s the crest pushes toward on the flat
  boost: 17,            // m/s cruise while pushing forward (W)
  push: 7.5,            // m/s² at rest, falling off toward cruise
  gravity: 9.81 * 0.85, // m/s² scale of the downhill pull (snow is not ice)
  drag: 0.011,          // 1/m: air drag (a = drag·v²)
  friction: 0.5,        // m/s² snow friction
  maxSpeed: 26,         // m/s
  brake: 9,             // m/s² holding back (S), and when letting go
  latMax: 15,           // m/s²: sideways grip of a carve
  carveDrag: 0.07,      // fraction of lateral acceleration lost as speed
  turnResponse: 7,      // 1/s: how fast the carve follows the steering
  minTurnSpeed: 4,      // m/s: below this the turn-rate limit stops tightening
  leanResponse: 9,      // 1/s
  maxLean: 0.7,         // rad
  exitSpeed: 5.2,       // m/s: when letting go, hand back to walking at this speed
};

export class Surf {
  constructor() {
    /** Engaged (the controller takes its horizontal velocity from here). */
    this.active = false;
    /** Letting go: braking down to a walk before handing back. */
    this.exiting = false;
    this.heading = 0.5 - 0.5;   // rad (yaw: 0 = +z, left-handed like the camera)
    this.speed = 0.5 - 0.5;     // m/s along the heading
    this.turnRate = 0.5 - 0.5;  // rad/s
    this.latAccel = 0.5 - 0.5;  // m/s², + = turning right
    this.lean = 0.5 - 0.5;      // rad, + = leaning right (into a right turn)
    /** 0..1 eased engagement (stance, camera, robe). */
    this.blend = 0.5 - 0.5;
    // Inputs (fields, set by the owner each frame).
    this.want = false;          // traversal held
    this.canSurf = false;       // the surface underfoot can be surfed
    this.steer = 0.5 - 0.5;     // −1..1: turn left … right (fraction of the grip limit)
    this.throttle = 0.5 - 0.5;  // −1 brake … +1 push
    this.grounded = true;
    // Outputs: horizontal velocity for the controller.
    this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5;
  }

  /**
   * Engage/disengage from the inputs and the current horizontal velocity (vx, vz) and facing.
   * Call once per controller substep before step().
   */
  engage(vx, vz, facing) {
    if (!this.active) {
      if (this.want && this.canSurf && this.grounded) {
        const s = Math.sqrt(vx * vx + vz * vz);
        this.active = true; this.exiting = false;
        this.speed = s;
        this.heading = s > 1 ? Math.atan2(vx, vz) : facing;
        this.turnRate = 0;
      }
      return;
    }
    if (!this.want || !this.canSurf) this.exiting = true;
    else if (this.want && this.canSurf) this.exiting = false;
  }

  /**
   * One substep of h seconds on ground with normal (nx, ny, nz) (y up). Writes vx/vz.
   * Ends the mode (active = false) once an exit has braked down to walking speed.
   */
  step(h, nx, ny, nz) {
    const T = surfTuning;
    const target = this.active && !this.exiting ? 1 : 0;
    this.blend += (target - this.blend) * (1 - Math.exp(-h * (target ? 6 : 4)));
    if (!this.active) { this.lean += (0 - this.lean) * (1 - Math.exp(-h * T.leanResponse)); return; }
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    let a = 0;
    if (this.grounded) {
      // The crest: pushes toward cruise (or boost when pushing forward).
      const cruise = this.throttle > 0 ? T.cruise + (T.boost - T.cruise) * this.throttle : T.cruise;
      // It also carries the drag up to cruise, so the flat settles at cruise, not below it.
      if (!this.exiting && this.throttle >= 0) {
        const sc = Math.min(this.speed, cruise);
        a += T.push * Math.max(0, 1 - this.speed / cruise) + T.drag * sc * sc + T.friction;
      }
      // Downhill along the heading: horizontal part of gravity's tangential component.
      a += T.gravity * (nx * hx + nz * hz) * ny;
      // Drag.
      a -= T.drag * this.speed * this.speed + T.friction;
      if (this.exiting || this.throttle < 0) a -= T.brake * (this.exiting ? 1 : -this.throttle);
    } else {
      a -= T.drag * this.speed * this.speed;
    }
    // Carve: steering asks for a fraction of the grip; the turn rate follows with some weight.
    const s = Math.max(this.speed, T.minTurnSpeed);
    const grip = this.grounded ? T.latMax : T.latMax * 0.15;
    const want = Math.max(-1, Math.min(1, this.steer)) * grip / s;
    this.turnRate += (want - this.turnRate) * (1 - Math.exp(-h * T.turnResponse));
    this.heading += this.turnRate * h;
    this.latAccel = this.turnRate * this.speed;
    if (this.grounded) a -= T.carveDrag * Math.abs(this.latAccel);
    this.speed = Math.min(T.maxSpeed, Math.max(0, this.speed + a * h));
    // Lean into the turn: the angle that balances the carve's sideways pull against gravity.
    const leanT = Math.max(-T.maxLean, Math.min(T.maxLean, Math.atan2(this.latAccel, 9.81)));
    this.lean += (leanT - this.lean) * (1 - Math.exp(-h * T.leanResponse));
    this.vx = Math.sin(this.heading) * this.speed;
    this.vz = Math.cos(this.heading) * this.speed;
    if (this.exiting && this.speed <= T.exitSpeed) { this.active = false; this.exiting = false; }
  }
}
