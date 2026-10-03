// The Warden's release (BRIEF §8.4, the Phase 5 showpiece): a cinematic camera that takes over
// when the last joint breaks — it swings out from where the player was looking into a slow,
// rising orbit around the colossus as it glows, exhales its wave of wind and powder and lies
// down into the land; letterboxed; any of Jump / Interact / Pause skips it. Plain fields in,
// one pose out per frame (allocation-free).

export const releaseCamTuning = {
  duration: 14,
  radius: 44,        // orbit radius at the settle (m)
  radiusWave: 58,    // pulled back as the wave rolls out
  height: 7,         // above the ground at the start (m), rising
  rise: 0.45,        // m/s
  orbit: 0.055,      // rad/s
  fov: 0.72,
};

export function createReleaseCam() {
  return {
    active: false, played: false, t: 0.5 - 0.5,
    /** Inputs: real dt, target (the Warden's middle), ground height under the camera (sampled
     *  by the owner from the last pose), and skip. */
    dt: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, groundY: 0.5, skip: false,
    /** Outputs: camera pose. */
    x: 0.5, y: 0.5, z: 0.5, yaw: 0.5, pitch: 0.5, fov: 0.5,
    /** 0..1 letterbox. */
    bars: 0.5 - 0.5,
    /** Held (a photo spot of the release): keep the bars. */
    hold: false,
    _a0: 0.5, _r0: 0.5, _y0: 0.5,

    /** Start from the current camera position (fields x, y, z). */
    start() {
      this.active = true; this.played = true; this.t = 0;
      this._a0 = Math.atan2(this.x - this.tx, this.z - this.tz);
      this._r0 = Math.hypot(this.x - this.tx, this.z - this.tz);
      this._y0 = this.y;
    },
    update() {
      if (!this.active) { if (!this.hold) this.bars = Math.max(0, this.bars - this.dt * 1.5); return; }
      const T = releaseCamTuning;
      this.t += this.dt;
      const t = this.t;
      if (this.skip || t >= T.duration) { this.active = false; return; }
      this.bars = Math.min(1, this.bars + this.dt * 1.2);
      // Swing out over the first 2.5 s from the player's view into the orbit.
      const k = Math.min(1, t / 2.5), e = k * k * (3 - 2 * k);
      const wave = Math.max(0, Math.min(1, (t - 3) / 2)) * Math.max(0, Math.min(1, (9 - t) / 4));
      const R = this._r0 + (T.radius + (T.radiusWave - T.radius) * wave - this._r0) * e;
      const a = this._a0 + T.orbit * t + 0.35 * e;
      this.x = this.tx + Math.sin(a) * R;
      this.z = this.tz + Math.cos(a) * R;
      const yOrbit = this.groundY + T.height + T.rise * t;
      this.y = Math.max(this._y0 + (yOrbit - this._y0) * e, this.groundY + 1.5);
      const dx = this.tx - this.x, dy = this.ty - this.y, dz = this.tz - this.z;
      this.yaw = Math.atan2(dx, dz);
      this.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
      this.fov = T.fov;
    },
  };
}
