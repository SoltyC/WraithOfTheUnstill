// Climbing the Warden (BRIEF §8.4, in the spirit of Shadow of the Colossus). The Wraith grips the
// Warden's frost-crusted surface — its legs (tubes along foot → knee → hip) and its body (a tube
// around the spine) — and holds a position in that surface's own parameters, so it rides every
// step, buck and kneel exactly. W/S climb up and down the surface, A/D across it; a leg hands
// off onto the flank at the hip, the flank back onto a leg. Gripping spends focus; the Warden
// bucks to throw the Wraith off, which only a full grip survives. Mounting, shifting holds and
// being thrown off all ease (the pose blends; the fall is real momentum). Allocation-free.

import { WARDEN_SHAPE, WARDEN_RIG } from './warden.js';

export const climbTuning = {
  // Hold to hold: a reach (the lead hand arcs to a new hold), then a pull (the body surges up
  // under it), then a beat; the other hand leads the next move.
  stride: 0.6,           // m per move
  reachTime: 0.24, pullTime: 0.34, beat: 0.06,   // s
  reach: 1.4,            // m beyond a leg's surface the Wraith can grab from
  standoff: 0.3,         // m: pelvis off the surface
  handUp: 0.92, handOut: 0.24,    // hold placement from the pelvis (along up, across)
  footDown: 0.7, footOut: 0.17,
  drainIdle: 1.5, drainMove: 5, drainShake: 26,   // focus per second
  throwSpeed: 7, dropSpeed: 2.5,
  jointReach: 3.2,       // m: a back joint is within reach
  ease: 7,               // 1/s: pose blend on mount/dismount
  bump: 0.35,            // m: the body rides this far out from the smooth tube (the crust's mean)
  bumpReach: 1.3,        // m: hands find holds on chunks standing at most this far proud of the tube
  footClear: 0.85,       // m: feet below the pelvis; climbing down past the ground steps off
};

const LEG = 1, BODY = 2, PILLAR = 3;
export const CLIMB_MODE = { LEG, BODY, PILLAR };
const HANG = 0, REACH = 1, PULL = 2;

/**
 * @param {{ warden: any }} ctx
 */
export function createClimb(ctx) {
  const { warden } = ctx;
  /** Ground query (optional): climbing down to the ground steps off rather than sinking in. */
  const ground = ctx.ground || null;
  /** Crystal pillars (optional): { n, x, z, y0 (base, sinks with it), up (0..1 risen), h (height
   *  each), r } — static columns climbed the same hold-to-hold way; the top is a floor to mantle onto. */
  const pillars = ctx.pillars || null;
  /** evalSurface: true → the crust's real bumps (hands), false → the smooth tube (the body). */
  let bumps = false;
  const T = climbTuning, SH = WARDEN_SHAPE;
  // Scratch (no allocation per frame).
  const P = new Float64Array(3), N = new Float64Array(3), Ts = new Float64Array(3), Ta = new Float64Array(3);
  // Holds in the surface's own parameters (so they ride every step and buck): hands then feet,
  // (p1, p2) each; and their world positions out.
  const hold = new Float64Array(8), holdW = new Float64Array(12), reachFrom = new Float64Array(3);
  const self = {
    /** 0 none, LEG, BODY, PILLAR. */
    mode: 0, leg: 0, pillar: 0,
    /** Mantled onto a pillar's top this frame (fell = 4): where to stand. */
    topX: 0.5, topY: 0.5, topZ: 0.5, u: 0.5, a: 0.5, s: 0.5, th: 0.5,
    /** Outputs: pelvis, surface frame (right, up-the-climb, into-surface), surface velocity. */
    x: 0.5, y: 0.5, z: 0.5, rx: 0.5, ry: 0.5, rz: 0.5, ux: 0.5, uy: 0.5, uz: 0.5, fx: 0.5, fy: 0.5, fz: 0.5,
    vx: 0.5, vy: 0.5, vz: 0.5, phase: 0.5, blend: 0.5 - 0.5,
    /** Grip IK targets (world): hands L, R then feet L, R (x, y, z each); feetFree when they hang. */
    grip: false, holds: holdW, feetFree: false,
    /** The move cycle: HANG / REACH / PULL, its clock, and the leading hand (0 L, 1 R). */
    cycle: HANG, cycleT: 0.5 - 0.5, lead: 0,
    /** A hand bit into a hold this frame (owner: a puff of snow, a small jolt) at (gx, gy, gz). */
    grabbed: false, gx: 0.5, gy: 0.5, gz: 0.5,
    /** Back joint within reach (2, 3) or −1. */
    nearJoint: -1,
    /** Events this frame: 1 thrown off, 2 let go, 3 slipped (no focus), 4 mantled onto a pillar's top. */
    fell: 0,
    /** Inputs (fields): grip held, move (mx right, mz up), camera right (crx, crz), feet pos, dt,
     *  focus available (the owner spends it through spend()). */
    mx: 0.5 - 0.5, mz: 0.5 - 0.5, crx: 1.5 - 0.5, crz: 0.5 - 0.5, px: 0.5, py: 0.5, pz: 0.5, dt: 0.5,
    spend: null,
    // Move: from / to in the surface's parameters.
    _f1: 0.5, _f2: 0.5, _t1: 0.5, _t2: 0.5, _feetMoved: 0,
    /** Carried offset after changing surface (eased to zero). */
    _cx: 0.5 - 0.5, _cy: 0.5 - 0.5, _cz: 0.5 - 0.5,

    get climbing() { return this.mode !== 0; },
    /** Fresh holds around the current position (after setting mode and parameters directly). */
    regrip() { if (this.mode) { regrip(this); writeHolds(this); this.blend = 1; } },

    update() {
      const dt = this.dt;
      this.fell = 0; this.grabbed = false;
      const onWarden = this.mode === LEG || this.mode === BODY;
      if (onWarden && (!warden.active || warden.state === 4 || warden.state === 5)) { letGo(this, 2); this.blend = Math.max(0, this.blend - dt * T.ease); return; }
      if (this.mode === PILLAR && pillars.up[this.pillar] < 1) { letGo(this, 2); return; }
      if (this.mode === 0) {
        this.blend = Math.max(0, this.blend - dt * T.ease);
        if (this.grip) tryMount(this);
        if (this.mode === 0) return;
      }
      if (!this.grip) { letGo(this, 2); return; }
      // Grip costs focus; the Warden's bucking costs a great deal more. Out of focus: slip.
      const wants = Math.abs(this.mx) + Math.abs(this.mz) > 0.1;
      const shaking = this.mode !== PILLAR && warden.shaking;
      const cost = (this.cycle !== HANG ? T.drainMove : T.drainIdle) + (shaking ? T.drainShake : 0);
      if (!this.spend(cost * dt)) { letGo(this, shaking ? 1 : 3); return; }
      const ox = this.x, oy = this.y, oz = this.z;
      this.cycleT += dt;
      if (this.cycle === HANG) {
        // Holding on: a new move starts after the beat, unless the Warden is heaving.
        if (wants && !shaking && this.cycleT >= T.beat) startMove(this);
      } else if (this.cycle === REACH) {
        if (this.cycleT >= T.reachTime) {
          // The lead hand bites into its hold; the body pulls up under it.
          this.cycle = PULL; this.cycleT = 0; this.grabbed = true;
          const o = this.lead * 3; this.gx = holdW[o]; this.gy = holdW[o + 1]; this.gz = holdW[o + 2];
        }
      } else {
        // The pull: ease in, surge, settle (smoothstep on the surface's parameters).
        const k = Math.min(1, this.cycleT / T.pullTime), e = k * k * (3 - 2 * k);
        setP(this, this._f1 + (this._t1 - this._f1) * e, this._f2 + (this._t2 - this._f2) * e);
        // The feet step up in the second half of the pull, one after the other.
        if (k > 0.45 && this._feetMoved < 1) { placeFoot(this, 0); this._feetMoved = 1; }
        if (k > 0.75 && this._feetMoved < 2) { placeFoot(this, 1); this._feetMoved = 2; }
        this.phase += dt * 6;
        if (k >= 1) {
          this.cycle = HANG; this.cycleT = 0; this.lead = 1 - this.lead;
          const was = this.mode, wx = this.x, wy = this.y, wz = this.z;
          transitions(this);
          if (this.mode === 0) return;
          if (this.mode !== was) {
            regrip(this);
            // What the two surfaces do not share eases out instead of snapping.
            this._cx += wx - this.x; this._cy += wy - this.y; this._cz += wz - this.z;
          }
        }
      }
      surface(this);
      // Carry from a surface change, decaying (the body glides across, the hands are already there).
      const kc = Math.exp(-dt * 7);
      this._cx *= kc; this._cy *= kc; this._cz *= kc;
      this.x += this._cx; this.y += this._cy; this.z += this._cz;
      // Down at the ground: step off onto it (the feet would otherwise go into the snow).
      // (Also when the Warden kneels and lowers the climbed leg or flank onto the snow.)
      if (ground !== null && feetBelowGround(this)) { letGo(this, 2); this.vx = 0; this.vy = 0; this.vz = 0; return; }
      writeHolds(this);
      this.blend = Math.min(1, this.blend + dt * T.ease);
      const idt = dt > 0 ? 1 / dt : 0;
      this.vx = (this.x - ox) * idt; this.vy = (this.y - oy) * idt; this.vz = (this.z - oz) * idt;
      // A back joint in reach?
      this.nearJoint = -1;
      if (this.mode !== PILLAR) for (let k = 2; k < 4; k++) {
        if (warden.joint[k] === 2) continue;
        if (Math.hypot(warden.jx[k] - this.x, warden.jy[k] - this.y, warden.jz[k] - this.z) < T.jointReach) this.nearJoint = k;
      }
    },
  };

  function getP1(c) { return c.mode === LEG ? c.u : c.s; }
  function getP2(c) { return c.mode === LEG ? c.a : c.th; }
  function setP(c, p1, p2) { if (c.mode === LEG) { c.u = p1; c.a = p2; } else { c.s = p1; c.th = p2; } }

  /** Begin a move: where the body will be after the pull, and the lead hand's new hold. */
  function startMove(c) {
    surface(c); tangents(c);
    const step = T.stride, f1 = getP1(c), f2 = getP2(c);
    let d1, d2;
    if (c.mode === LEG) {
      // Legs: straight along the axis (W up toward the hip) and around it (A/D), so a bent
      // knee's crease never traps the climber.
      const b = warden.body, l = c.leg;
      const len = Math.hypot(b.kx[l] - b.fx[l], b.ky[l] - b.fy[l], b.kz[l] - b.fz[l]) + Math.hypot(b.px[l] - b.kx[l], b.py[l] - b.ky[l], b.pz[l] - b.kz[l]);
      const aa = Math.sqrt(Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2]) || 1;
      const around = (Ta[0] * c.rx + Ta[1] * c.ry + Ta[2] * c.rz) >= 0 ? 1 : -1;
      const m = Math.hypot(c.mx, c.mz) || 1;
      d1 = (c.mz / m) * step / Math.max(len, 1); d2 = (c.mx / m) * step * around / aa;
    } else {
      const m = Math.hypot(c.mx, c.mz) || 1;
      const dx = (c.ux * c.mz + c.rx * c.mx) / m * step, dy = (c.uy * c.mz + c.ry * c.mx) / m * step, dz = (c.uz * c.mz + c.rz * c.mx) / m * step;
      const ss = Ts[0] * Ts[0] + Ts[1] * Ts[1] + Ts[2] * Ts[2] || 1, aa = Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2] || 1;
      d1 = (dx * Ts[0] + dy * Ts[1] + dz * Ts[2]) / ss; d2 = (dx * Ta[0] + dy * Ta[1] + dz * Ta[2]) / aa;
    }
    c._f1 = f1; c._f2 = f2; c._t1 = f1 + d1; c._t2 = f2 + d2; c._feetMoved = 0;
    // The lead hand's new hold: where it would rest above the body's destination.
    const o = c.lead * 3;
    reachFrom[0] = holdW[o]; reachFrom[1] = holdW[o + 1]; reachFrom[2] = holdW[o + 2];
    setP(c, c._t1, c._t2); surface(c);
    placeLimb(c, c.lead, T.handUp, (c.lead === 0 ? -1 : 1) * T.handOut);
    setP(c, f1, f2); surface(c);
    c.cycle = REACH; c.cycleT = 0;
  }

  /** Hold for limb i (0, 1 hands; 2, 3 feet) at (up, across) metres from the pelvis, on the surface. */
  function placeLimb(c, i, up, across) {
    tangents(c);
    const wx = c.ux * up + c.rx * across, wy = c.uy * up + c.ry * across, wz = c.uz * up + c.rz * across;
    const ss = Ts[0] * Ts[0] + Ts[1] * Ts[1] + Ts[2] * Ts[2] || 1, aa = Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2] || 1;
    hold[i * 2] = getP1(c) + (wx * Ts[0] + wy * Ts[1] + wz * Ts[2]) / ss;
    hold[i * 2 + 1] = getP2(c) + (wx * Ta[0] + wy * Ta[1] + wz * Ta[2]) / aa;
  }
  function placeFoot(c, k) { placeLimb(c, 2 + k, -T.footDown, (k === 0 ? -1 : 1) * T.footOut); }
  /** Fresh holds all round (mounting, changing surface). */
  function regrip(c) {
    surface(c);
    placeLimb(c, 0, T.handUp, -T.handOut); placeLimb(c, 1, T.handUp, T.handOut);
    placeFoot(c, 0); placeFoot(c, 1);
    surface(c);
    c.cycle = HANG; c.cycleT = 0;
  }
  /** World positions of the holds; the reaching hand arcs off the surface toward its new hold;
   *  while the Warden heaves the feet lose their holds and hang. */
  function writeHolds(c) {
    const p1 = getP1(c), p2 = getP2(c), x = c.x, y = c.y, z = c.z;
    const nx = -c.fx, ny = -c.fy, nz = -c.fz;
    bumps = true;
    for (let i = 0; i < 4; i++) {
      setP(c, hold[i * 2], hold[i * 2 + 1]); evalSurface(c);
      holdW[i * 3] = P[0]; holdW[i * 3 + 1] = P[1]; holdW[i * 3 + 2] = P[2];
    }
    bumps = false;
    setP(c, p1, p2); surface(c);
    c.x = x; c.y = y; c.z = z;
    if (c.cycle === REACH) {
      const k = Math.min(1, c.cycleT / T.reachTime), e = k * k * (3 - 2 * k), lift = 0.2 * Math.sin(Math.PI * k), o = c.lead * 3;
      holdW[o] = reachFrom[0] + (holdW[o] - reachFrom[0]) * e + nx * lift;
      holdW[o + 1] = reachFrom[1] + (holdW[o + 1] - reachFrom[1]) * e + ny * lift;
      holdW[o + 2] = reachFrom[2] + (holdW[o + 2] - reachFrom[2]) * e + nz * lift;
    }
    c.feetFree = c.mode !== PILLAR && warden.shaking;
  }

  /** Grab the nearest leg within reach of the Wraith's chest. */
  function tryMount(c) {
    if (pillars !== null && tryMountPillar(c)) return;
    if (!warden.active || warden.state === 4 || warden.state === 5) return;
    const b = warden.body, cx = c.px, cy = c.py + 1.1, cz = c.pz;
    let best = -1, bestD = 1e9, bestU = 0, bestA = 0;
    for (let l = 0; l < SH.legs.length; l++) {
      for (let seg = 0; seg < 2; seg++) {
        // seg 0: foot → knee (u 0..0.5), seg 1: knee → hip (u 0.5..1).
        const ax = seg ? b.kx[l] : b.fx[l], ay = seg ? b.ky[l] : b.fy[l], az = seg ? b.kz[l] : b.fz[l];
        const bx = seg ? b.px[l] : b.kx[l], by = seg ? b.py[l] : b.ky[l], bz = seg ? b.pz[l] : b.kz[l];
        const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez || 1;
        let t = ((cx - ax) * ex + (cy - ay) * ey + (cz - az) * ez) / ee; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + ex * t, qy = ay + ey * t, qz = az + ez * t;
        const d = Math.hypot(cx - qx, cy - qy, cz - qz) - legRadius(l, seg * 0.5 + t * 0.5);
        if (d < bestD) { bestD = d; best = l; bestU = seg * 0.5 + t * 0.5; bestA = Math.atan2(cz - qz, cx - qx); }
      }
    }
    if (best < 0 || bestD > T.reach) return;
    c.mode = LEG; c.leg = best; c.u = Math.max(0.06, bestU); c.a = bestA; c.phase = 0;
    // Mount with the feet clear of the snow (grabbing the leg low means reaching up it).
    if (ground !== null) for (let k = 0; k < 20; k++) { surface(c); if (!feetBelowGround(c)) break; c.u += 0.03; }
    warden.climbed = true;
    regrip(c);
    c.grabbed = true; c.gx = holdW[0]; c.gy = holdW[1]; c.gz = holdW[2];
  }

  /** Grab a risen pillar within reach (its shaft below the capital). */
  function tryMountPillar(c) {
    const cx = c.px, cy = c.py + 1.1, cz = c.pz;
    for (let k = 0; k < pillars.n; k++) {
      if (pillars.up[k] < 1) continue;
      const dx = cx - pillars.x[k], dz = cz - pillars.z[k], d = Math.hypot(dx, dz) - pillars.r;
      const h = cy - pillars.y0[k];
      if (d > T.reach || h < 0 || h > pillars.h[k] - 0.6) continue;
      c.mode = PILLAR; c.pillar = k; c.th = Math.atan2(dz, dx); c.s = Math.max(1, c.py + 0.85 - pillars.y0[k]); c.phase = 0;
      if (ground !== null) for (let q = 0; q < 20; q++) { surface(c); if (!feetBelowGround(c)) break; c.s += 0.1; }
      regrip(c);
      c.grabbed = true; c.gx = holdW[0]; c.gy = holdW[1]; c.gz = holdW[2];
      return true;
    }
    return false;
  }

  function feetBelowGround(c) {
    const fx = c.x - c.ux * T.footClear, fy = c.y - c.uy * T.footClear, fz = c.z - c.uz * T.footClear;
    ground.qx = fx; ground.qz = fz; ground.sample();
    return fy < ground.h + 0.05;
  }

  function letGo(c, why) {
    surface(c);
    // Thrown: flung outward and up; let go/slipped: drop away from the surface.
    const sp = why === 1 ? T.throwSpeed : T.dropSpeed;
    c.vx = -c.fx * sp + c.vx * 0.5; c.vy = (why === 1 ? 4 : 0.5) + c.vy * 0.5; c.vz = -c.fz * sp + c.vz * 0.5;
    if (c.mode !== PILLAR) warden.climbed = false;
    c.mode = 0; c.fell = why; c.nearJoint = -1; c._cx = 0; c._cy = 0; c._cz = 0;
  }

  // Continuous through the knee (a step there would trap the climber: every move would project
  // onto the jump instead of along the leg).
  // Radii follow the chunk rig's proportions (rig.js: leg chunks ≈ w across, torso ≈ girth).
  function legRadius(l, u) { const w = SH.hip * WARDEN_RIG.leg, t = Math.min(1, Math.max(0, (u - 0.35) / 0.3)); return w * (0.42 + 0.08 * t * t * (3 - 2 * t)); }
  function bodyRadius(s) { const t = Math.min(1, s / (SH.spine - 2)), G = WARDEN_RIG.girth; return SH.hip * (G - 0.12 * G / 0.44 * t) * 0.9; }

  /** Point and normal on the surface at the climber's parameters → P, N (and the frame on c). */
  function surface(c) {
    evalSurface(c);
    frame(c);
  }
  /** Point and normal only → P, N. */
  function evalSurface(c) {
    const b = warden.body;
    if (c.mode === PILLAR) {
      // A vertical column: the carved bands stand a little proud (holds) of the smooth shaft.
      const k = c.pillar, ct = Math.cos(c.th), st = Math.sin(c.th);
      const R = pillars.r + (bumps ? 0.06 : 0.12);
      P[0] = pillars.x[k] + ct * R; P[1] = pillars.y0[k] + c.s; P[2] = pillars.z[k] + st * R;
      N[0] = ct; N[1] = 0; N[2] = st;
      return;
    }
    if (c.mode === LEG) {
      const l = c.leg, u = c.u;
      // Axis point along foot → knee → hip.
      let ax, ay, az, ex, ey, ez;
      if (u < 0.5) { const t = u / 0.5; ax = b.fx[l] + (b.kx[l] - b.fx[l]) * t; ay = b.fy[l] + (b.ky[l] - b.fy[l]) * t; az = b.fz[l] + (b.kz[l] - b.fz[l]) * t; ex = b.kx[l] - b.fx[l]; ey = b.ky[l] - b.fy[l]; ez = b.kz[l] - b.fz[l]; }
      else { const t = (u - 0.5) / 0.5; ax = b.kx[l] + (b.px[l] - b.kx[l]) * t; ay = b.ky[l] + (b.py[l] - b.ky[l]) * t; az = b.kz[l] + (b.pz[l] - b.kz[l]) * t; ex = b.px[l] - b.kx[l]; ey = b.py[l] - b.ky[l]; ez = b.pz[l] - b.kz[l]; }
      let el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      // Round the knee: the axis direction turns smoothly from the shin's to the thigh's over
      // u 0.38–0.62 (a hard switch flips the radial direction across the crease: a snap).
      if (u > 0.38 && u < 0.62) {
        let sx = b.kx[l] - b.fx[l], sy = b.ky[l] - b.fy[l], sz = b.kz[l] - b.fz[l];
        let tx = b.px[l] - b.kx[l], ty = b.py[l] - b.ky[l], tz = b.pz[l] - b.kz[l];
        const sl = Math.hypot(sx, sy, sz) || 1, tl = Math.hypot(tx, ty, tz) || 1;
        sx /= sl; sy /= sl; sz /= sl; tx /= tl; ty /= tl; tz /= tl;
        const k = (u - 0.38) / 0.24, w = k * k * (3 - 2 * k);
        ex = sx + (tx - sx) * w; ey = sy + (ty - sy) * w; ez = sz + (tz - sz) * w;
        el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      }
      // Radial direction at angle a (a measured around the axis from world +x, projected).
      let rx = Math.cos(c.a), ry = 0, rz = Math.sin(c.a);
      const d = rx * ex + ry * ey + rz * ez; rx -= ex * d; ry -= ey * d; rz -= ez * d;
      const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      // The visible surface along the ray: where it leaves the outermost chunk (bumps are
      // holds), never inside the smooth tube.
      const tr = legRadius(l, u);
      let R = tr + T.bump;
      if (bumps) {
        warden.rox = ax; warden.roy = ay; warden.roz = az; warden.rdx = rx; warden.rdy = ry; warden.rdz = rz;
        warden.rnear = tr + 0.4; warden.rfar = tr + T.bumpReach;
        const to = warden.rayOut(); R = to > tr ? to : tr;
      }
      P[0] = ax + rx * R; P[1] = ay + ry * R; P[2] = az + rz * R; N[0] = rx; N[1] = ry; N[2] = rz;
    } else {
      const S = SH.spine;
      const s = Math.min(S - 1, Math.max(0, c.s)), i = Math.min(S - 2, Math.floor(s)), t = s - i;
      const cx = b.sx[i] + (b.sx[i + 1] - b.sx[i]) * t, cy = b.sy[i] + (b.sy[i + 1] - b.sy[i]) * t, cz = b.sz[i] + (b.sz[i + 1] - b.sz[i]) * t;
      // Body frame at s: forward (toward the head) from the spine half a segment either side —
      // continuous across the joints (one segment's direction flips at each: a snap).
      const sa = Math.max(0, s - 0.5), sb = Math.min(S - 1, s + 0.5);
      const ia = Math.min(S - 2, Math.floor(sa)), ta = sa - ia, ib = Math.min(S - 2, Math.floor(sb)), tb = sb - ib;
      let fx = (b.sx[ia] + (b.sx[ia + 1] - b.sx[ia]) * ta) - (b.sx[ib] + (b.sx[ib + 1] - b.sx[ib]) * tb);
      let fy = (b.sy[ia] + (b.sy[ia + 1] - b.sy[ia]) * ta) - (b.sy[ib] + (b.sy[ib + 1] - b.sy[ib]) * tb);
      let fz = (b.sz[ia] + (b.sz[ia + 1] - b.sz[ia]) * ta) - (b.sz[ib] + (b.sz[ib + 1] - b.sz[ib]) * tb);
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let ux = -fx * fy, uy = 1 - fy * fy, uz = -fz * fy;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
      const st = Math.sin(c.th), ct = Math.cos(c.th);
      N[0] = rx * st + ux * ct; N[1] = ry * st + uy * ct; N[2] = rz * st + uz * ct;
      const tr = bodyRadius(s);
      let R = tr + T.bump;
      if (bumps) {
        warden.rox = cx; warden.roy = cy; warden.roz = cz; warden.rdx = N[0]; warden.rdy = N[1]; warden.rdz = N[2];
        warden.rnear = tr + 0.4; warden.rfar = tr + T.bumpReach;
        const to = warden.rayOut(); R = to > tr ? to : tr;
      }
      P[0] = cx + N[0] * R; P[1] = cy + N[1] * R; P[2] = cz + N[2] * R;
    }
  }
  function frame(c) {
    const b = warden.body;
    // The climber's frame: into the surface; up = world up along the surface (or, on top, toward
    // the head); right = up × forward (left-handed, as the body frame).
    c.fx = -N[0]; c.fy = -N[1]; c.fz = -N[2];
    let ux = -N[0] * N[1], uy = 1 - N[1] * N[1], uz = -N[2] * N[1];
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 0.25) {
      // On top: "up the climb" is toward the head.
      const S = SH.spine;
      ux = b.sx[0] - b.sx[S - 1]; uy = b.sy[0] - b.sy[S - 1]; uz = b.sz[0] - b.sz[S - 1];
      const d = ux * N[0] + uy * N[1] + uz * N[2]; ux -= N[0] * d; uy -= N[1] * d; uz -= N[2] * d;
      ul = Math.hypot(ux, uy, uz) || 1;
    }
    c.ux = ux / ul; c.uy = uy / ul; c.uz = uz / ul;
    c.rx = c.uy * c.fz - c.uz * c.fy; c.ry = c.uz * c.fx - c.ux * c.fz; c.rz = c.ux * c.fy - c.uy * c.fx;
    // A/D follow the camera's sense of left and right.
    if (c.rx * c.crx + c.rz * c.crz < 0) { c.rx = -c.rx; c.ry = -c.ry; c.rz = -c.rz; }
    c.x = P[0] + N[0] * T.standoff; c.y = P[1] + N[1] * T.standoff; c.z = P[2] + N[2] * T.standoff;
  }

  /** dP/d(param) for the two surface parameters (numeric) → Ts (along), Ta (around). */
  function tangents(c) {
    const h = 0.01, s0 = c.mode === LEG ? c.u : c.s, a0 = c.mode === LEG ? c.a : c.th;
    const x0 = P[0], y0 = P[1], z0 = P[2];
    if (c.mode === LEG) c.u = s0 + h; else c.s = s0 + h;
    surface(c); Ts[0] = (P[0] - x0) / h; Ts[1] = (P[1] - y0) / h; Ts[2] = (P[2] - z0) / h;
    if (c.mode === LEG) { c.u = s0; c.a = a0 + h; } else { c.s = s0; c.th = a0 + h; }
    surface(c); Ta[0] = (P[0] - x0) / h; Ta[1] = (P[1] - y0) / h; Ta[2] = (P[2] - z0) / h;
    if (c.mode === LEG) c.a = a0; else c.th = a0;
    surface(c);
  }

  /** Leg → flank at the hip; flank → leg at its attachment; the ends of the climbable surface. */
  function transitions(c) {
    if (c.mode === PILLAR) {
      // At the capital: mantle onto the top (the owner stands the Wraith there).
      if (c.s >= pillars.h[c.pillar] - 1.05) {
        const k = c.pillar, ct = Math.cos(c.th), st = Math.sin(c.th);
        c.topX = pillars.x[k] + ct * 1.2; c.topY = pillars.y0[k] + pillars.h[k]; c.topZ = pillars.z[k] + st * 1.2;
        c.vx = 0; c.vy = 0; c.vz = 0;
        c.mode = 0; c.fell = 4; c.nearJoint = -1; c._cx = 0; c._cy = 0; c._cz = 0;
        return;
      }
      if (c.s < 0.6) c.s = 0.6;
      return;
    }
    const legs = SH.legs;
    if (c.mode === LEG) {
      if (c.u >= 1) {
        // Onto the flank at the hip: the body point nearest the climber (not a fixed spot).
        const leg = legs[c.leg], x = c.x, y = c.y, z = c.z;
        c.mode = BODY;
        let bd = 1e18, bs = leg.at, bt = leg.side * 1.95;
        for (let ss = leg.at - 1; ss <= leg.at + 1.001; ss += 0.1) for (let t = -2.1; t <= 2.101; t += 0.05) {
          c.s = Math.min(SH.spine - 1, Math.max(0, ss)); c.th = t; evalSurface(c);
          const d = (P[0] + N[0] * T.standoff - x) ** 2 + (P[1] + N[1] * T.standoff - y) ** 2 + (P[2] + N[2] * T.standoff - z) ** 2;
          if (d < bd) { bd = d; bs = c.s; bt = t; }
        }
        c.s = bs; c.th = bt;
      } else if (c.u < 0.04) letGo(c, 2);
      return;
    }
    // Body: the belly is not climbable; at the lower flank over a leg, step down onto it.
    if (Math.abs(c.th) > 2.15) {
      for (let l = 0; l < legs.length; l++) {
        if (Math.abs(c.s - legs[l].at) < 0.7 && Math.sign(c.th) === legs[l].side) {
          // Down onto the leg: its point nearest the climber.
          const x = c.x, y = c.y, z = c.z;
          c.mode = LEG; c.leg = l;
          let bd = 1e18, bu = 0.96, ba = 0;
          for (let u = 0.7; u <= 0.981; u += 0.03) for (let a = 0; a < 6.283; a += 0.1) {
            c.u = u; c.a = a; evalSurface(c);
            const d = (P[0] + N[0] * T.standoff - x) ** 2 + (P[1] + N[1] * T.standoff - y) ** 2 + (P[2] + N[2] * T.standoff - z) ** 2;
            if (d < bd) { bd = d; bu = u; ba = a; }
          }
          c.u = bu; c.a = ba;
          return;
        }
      }
      c.th = Math.sign(c.th) * 2.15;
    }
    c.s = Math.min(SH.spine - 1, Math.max(0, c.s));
  }

  return self;
}
