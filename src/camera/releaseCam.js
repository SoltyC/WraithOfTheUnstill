// The Warden's release (BRIEF §8.4, the Phase 5 showpiece), directed as three shots keyed to the
// release timeline (game/warden/warden.js RELEASE_T):
//   A  the rearing — low behind the Wraith, looking up at the Warden as light floods it and it
//      rears, pushing in slowly;
//   B  the wave — a hard cut on the slam to a low side-on camera beside the Wraith, so the
//      shockwave's wall of powder rolls in and throws the Wraith tumbling across the frame;
//   C  the land — a long crane up and back from the Wraith lying in the snow to the Warden lain
//      down into the steppe, as the wind and the light come back.
// Letterboxed; Jump / Interact skip it. Plain fields in, one pose out per frame (allocation-free).

import { RELEASE_T } from '../game/warden/warden.js';

export const releaseCamTuning = {
  end: 17,          // warden-time (s) the cinematic ends
  fov: 0.72,
  fovWave: 0.86,    // wider for the wave
};

const A = 1, B = 2, C = 3;

/** @param {{ qx: number, qz: number, h: number, sample: () => void }} ground */
export function createReleaseCam(ground) {
  const T = releaseCamTuning;
  return {
    active: false, played: false, shot: 0,
    /** Inputs: dt (real), warden time wt, Warden middle (tx, ty, tz) and head (hx, hy, hz), the
     *  Wraith's pelvis (px, py, pz), the warden time it was hit (hitT, −1 not yet), skip. */
    dt: 0.5, wt: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, hx: 0.5, hy: 0.5, hz: 0.5, px: 0.5, py: 0.5, pz: 0.5,
    hitT: -1.5 + 0.5, skip: false,
    /** Outputs: camera pose; 0..1 letterbox. */
    x: 0.5, y: 0.5, z: 0.5, yaw: 0.5, pitch: 0.5, fov: 0.5, bars: 0.5 - 0.5,
    /** Held (a photo spot of the release): keep the bars. */
    hold: false,
    // Shot frame: away-from-Warden (bx, bz), side (sx, sz), anchors.
    _bx: 0.5, _bz: 0.5, _sx: 0.5, _sz: 0.5, _ax: 0.5, _ay: 0.5, _az: 0.5, _cx: 0.5, _cy: 0.5, _cz: 0.5, _t0: 0.5,

    start() {
      this.active = true; this.played = true; this.shot = 0;
      let bx = this.px - this.tx, bz = this.pz - this.tz;
      const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      this._bx = bx; this._bz = bz; this._sx = bz; this._sz = -bx;
    },
    update() {
      if (!this.active) { if (!this.hold) this.bars = Math.max(0, this.bars - this.dt * 1.5); return; }
      if (this.skip || this.wt >= T.end) { this.active = false; return; }
      this.bars = Math.min(1, this.bars + this.dt * 1.6);
      const wt = this.wt, bx = this._bx, bz = this._bz, sx = this._sx, sz = this._sz;
      const bEnd = this.hitT > 0 ? this.hitT + 2.4 : RELEASE_T.impact + 3.5;
      const shot = wt < RELEASE_T.impact ? A : wt < bEnd ? B : C;
      let ax, ay, az, cx, cy, cz;
      if (shot === A) {
        // Low behind the Wraith, a little to the side, looking up at the rearing head.
        const k = Math.min(1, wt / RELEASE_T.impact);
        cx = this.px + bx * (10 - 1.5 * k) - sx * 3.5; cz = this.pz + bz * (10 - 1.5 * k) - sz * 3.5;
        cy = this.py + 0.4 + 0.3 * k;
        // Framing the Wraith small in the foreground under the rearing head.
        ax = this.px + (this.hx - this.px) * 0.6; ay = this.py + (this.hy - this.py) * 0.42; az = this.pz + (this.hz - this.pz) * 0.6;
        this.fov = T.fov;
      } else if (shot === B) {
        if (this.shot !== B) {
          // Hard cut on the slam: the camera is placed once, beside where the Wraith stands.
          this._cx = this.px + sx * 8 + bx * 3.5; this._cz = this.pz + sz * 8 + bz * 3.5; this._cy = this.py + 0.6;
        }
        cx = this._cx; cy = this._cy; cz = this._cz;
        if (this.hitT > 0) { ax = this.px; ay = this.py; az = this.pz; }
        else { ax = this.px - bx * 5; ay = this.py + 0.6; az = this.pz - bz * 5; }
        this.fov = T.fovWave;
      } else {
        if (this.shot !== C) {
          this._ax = this.x; this._ay = this.y; this._az = this.z; this._t0 = wt;
        }
        // Crane: up and back from the Wraith in the snow to the Warden lain down in the land.
        const u = Math.min(1, (wt - this._t0) / 9), e = u * u * (3 - 2 * u);
        const ex = this.px + bx * 24 + sx * 12, ez = this.pz + bz * 24 + sz * 12, ey = this.py + 15;
        cx = this._ax + (ex - this._ax) * e; cy = this._ay + (ey - this._ay) * e; cz = this._az + (ez - this._az) * e;
        const w = 0.25 + 0.6 * e;
        ax = this.px + (this.tx - this.px) * w; ay = this.py + (this.ty - this.py) * w; az = this.pz + (this.tz - this.pz) * w;
        this.fov = T.fov + (T.fovWave - T.fov) * (1 - e);
      }
      this.shot = shot;
      ground.qx = cx; ground.qz = cz; ground.sample();
      if (cy < ground.h + 0.5) cy = ground.h + 0.5;
      this.x = cx; this.y = cy; this.z = cz;
      const dx = ax - cx, dy = ay - cy, dz = az - cz;
      this.yaw = Math.atan2(dx, dz);
      this.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
    },
  };
}
