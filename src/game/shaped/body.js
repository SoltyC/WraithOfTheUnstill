// The Shaped (BRIEF §8.3): a procedural skeleton — a spine that follows the head's path like a
// rope (so turns curve through the body), legs that plan their steps in alternating groups with
// planted feet locked to the ground (no sliding), two-bone knees, a tail — driven by an AI that
// sets a desired velocity. Pure logic over typed arrays (Node-testable, allocation-free per
// frame). The renderer hangs clusters of material chunks on these bones; footfalls are events.

/**
 * @typedef {{
 *   spine: number, spacing: number, hip: number,          // spine joints, spacing (m), hip height (m)
 *   legs: { at: number, side: number, upper: number, lower: number, reach: number, kneeBack: boolean, group: number }[],
 *   tail: number, tailSpacing: number, headUp: number,
 *   stride: number, swing: number, lift: number, maxSpeed: number, accel: number, turnRate: number,
 * }} ShapedShape
 */

const PLANTED = 0, SWING = 1;
export const MAX_LEGS = 6;
export const MAX_SPINE = 10;
export const MAX_TAIL = 8;

export class ShapedBody {
  /**
   * @param {ShapedShape} shape
   * @param {{ qx: number, qz: number, h: number, sample: () => void }} ground
   */
  constructor(shape, ground) {
    this.shape = shape; this.ground = ground;
    const S = shape.spine, L = shape.legs.length, T = shape.tail;
    // Root: on the ground under the front of the spine (the head's footprint), heading, velocity.
    this.x = 0.5; this.y = 0.5; this.z = 0.5; this.heading = 0.5 - 0.5; this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5;
    /** AI inputs: desired velocity (m/s, world) and an optional facing override. */
    this.wantVx = 0.5 - 0.5; this.wantVz = 0.5 - 0.5;
    /** Pose modifiers (0..1): crouch (telegraph), lift (m, airborne leap), rise (spawn), bob. */
    this.crouch = 0.5 - 0.5; this.lift = 0.5 - 0.5; this.rise = 1.5 - 0.5; this.frozen = false;
    // Spine joints (world), index 0 = the neck/front.
    this.sx = new Float64Array(S); this.sy = new Float64Array(S); this.sz = new Float64Array(S);
    this.tx = new Float64Array(T); this.ty = new Float64Array(T); this.tz = new Float64Array(T);
    this.hx = 0.5; this.hy = 0.5; this.hz = 0.5;  // head
    // Legs: foot (world), state, swing from/to and progress, knee, hip.
    this.fx = new Float64Array(L); this.fy = new Float64Array(L); this.fz = new Float64Array(L);
    this.state = new Uint8Array(L); this.t = new Float64Array(L);
    this.ax = new Float64Array(L); this.ay = new Float64Array(L); this.az = new Float64Array(L);
    this.bx = new Float64Array(L); this.bz = new Float64Array(L);
    this.kx = new Float64Array(L); this.ky = new Float64Array(L); this.kz = new Float64Array(L);
    this.px = new Float64Array(L); this.py = new Float64Array(L); this.pz = new Float64Array(L);
    this.lastGroup = 1;
    // Footfall events (x, z, dirX, dirZ, leg) consumed by the owner.
    this.ev = new Float64Array(16 * 5); this.evCount = 0;
    this.dt = 0.5;
    this._hx = 0.5; this._hzz = 0.5;
    this._need = new Float64Array(2);
  }

  _groundAt(x, z) { const g = this.ground; g.qx = x; g.qz = z; g.sample(); return g.h; }

  /** Place the whole body at (x, z) facing heading, standing, at rest. */
  place(x, z, heading) {
    const sh = this.shape;
    this.x = x; this.z = z; this.heading = heading; this.vx = 0; this.vz = 0;
    this.y = this._groundAt(x, z);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (let i = 0; i < sh.spine; i++) { this.sx[i] = x - fx * sh.spacing * i; this.sz[i] = z - fz * sh.spacing * i; }
    for (let i = 0; i < sh.tail; i++) {
      this.tx[i] = this.sx[sh.spine - 1] - fx * sh.tailSpacing * (i + 1); this.tz[i] = this.sz[sh.spine - 1] - fz * sh.tailSpacing * (i + 1);
    }
    this._heights();
    for (let l = 0; l < sh.legs.length; l++) {
      this._home(l, 0);
      this.fx[l] = this._hx; this.fz[l] = this._hzz; this.fy[l] = this._groundAt(this._hx, this._hzz);
      this.state[l] = PLANTED;
    }
    this._knees();
  }

  /** Home of leg l under its hip, led by `lead` seconds of velocity → _hx/_hzz. */
  _home(l, lead) {
    const leg = this.shape.legs[l];
    const i = leg.at;
    // Local frame at the attachment: forward from the next joint toward this one.
    const j = Math.min(i + 1, this.shape.spine - 1), k = Math.max(i - 1, 0);
    let dx = this.sx[k] - this.sx[j], dz = this.sz[k] - this.sz[j];
    const dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl;
    const rx = dz, rz = -dx;
    this._hx = this.sx[i] + rx * leg.side * leg.reach + this.vx * lead;
    this._hzz = this.sz[i] + rz * leg.side * leg.reach + this.vz * lead;
  }

  update() {
    const sh = this.shape, dt = this.dt;
    this.evCount = 0;
    // Velocity toward the AI's wish (bounded acceleration); heading turns toward travel.
    if (!this.frozen) {
      let dvx = this.wantVx - this.vx, dvz = this.wantVz - this.vz;
      const dv = Math.sqrt(dvx * dvx + dvz * dvz), mx = sh.accel * dt;
      if (dv > mx) { dvx *= mx / dv; dvz *= mx / dv; }
      this.vx += dvx; this.vz += dvz;
      const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (sp > sh.maxSpeed) { this.vx *= sh.maxSpeed / sp; this.vz *= sh.maxSpeed / sp; }
      if (sp > 0.3) {
        let d = Math.atan2(this.vx, this.vz) - this.heading;
        d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
        const m = sh.turnRate * dt;
        this.heading += d > m ? m : d < -m ? -m : d;
      }
    } else { this.vx = 0; this.vz = 0; }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.y = this._groundAt(this.x, this.z);
    // Spine: the front joint leads; each follows the one ahead at its spacing (rope).
    this.sx[0] = this.x; this.sz[0] = this.z;
    for (let i = 1; i < sh.spine; i++) {
      let dx = this.sx[i] - this.sx[i - 1], dz = this.sz[i] - this.sz[i - 1];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-6) { dx = -Math.sin(this.heading); dz = -Math.cos(this.heading); } else { dx /= d; dz /= d; }
      this.sx[i] = this.sx[i - 1] + dx * sh.spacing; this.sz[i] = this.sz[i - 1] + dz * sh.spacing;
    }
    for (let i = 0; i < sh.tail; i++) {
      const px = i === 0 ? this.sx[sh.spine - 1] : this.tx[i - 1], pz = i === 0 ? this.sz[sh.spine - 1] : this.tz[i - 1];
      let dx = this.tx[i] - px, dz = this.tz[i] - pz;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      this.tx[i] = px + dx / d * sh.tailSpacing; this.tz[i] = pz + dz / d * sh.tailSpacing;
    }
    this._legs(dt);
    this._heights();
    this._knees();
  }

  _legs(dt) {
    const sh = this.shape, legs = sh.legs;
    const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    const swingT = sh.swing / (1 + sp * 0.12);
    // Swinging feet: arc to their (re-aimed) landing point; land → footfall.
    for (let l = 0; l < legs.length; l++) {
      if (this.state[l] !== SWING) continue;
      this.t[l] += dt / swingT;
      const rem = Math.max(0, 1 - this.t[l]) * swingT;
      this._home(l, rem + sh.stride * 0.25 / Math.max(sp, 1));
      const k = Math.min(1, dt * 14);
      this.bx[l] += (this._hx - this.bx[l]) * k; this.bz[l] += (this._hzz - this.bz[l]) * k;
      if (this.t[l] >= 1) {
        this.fx[l] = this.bx[l]; this.fz[l] = this.bz[l]; this.fy[l] = this._groundAt(this.bx[l], this.bz[l]);
        this.state[l] = PLANTED;
        if (this.evCount < 16 && this.lift < 0.05) {
          const o = this.evCount++ * 5;
          this.ev[o] = this.fx[l]; this.ev[o + 1] = this.fz[l]; this.ev[o + 2] = Math.sin(this.heading); this.ev[o + 3] = Math.cos(this.heading); this.ev[o + 4] = l;
        }
      } else {
        const u = this.t[l], s = u * u * (3 - 2 * u);
        this.fx[l] = this.ax[l] + (this.bx[l] - this.ax[l]) * s;
        this.fz[l] = this.az[l] + (this.bz[l] - this.az[l]) * s;
        const gy = this.ay[l] + (this._groundAt(this.bx[l], this.bz[l]) - this.ay[l]) * s;
        this.fy[l] = gy + sh.lift * (0.6 + 0.4 * Math.min(1, sp / sh.maxSpeed)) * Math.sin(Math.PI * u);
      }
    }
    // Airborne (a leap): feet tuck under the hips.
    if (this.lift > 0.05) {
      for (let l = 0; l < legs.length; l++) {
        this._home(l, 0); this.state[l] = PLANTED;
        this.fx[l] = this._hx; this.fz[l] = this._hzz; this.fy[l] = this._groundAt(this._hx, this._hzz) + this.lift * 0.6;
      }
      return;
    }
    // Planted feet that have fallen behind lift, a whole group at a time (trot: diagonal pairs),
    // and only once the other group has landed.
    const groups = 2;
    let anySwing = false;
    for (let l = 0; l < legs.length; l++) if (this.state[l] === SWING) anySwing = true;
    if (anySwing) return;
    const need = this._need; need[0] = 0; need[1] = 0;
    for (let l = 0; l < legs.length; l++) {
      this._home(l, 0);
      const ex = this.fx[l] - this._hx, ez = this.fz[l] - this._hzz;
      const e = Math.sqrt(ex * ex + ez * ez);
      const g = legs[l].group;
      need[g] = Math.max(need[g], e / (sh.stride * 0.5));
    }
    const settle = sp < 0.2 ? 0.25 : 1;          // at rest, small errors re-step too
    let pick = -1, best = 0;
    for (let g = 0; g < groups; g++) {
      const sc = need[g] + (g === this.lastGroup ? -0.2 : 0);
      if (need[g] >= settle && sc > best) { best = sc; pick = g; }
    }
    if (pick < 0) return;
    this.lastGroup = pick;
    for (let l = 0; l < legs.length; l++) {
      if (legs[l].group !== pick) continue;
      this.state[l] = SWING; this.t[l] = 0;
      this.ax[l] = this.fx[l]; this.ay[l] = this.fy[l]; this.az[l] = this.fz[l];
      this._home(l, swingT + sh.stride * 0.25 / Math.max(sp, 1));
      this.bx[l] = this._hx; this.bz[l] = this._hzz;
    }
  }

  /** Heights: spine joints ride at hip height over the ground (crouch lowers, a leap lifts). */
  _heights() {
    const sh = this.shape;
    const base = sh.hip * (1 - 0.35 * this.crouch) * this.rise;
    for (let i = 0; i < sh.spine; i++) {
      const g = this._groundAt(this.sx[i], this.sz[i]);
      this.sy[i] = g + base + this.lift + (this.rise < 1 ? (this.rise - 1) * sh.hip : 0);
    }
    for (let i = 0; i < sh.tail; i++) {
      const g = this._groundAt(this.tx[i], this.tz[i]);
      const droop = (i + 1) / sh.tail;
      this.ty[i] = Math.max(g + 0.05, this.sy[sh.spine - 1] - droop * sh.hip * 0.45);
    }
    // Head: ahead of the front joint, raised; it dips in a crouch.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.hx = this.sx[0] + fx * sh.spacing * 0.9; this.hz = this.sz[0] + fz * sh.spacing * 0.9;
    this.hy = this.sy[0] + sh.headUp * (1 - 0.8 * this.crouch);
  }

  /** Two-bone knees (rear legs bend backward, front legs forward-out). */
  _knees() {
    const legs = this.shape.legs;
    for (let l = 0; l < legs.length; l++) {
      const leg = legs[l], i = leg.at;
      this._home(l, 0);
      // Hip: beside the spine joint at hip height.
      const j = Math.min(i + 1, this.shape.spine - 1), k = Math.max(i - 1, 0);
      let dx = this.sx[k] - this.sx[j], dz = this.sz[k] - this.sz[j];
      const dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl;
      const rx = dz, rz = -dx;
      const hx = this.sx[i] + rx * leg.side * leg.reach * 0.6, hy = this.sy[i], hz = this.sz[i] + rz * leg.side * leg.reach * 0.6;
      this.px[l] = hx; this.py[l] = hy; this.pz[l] = hz;
      let vx = this.fx[l] - hx, vy = this.fy[l] - hy, vz = this.fz[l] - hz;
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-4;
      const a = leg.upper, b = leg.lower, dc = Math.min(Math.max(d, 1e-3), a + b - 1e-3);
      vx /= d; vy /= d; vz /= d;
      const along = (a * a - b * b + dc * dc) / (2 * dc);
      const off = Math.sqrt(Math.max(a * a - along * along, 0));
      // Pole: forward (front legs) or backward (rear legs), with a little outward.
      const s = leg.kneeBack ? -1 : 1;
      let qx = dx * s + rx * leg.side * 0.3, qy = 0, qz = dz * s + rz * leg.side * 0.3;
      const dp = qx * vx + qy * vy + qz * vz; qx -= vx * dp; qy -= vy * dp; qz -= vz * dp;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      this.kx[l] = hx + vx * along + qx / ql * off; this.ky[l] = hy + vy * along + qy / ql * off; this.kz[l] = hz + vz * along + qz / ql * off;
    }
  }
}
