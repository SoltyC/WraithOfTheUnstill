// Kinematic capsule controller on a heightfield (BRIEF §3: custom heightfield controller).
// Pure logic over plain {x,y,z} objects so it is testable in Node. Camera-relative input,
// eased acceleration, slope limit with sliding, jump, ground snapping, fixed substeps.
//
// `pos` is the capsule's foot point (bottom of the capsule, on the ground when grounded).

/**
 * Ground query interface (see world/patchGround.js and DECISIONS.md for why it uses fields, not arguments):
 * set qx/qz, call sample() → h, or sampleNormal() → nx/ny/nz.
 * @typedef {{ qx: number, qz: number, h: number, nx: number, ny: number, nz: number, sample: () => void, sampleNormal: () => void }} Ground
 */

import { Surf } from './surf.js';

export const controllerTuning = {
  walkSpeed: 5.2,       // m/s on flat ground
  accel: 26,            // m/s² toward the wish velocity
  decel: 30,            // m/s² when there is no input
  airControl: 0.25,     // fraction of accel available in the air
  gravity: 24,          // m/s²
  jumpSpeed: 7.2,       // m/s initial vertical
  maxSlopeCos: Math.cos((46 * Math.PI) / 180),
  slideAccel: 14,       // m/s² down steep slopes
  snapDistance: 0.45,   // metres below the feet that still count as ground
  turnHalfLife: 0.07,   // s, facing smoothing
  substep: 1 / 120,
  godSpeed: 40,         // m/s in god mode
};

export class CapsuleController {
  /** @param {Ground} ground */
  constructor(ground) {
    this.ground = ground;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    /** Facing yaw (radians), eased toward the movement direction. */
    this.yaw = 0;
    this.grounded = false;
    /** God mode: no gravity or collision, flies along the wish direction. */
    this.god = false;
    /** While true the controller does nothing (e.g. waiting for collision data after a teleport). */
    this.hold = false;
    // Inputs set each frame by the owner.
    this.wishX = 0; // camera-relative strafe [-1, 1]
    this.wishZ = 0; // camera-relative forward [-1, 1]
    this.wishUp = 0;
    this.cameraYaw = 0;
    this.jumpRequested = false;
    this._acc = 0.5 - 0.5;
    /** Frame dt in seconds, set by the owner before update(). */
    this.dt = 0.5;
    /** Ground normal under the feet (scratch). */
    this._n = { x: 0.5, y: 0.5, z: 0.5 };
    this._wx = 0.5; this._wz = 0.5; this._wl = 0.5;
    /** True while a script (photo-spot run) drives the controller instead of player input. */
    this.scripted = false;
    /** Snow-surf (traversal): the owner sets surf.want / canSurf / steer / throttle. */
    this.surf = new Surf();
  }

  teleport(x, z, y) {
    this.pos.x = x; this.pos.z = z;
    if (y === undefined) { this.ground.qx = x; this.ground.qz = z; this.ground.sample(); y = this.ground.h; }
    this.pos.y = y;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.grounded = true;
  }

  /** Advance by `this.dt` (set by the caller; a field, not an argument, so no boxing). */
  update() {
    if (this.hold) { this._acc = 0; return; }
    this._acc += this.dt;
    const h = controllerTuning.substep;
    let steps = 0;
    // _step takes no arguments: doubles passed to a non-inlined call are boxed (allocation).
    while (this._acc >= h && steps < 12) { this._step(); this._acc -= h; steps++; }
    if (steps === 12) this._acc = 0; // drop backlog after a long stall rather than spiral
  }

  _step() {
    const T = controllerTuning;
    const h = T.substep;
    const p = this.pos, v = this.vel;
    // World-space wish direction from camera yaw (left-handed: yaw 0 looks down +z).
    const sy = Math.sin(this.cameraYaw), cy = Math.cos(this.cameraYaw);
    let wx = this.wishZ * sy + this.wishX * cy;
    let wz = this.wishZ * cy - this.wishX * sy;
    const wl = Math.sqrt(wx * wx + wz * wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    if (this.god) {
      v.x = wx * T.godSpeed; v.z = wz * T.godSpeed; v.y = this.wishUp * T.godSpeed;
      p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
      this.grounded = false;
      this._wx = wx; this._wz = wz; this._wl = wl;
      this._face();
      return;
    }

    const g = this.ground;
    g.qx = p.x; g.qz = p.z;
    g.sampleNormal();
    const n = this._n;
    n.x = g.nx; n.y = g.ny; n.z = g.nz;
    const steep = n.y < T.maxSlopeCos;

    // Surfing: the surf model owns the horizontal velocity and the facing.
    const sf = this.surf;
    sf.grounded = this.grounded;
    sf.engage(v.x, v.z, this.yaw);
    sf.step(h, n.x, n.y, n.z);
    const surfing = sf.active;
    if (surfing) {
      v.x = sf.vx; v.z = sf.vz;
      this.yaw = sf.heading;
    } else {
      // Horizontal acceleration toward wish velocity.
      const tx = wx * T.walkSpeed, tz = wz * T.walkSpeed;
      const control = this.grounded ? 1 : T.airControl;
      const rate = (wl > 0.01 ? T.accel : T.decel) * control;
      let dx = tx - v.x, dz = tz - v.z;
      const dl = Math.sqrt(dx * dx + dz * dz);
      const maxDv = rate * h;
      if (dl > maxDv) { dx *= maxDv / dl; dz *= maxDv / dl; }
      v.x += dx; v.z += dz;
    }

    if (this.grounded && steep && !surfing) {
      // Slide down the fall line; no climbing steep faces.
      v.x += n.x * T.slideAccel * h;
      v.z += n.z * T.slideAccel * h;
      const into = v.x * -n.x + v.z * -n.z;
      if (into > 0) { v.x += n.x * into; v.z += n.z * into; }
    }

    if (this.grounded && this.jumpRequested && !steep) {
      v.y = T.jumpSpeed;
      this.grounded = false;
    }
    this.jumpRequested = false;

    if (!this.grounded) v.y -= T.gravity * h;

    p.x += v.x * h;
    p.z += v.z * h;
    p.y += v.y * h;

    g.qx = p.x; g.qz = p.z;
    g.sample();
    const gy = g.h;
    if (this.grounded) {
      // Stay glued to the ground over crests unless the drop exceeds snap distance.
      if (p.y - gy <= T.snapDistance) { p.y = gy; v.y = 0; }
      else this.grounded = false;
    } else if (p.y <= gy) {
      p.y = gy;
      v.y = 0;
      this.grounded = true;
    }
    if (gy !== gy) throw new Error('heightfield returned NaN');
    this._wx = wx; this._wz = wz; this._wl = wl;
    if (!surfing) this._face();
  }

  /** Ease facing toward the wish direction stored in _wx/_wz/_wl (fields, not args: see _step). */
  _face() {
    const wx = this._wx, wz = this._wz, wl = this._wl, h = controllerTuning.substep;
    if (wl < 0.05) return;
    const target = Math.atan2(wx, wz);
    let d = (target - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.pow(2, -h / controllerTuning.turnHalfLife));
  }
}
