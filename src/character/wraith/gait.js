// Procedural locomotion for the Wraith (BRIEF §8.1): real foot planting. Pure logic over plain
// numbers and preallocated arrays (testable in Node, allocation-free on the frame path).
//
// Each foot is either PLANTED (locked to a world point: it never slides) or SWINGING (an arc
// from where it lifted to a landing point predicted from the body's velocity). A foot steps when
// it has fallen far enough behind its "home" under the hip, and only while the other foot is
// planted (strict alternation while walking/running). Cadence and stride scale with speed. At
// rest, feet settle under the body with short corrective steps.
//
// Landing emits a footfall event on the exact frame of contact (position, direction, foot,
// speed); the owner turns events into terrain-state footprints and spray.
//
// Inputs (fields, set before update()): body foot point (bx, by, bz), velocity (vx, vz), facing
// yaw, grounded, dt. Ground heights come from a query object (qx/qz → sample() → h).

export const GAIT = {
  hipWidth: 0.11,      // m: lateral offset of each foot's home from the centre line
  legLength: 0.92,     // m: hip to sole at full extension (thigh + shin)
  thigh: 0.46, shin: 0.46,
  hipHeight: 0.88,     // m: pelvis above the ground when standing
  minStride: 0.32,     // m: smallest corrective step
  settle: 0.06,        // m: at rest, a foot this far from home re-steps
  maxEvents: 16,
};

const PLANTED = 0, SWING = 1;

export class Gait {
  /** @param {{ qx: number, qz: number, h: number, sample: () => void }} ground */
  constructor(ground) {
    this.ground = ground;
    // Inputs.
    this.bx = 0.5; this.by = 0.5; this.bz = 0.5; this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5; this.yaw = 0.5 - 0.5;
    this.grounded = true; this.dt = 0.5;
    /** Swimming 0..1 and the stroke phase (inputs). */
    this.swim = 0.5 - 0.5; this.swimPhase = 0.5 - 0.5;
    // Feet: world position, state, swing from/to, swing progress and duration.
    this.fx = new Float64Array(2); this.fy = new Float64Array(2); this.fz = new Float64Array(2);
    this.state = new Uint8Array(2);
    this.ax = new Float64Array(2); this.ay = new Float64Array(2); this.az = new Float64Array(2); // swing start
    this.tx = new Float64Array(2); this.ty = new Float64Array(2); this.tz = new Float64Array(2); // landing
    this.t = new Float64Array(2); this.dur = new Float64Array(2); this.lift = new Float64Array(2);
    this.dirX = new Float64Array(2); this.dirZ = new Float64Array(2); // facing of the foot when it landed
    this.last = 1; // index of the foot that stepped last
    // Outputs: pelvis, knees (for the cloth colliders), speed, gait phase 0..1 for secondary motion.
    this.px = 0.5; this.py = 0.5; this.pz = 0.5;
    this.kx = new Float64Array(2); this.ky = new Float64Array(2); this.kz = new Float64Array(2);
    this.speed = 0.5 - 0.5; this.phase = 0.5 - 0.5;
    this.pyOff = 0.5 - 0.5;   // eased pelvis offset (bob, running crouch)
    /** Surf engagement 0..1 (input): above ½ the feet hold a surf stance instead of stepping. */
    this.surf = 0.5 - 0.5;
    this.stance = false;
    /** Death: 0..1 the figure sinks to the snow (the robe pools around it). */
    this.collapse = 0.5 - 0.5;
    // Footfall events (ring, consumed by the owner): x, y, z, dirX, dirZ, foot, speed.
    this.ev = new Float64Array(GAIT.maxEvents * 7);
    this.evCount = 0;
    this.started = false;
  }

  /** Snap both feet to their homes (spawn, teleport). */
  reset() {
    for (let f = 0; f < 2; f++) {
      this._home(f, 0);
      this.fx[f] = this._hx; this.fz[f] = this._hz; this.fy[f] = this._groundAt(this._hx, this._hz);
      this.state[f] = PLANTED; this.dirX[f] = Math.sin(this.yaw); this.dirZ[f] = Math.cos(this.yaw);
    }
    this.pyOff = 0;
    this.started = true;
  }

  _groundAt(x, z) { const g = this.ground; g.qx = x; g.qz = z; g.sample(); return g.h; }

  /** Home of foot f under the hip, led by `lead` seconds of velocity → this._hx/_hz. */
  _home(f, lead) {
    const s = f === 0 ? -1 : 1; // 0 = left, 1 = right
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // right vector for yaw (x east, z north)
    this._hx = this.bx + rx * GAIT.hipWidth * s + this.vx * lead;
    this._hz = this.bz + rz * GAIT.hipWidth * s + this.vz * lead;
  }

  update() {
    if (!this.started) this.reset();
    const dt = this.dt;
    const speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    this.speed = speed;
    const moving = speed > 0.25;
    // Stride geometry from speed: a foot lands F ahead of its hip home and lifts once it trails T
    // behind. Swing time grows slightly with speed. Walking keeps double support (stance ≥
    // swing); from a jog on, both feet may be airborne between steps (a flight phase), as in real
    // running. ~2.1 steps/s walking at 1.4 m/s; ~3.3 steps/s and 1.6 m steps at the 5.2 m/s run.
    const F = moving ? Math.min(0.45, 0.22 + 0.1 * speed) : 0;
    const T = Math.min(0.62, 0.26 + 0.1 * speed);
    const swingDur = moving ? 0.38 + 0.004 * Math.min(speed, 6) : 0.24;
    const ux = moving ? this.vx / speed : Math.sin(this.yaw), uz = moving ? this.vz / speed : Math.cos(this.yaw);
    if (this.surf > 0.5) { this._surfStance(); return; }
    if (this.stance) { this.stance = false; this.reset(); }

    // The ground under a planted foot can change (collision data streaming in, teleports):
    // re-seat it vertically, never horizontally; if the body has left the feet far behind, reset.
    for (let f = 0; f < 2; f++) {
      if (this.state[f] !== PLANTED) continue;
      const gy = this._groundAt(this.fx[f], this.fz[f]);
      if (Math.abs(gy - this.fy[f]) > 0.02) this.fy[f] = gy;
      const ex = this.fx[f] - this.bx, ez = this.fz[f] - this.bz, ey = this.fy[f] - this.by;
      if (ex * ex + ez * ez > 4 || ey * ey > 1) { this.reset(); break; }
    }
    for (let f = 0; f < 2; f++) {
      if (this.state[f] !== SWING) continue;
      this.t[f] += dt / this.dur[f];
      // Re-aim the landing point while swinging (velocity may change).
      const rem = Math.max(0, 1 - this.t[f]) * this.dur[f];
      this._home(f, rem);
      const k = Math.min(1, dt * 12);
      this.tx[f] += (this._hx + ux * F - this.tx[f]) * k; this.tz[f] += (this._hz + uz * F - this.tz[f]) * k;
      if (this.t[f] >= 1) {
        // Contact: lock the foot exactly where it lands and emit the footfall this frame.
        this.fx[f] = this.tx[f]; this.fz[f] = this.tz[f]; this.fy[f] = this._groundAt(this.tx[f], this.tz[f]);
        this.state[f] = PLANTED;
        this.dirX[f] = Math.sin(this.yaw); this.dirZ[f] = Math.cos(this.yaw);
        if (this.grounded) this._emit(f, speed);
      } else {
        const u = this.t[f], sm = u * u * (3 - 2 * u);
        this.fx[f] = this.ax[f] + (this.tx[f] - this.ax[f]) * sm;
        this.fz[f] = this.az[f] + (this.tz[f] - this.az[f]) * sm;
        const gy = this.ay[f] + (this._groundAt(this.tx[f], this.tz[f]) - this.ay[f]) * sm;
        this.fy[f] = gy + this.lift[f] * Math.sin(Math.PI * u);
      }
    }

    // Lift a planted foot once it trails its home by T along the motion (or, at rest or when
    // turning, once it is off its home). Walking waits for the other foot to land; running may
    // lift while the other is still in the air (flight phase).
    if (this.grounded) {
      let best = -1, bestScore = 0;
      for (let f = 0; f < 2; f++) {
        if (this.state[f] !== PLANTED) continue;
        const o = 1 - f;
        if (this.state[o] === SWING && (!moving || speed < 2.2)) continue;
        this._home(f, 0);
        const ex = this.fx[f] - this._hx, ez = this.fz[f] - this._hz;
        const along = ex * ux + ez * uz, side = Math.abs(-ex * uz + ez * ux);
        let need = 0;
        if (moving) need = Math.max(-along / T, side / 0.22);
        else need = Math.sqrt(ex * ex + ez * ez) / GAIT.settle;
        const score = need + (f === this.last ? -0.25 : 0);
        if (need >= 1 && score > bestScore) { bestScore = score; best = f; }
      }
      if (best >= 0) {
        const f = best;
        this.state[f] = SWING; this.t[f] = 0;
        this.dur[f] = swingDur;
        this.ax[f] = this.fx[f]; this.ay[f] = this.fy[f]; this.az[f] = this.fz[f];
        this._home(f, this.dur[f]);
        this.tx[f] = this._hx + ux * F; this.tz[f] = this._hz + uz * F;
        this.lift[f] = moving ? 0.06 + 0.025 * Math.min(speed, 5) : 0.035;
        this.last = f;
      }
    } else {
      // Airborne: feet tuck under the body (no footfalls until grounded again). Swimming: the legs
      // trail behind and below, drawing up and kicking out together on the stroke.
      const sw = this.swim, fxd = Math.sin(this.yaw), fzd = Math.cos(this.yaw);
      const kick = 0.5 - 0.5 * Math.cos(Math.PI * 2 * Math.min(1, this.swimPhase / 0.6));
      for (let f = 0; f < 2; f++) {
        this._home(f, 0);
        this.state[f] = PLANTED;
        const side = f === 0 ? -1 : 1, back = (0.55 - 0.25 * kick) * sw, wide = (GAIT.hipWidth + 0.12 * kick * sw) * side;
        this.fx[f] = this._hx - fxd * back + fzd * wide * sw; this.fz[f] = this._hz - fzd * back - fxd * wide * sw;
        this.fy[f] = this.by - 0.05 + (0.45 - 0.15 * kick) * sw;
      }
    }

    // Pelvis: hip height above the lower foot, dipping at contact and rising in mid-swing;
    // lower when running.
    const swing = this.state[0] === SWING ? this.t[0] : this.state[1] === SWING ? this.t[1] : 0;
    this.phase = (this.last + Math.min(swing, 1)) * 0.5;
    const bob = moving ? -0.03 * Math.min(speed / 3, 1.4) * Math.cos(Math.PI * 2 * swing) : 0;
    // Base: the ground under the body, lowered to a planted foot downhill (never raised by a foot
    // in the air: in a running flight phase both feet are lifted).
    let footY = this.by;
    for (let f = 0; f < 2; f++) if (this.state[f] === PLANTED && this.fy[f] < footY) footY = this.fy[f];
    this.px = this.bx; this.pz = this.bz;
    // The bob and the running crouch are eased: they must never step (a stop would jerk the pelvis,
    // and every pinned row of cloth with it, ~10 cm in one frame).
    const off = bob - Math.min(speed, 6) * 0.012;
    this.pyOff += (off - this.pyOff) * (1 - Math.exp(-dt * 20));
    this.py = Math.max(footY, this.by - 0.1) + GAIT.hipHeight + this.pyOff - this.collapse * 0.74;
    // Knees by two-bone IK (pole forward), for the cloth colliders.
    for (let f = 0; f < 2; f++) this._knee(f);
  }

  /** Surf stance: feet staggered along the heading and turned across it, riding with the body
   *  on the crest (no planting, no footfalls: the wake writes the snow); the pelvis sinks. */
  _surfStance() {
    this.stance = true;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = fz, rz = -fx;
    for (let f = 0; f < 2; f++) {
      const along = f === 0 ? 0.27 : -0.23, side = f === 0 ? -0.07 : 0.09;
      const x = this.bx + fx * along + rx * side, z = this.bz + fz * along + rz * side;
      this.fx[f] = x; this.fz[f] = z; this.fy[f] = this.grounded ? this._groundAt(x, z) : this.by + 0.05;
      this.state[f] = PLANTED; this.t[f] = 0;
      const turn = f === 0 ? 0.35 : 0.6;                   // toes turned across the heading
      this.dirX[f] = Math.sin(this.yaw + turn); this.dirZ[f] = Math.cos(this.yaw + turn);
    }
    const dt = this.dt;
    this.pyOff += (-0.17 * Math.min(1, (this.surf - 0.5) * 4) - this.pyOff) * (1 - Math.exp(-dt * 8));
    this.px = this.bx; this.pz = this.bz;
    this.py = Math.min(this.fy[0], this.fy[1], this.by) + GAIT.hipHeight + this.pyOff;
    this.phase = 0;
    for (let f = 0; f < 2; f++) this._knee(f);
  }

  _knee(f) {
    const s = f === 0 ? -1 : 1;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const hx = this.px + rx * GAIT.hipWidth * s, hy = this.py, hz = this.pz + rz * GAIT.hipWidth * s;
    let dx = this.fx[f] - hx, dy = this.fy[f] - hy, dz = this.fz[f] - hz;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const a = GAIT.thigh, b = GAIT.shin;
    const dc = Math.min(Math.max(d, 1e-4), a + b - 1e-4);
    dx /= d || 1; dy /= d || 1; dz /= d || 1;
    // Distance along hip→foot to the knee's projection, and the knee's offset toward the pole.
    const along = (a * a - b * b + dc * dc) / (2 * dc);
    const off = Math.sqrt(Math.max(a * a - along * along, 0));
    // Pole: forward (facing), made perpendicular to the leg.
    let pxp = Math.sin(this.yaw), pyp = 0, pzp = Math.cos(this.yaw);
    const dp = pxp * dx + pyp * dy + pzp * dz;
    pxp -= dx * dp; pyp -= dy * dp; pzp -= dz * dp;
    const pl = Math.sqrt(pxp * pxp + pyp * pyp + pzp * pzp) || 1;
    this.kx[f] = hx + dx * along + (pxp / pl) * off;
    this.ky[f] = hy + dy * along + (pyp / pl) * off;
    this.kz[f] = hz + dz * along + (pzp / pl) * off;
  }

  _emit(f, speed) {
    if (this.evCount >= GAIT.maxEvents) return;
    const o = this.evCount++ * 7, e = this.ev;
    e[o] = this.fx[f]; e[o + 1] = this.fy[f]; e[o + 2] = this.fz[f];
    e[o + 3] = this.dirX[f]; e[o + 4] = this.dirZ[f]; e[o + 5] = f; e[o + 6] = speed;
  }
}
