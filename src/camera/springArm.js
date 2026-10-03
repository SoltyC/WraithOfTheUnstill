// Third-person spring-arm camera (BRIEF §7) plus a free camera for dev tools and photo spots.
//
// Spring arm: an over-the-shoulder offset from a lagged pivot above the player. Zoom is eased,
// FOV widens with speed and tightens on stopping, the arm pulls in to avoid the terrain (fast
// in, slow out), and every transition is a frame-rate-independent exponential ease.
// Writes camera.position / camera.rotation directly (no setTarget) so it never allocates.

import { damp, clamp, angleDelta } from '../core/scratch.js';

export const armTuning = {
  pivotHeight: 1.45,     // above the feet
  shoulder: 0.62,        // right offset at default zoom (m)
  minDist: 2.0,
  maxDist: 16,
  defaultDist: 5.2,
  zoomStep: 0.12,        // fraction of distance per wheel notch
  zoomHalfLife: 0.09,
  lookSensitivity: 0.0022, // rad per pixel
  minPitch: -0.95,       // looking up
  maxPitch: 1.2,         // looking down
  pivotHalfLife: 0.06,   // base pivot lag
  accelLag: 0.0035,      // extra lag per m/s² of acceleration
  baseFov: 0.96,         // vertical radians (~55°)
  speedFov: 0.17,        // extra radians at fovSpeedRef
  fovSpeedRef: 14,       // m/s for full FOV widening
  fovHalfLife: 0.35,
  collisionClearance: 0.4,
  collisionInHalfLife: 0.025,
  collisionOutHalfLife: 0.3,
  freeSpeed: 18,
  freeFastMul: 5,
};

export class SpringArmCamera {
  /**
   * @param {import('@babylonjs/core').TargetCamera} camera
   * @param {import('../character/capsuleController.js').Ground} ground
   */
  constructor(camera, ground) {
    this.camera = camera;
    this.ground = ground;
    this.yaw = 0;
    this.pitch = 0.28;
    this.zoomTarget = armTuning.defaultDist;
    this.zoom = armTuning.defaultDist;
    this.armLen = armTuning.defaultDist; // after collision
    this.fov = armTuning.baseFov;
    this.pivot = { x: 0, y: 0, z: 0 };
    this.prevVel = { x: 0, y: 0, z: 0 };
    this.free = false;
    this.freePos = { x: 0, y: 0, z: 0 };
    /** When true the free camera holds an explicit pose (photo spot) until the user moves it. */
    this.hold = false;
    /** Frame dt in seconds, set by the owner before update(). */
    this.dt = 0.5;
    /** Camera bank (rad) and extra FOV (rad) set by the owner (surf carves), eased here. */
    this.rollTarget = 0.5 - 0.5; this.roll = 0.5 - 0.5;
    this.extraFov = 0.5 - 0.5;
    /** Shake (BRIEF §7: heavy spells and hard carves only): owner sets shakeHold (sustained, rad)
     *  each frame and adds impulses to shake; both ease out. */
    this.shake = 0.5 - 0.5; this.shakeHold = 0.5 - 0.5; this._shakeT = 0.5 - 0.5;
    /** Optional solid besides the terrain (the Warden): fields qx/qy/qz, probe() → inside. */
    this.occluder = null;
    /** Pivot offset target (owner, e.g. out from a climbed surface), eased here. */
    this.pushX = 0.5 - 0.5; this.pushY = 0.5 - 0.5; this.pushZ = 0.5 - 0.5;
    this._px = 0.5 - 0.5; this._py = 0.5 - 0.5; this._pz = 0.5 - 0.5;
    this._snapped = false;
  }

  /** Mouse look and zoom input (pixels, wheel notches). */
  look(dx, dy, wheel) {
    const T = armTuning;
    if (dx !== 0 || dy !== 0) this.hold = false;
    this.yaw += dx * T.lookSensitivity;
    this.pitch = clamp(this.pitch + dy * T.lookSensitivity, T.minPitch, T.maxPitch);
    if (wheel !== 0) this.zoomTarget = clamp(this.zoomTarget * (1 + wheel * T.zoomStep), T.minDist, T.maxDist);
  }

  /** Place the pivot and all eased state at their targets (captures, teleports). */
  snap(target) {
    this._px = this.pushX; this._py = this.pushY; this._pz = this.pushZ;
    this.pivot.x = target.x + this._px; this.pivot.y = target.y + armTuning.pivotHeight + this._py; this.pivot.z = target.z + this._pz;
    this._snapped = true;
    this.zoom = this.zoomTarget;
    this.armLen = this.zoomTarget;
    this.fov = armTuning.baseFov;
    this.prevVel.x = 0; this.prevVel.y = 0; this.prevVel.z = 0;
  }

  /** Enter free camera at an explicit pose (yaw/pitch in radians, fov vertical radians). */
  setPose(x, y, z, yaw, pitch, fov) {
    this.free = true;
    this.hold = true;
    this.freePos.x = x; this.freePos.y = y; this.freePos.z = z;
    this.yaw = yaw; this.pitch = pitch;
    this.fov = fov;
    this._apply(x, y, z);
  }

  setFree(on) {
    if (on && !this.free) {
      const c = this.camera.position;
      this.freePos.x = c.x; this.freePos.y = c.y; this.freePos.z = c.z;
    }
    this.free = on;
    this.hold = false;
  }

  /**
   * Advance by `this.dt` (set by the caller; doubles are never passed as arguments in hot code).
   * @param {{x:number,y:number,z:number}} feet  player foot position
   * @param {{x:number,y:number,z:number}} vel   player velocity
   * @param {number} moveX  free-cam strafe input
   * @param {number} moveZ  free-cam forward input
   * @param {number} moveY  free-cam vertical input
   * @param {boolean} fast
   */
  update(feet, vel, moveX, moveZ, moveY, fast) {
    const dt = this.dt;
    if (this.free) { this._updateFree(moveX, moveZ, moveY, fast); return; }
    const T = armTuning;

    // Pivot lag grows with acceleration so starts and stops read with weight.
    let accel = 0;
    if (dt > 0) {
      const ax = (vel.x - this.prevVel.x) / dt, ay = (vel.y - this.prevVel.y) / dt, az = (vel.z - this.prevVel.z) / dt;
      accel = Math.sqrt(ax * ax + ay * ay + az * az);
    }
    this.prevVel.x = vel.x; this.prevVel.y = vel.y; this.prevVel.z = vel.z;
    const k = damp(T.pivotHalfLife + Math.min(accel, 60) * T.accelLag, dt);
    const kp = damp(0.25, dt);
    this._px += (this.pushX - this._px) * kp; this._py += (this.pushY - this._py) * kp; this._pz += (this.pushZ - this._pz) * kp;
    this.pivot.x += (feet.x + this._px - this.pivot.x) * k;
    this.pivot.y += (feet.y + T.pivotHeight + this._py - this.pivot.y) * k;
    this.pivot.z += (feet.z + this._pz - this.pivot.z) * k;

    this.zoom += (this.zoomTarget - this.zoom) * damp(T.zoomHalfLife, dt);
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const fovTarget = T.baseFov + T.speedFov * clamp(speed / T.fovSpeedRef, 0, 1) + this.extraFov;
    this.roll += (this.rollTarget - this.roll) * damp(0.12, dt);
    this.shake = Math.max(this.shakeHold, this.shake * Math.exp(-dt * 7));
    this._shakeT += dt;
    this.fov += (fovTarget - this.fov) * damp(T.fovHalfLife, dt);

    // Arm direction (from pivot toward camera) and shoulder offset (camera right).
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const bx = -sy * cp, by = sp, bz = -cy * cp;
    const shoulder = T.shoulder * clamp(this.zoom / T.defaultDist, 0.6, 1.4);
    const ox = this.pivot.x + cy * shoulder, oy = this.pivot.y, oz = this.pivot.z - sy * shoulder;

    // Terrain collision: march the arm and keep the first safe length.
    const g = this.ground;
    let safe = this.zoom;
    const steps = 16, oc = this.occluder;
    // The occluder only blocks once the arm has been outside it (a pivot inside it is ignored).
    let out = false;
    for (let i = 1; i <= steps; i++) {
      const d = (this.zoom * i) / steps;
      const x = ox + bx * d, y = oy + by * d, z = oz + bz * d;
      g.qx = x; g.qz = z; g.sample();
      if (y < g.h + T.collisionClearance) { safe = Math.max(T.minDist * 0.4, (this.zoom * (i - 1)) / steps); break; }
      if (oc !== null) {
        oc.qx = x; oc.qy = y; oc.qz = z;
        const inside = oc.probe();
        if (!inside) out = true;
        else if (out) { safe = Math.max(T.minDist * 0.4, (this.zoom * (i - 1)) / steps); break; }
      }
    }
    const hl = safe < this.armLen ? T.collisionInHalfLife : T.collisionOutHalfLife;
    this.armLen += (safe - this.armLen) * damp(hl, dt);
    if (this._snapped) { this.armLen = safe; this._snapped = false; }

    let x = ox + bx * this.armLen, y = oy + by * this.armLen, z = oz + bz * this.armLen;
    g.qx = x; g.qz = z; g.sample();
    const gy = g.h + T.collisionClearance * 0.5;
    if (y < gy) y = gy;
    this._apply(x, y, z);
  }

  _updateFree(mx, mz, my, fast) {
    const dt = this.dt;
    if (this.hold && mx === 0 && mz === 0 && my === 0) { this._apply(this.freePos.x, this.freePos.y, this.freePos.z); return; }
    if (mx !== 0 || mz !== 0 || my !== 0) this.hold = false;
    const s = armTuning.freeSpeed * (fast ? armTuning.freeFastMul : 1) * dt;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const f = this.freePos;
    f.x += (sy * cp * mz + cy * mx) * s;
    f.y += (-sp * mz + my) * s;
    f.z += (cy * cp * mz - sy * mx) * s;
    this._apply(f.x, f.y, f.z);
  }

  _apply(x, y, z) {
    const c = this.camera;
    c.position.set(x, y, z);
    if (this.free || this.shake < 1e-5) { c.rotation.set(this.pitch, this.yaw, this.free ? 0 : this.roll); }
    else {
      // Smooth noise (incommensurate sines), not a per-frame jitter.
      const t = this._shakeT, a = this.shake;
      c.rotation.set(this.pitch + a * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 61.7 + 1.3)) * 0.6,
        this.yaw + a * (Math.sin(t * 29.3 + 2.1) + 0.5 * Math.sin(t * 53.9)) * 0.6,
        this.roll + a * 0.4 * Math.sin(t * 43.7 + 0.7));
    }
    c.fov = this.fov;
  }

  /** Smallest turn toward a yaw (used when re-attaching to the player). */
  faceYaw(yaw) { this.yaw += angleDelta(this.yaw, yaw); }
}
