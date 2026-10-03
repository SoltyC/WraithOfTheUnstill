// Climbing the Warden (BRIEF §8.4, in the spirit of Shadow of the Colossus). The Wraith grips the
// Warden's frost-crusted surface — its legs (tubes along foot → knee → hip) and its body (a tube
// around the spine) — and holds a position in that surface's own parameters, so it rides every
// step, buck and kneel exactly. W/S climb up and down the surface, A/D across it; a leg hands
// off onto the flank at the hip, the flank back onto a leg. Gripping spends focus; the Warden
// bucks to throw the Wraith off, which only a full grip survives. Mounting, shifting holds and
// being thrown off all ease (the pose blends; the fall is real momentum). Allocation-free.

import { WARDEN_SHAPE, WARDEN_RIG } from './warden.js';

export const climbTuning = {
  speed: 1.7,            // m/s along the surface
  reach: 1.4,            // m beyond a leg's surface the Wraith can grab from
  standoff: 0.42,        // m: pelvis off the surface
  drainIdle: 1.5, drainMove: 5, drainShake: 26,   // focus per second
  throwSpeed: 7, dropSpeed: 2.5,
  jointReach: 3.2,       // m: a back joint is within reach
  ease: 7,               // 1/s: pose blend on mount/dismount
};

const LEG = 1, BODY = 2;

/**
 * @param {{ warden: any }} ctx
 */
export function createClimb(ctx) {
  const { warden } = ctx;
  const T = climbTuning, SH = WARDEN_SHAPE;
  // Scratch (no allocation per frame).
  const P = new Float64Array(3), N = new Float64Array(3), Ts = new Float64Array(3), Ta = new Float64Array(3);
  const self = {
    /** 0 none, LEG, BODY. */
    mode: 0, leg: 0, u: 0.5, a: 0.5, s: 0.5, th: 0.5,
    /** Outputs: pelvis, surface frame (right, up-the-climb, into-surface), surface velocity. */
    x: 0.5, y: 0.5, z: 0.5, rx: 0.5, ry: 0.5, rz: 0.5, ux: 0.5, uy: 0.5, uz: 0.5, fx: 0.5, fy: 0.5, fz: 0.5,
    vx: 0.5, vy: 0.5, vz: 0.5, phase: 0.5, blend: 0.5 - 0.5,
    /** Back joint within reach (2, 3) or −1. */
    nearJoint: -1,
    /** Events this frame: 1 thrown off, 2 let go, 3 slipped (no focus). */
    fell: 0,
    /** Inputs (fields): grip held, move (mx right, mz up), camera right (crx, crz), feet pos, dt,
     *  focus available (the owner spends it through spend()). */
    grip: false, mx: 0.5 - 0.5, mz: 0.5 - 0.5, crx: 1.5 - 0.5, crz: 0.5 - 0.5, px: 0.5, py: 0.5, pz: 0.5, dt: 0.5,
    spend: null,

    get climbing() { return this.mode !== 0; },

    update() {
      const dt = this.dt;
      this.fell = 0;
      if (!warden.active || warden.state >= 4) { if (this.mode) letGo(this, 2); this.blend = Math.max(0, this.blend - dt * T.ease); return; }
      if (this.mode === 0) {
        this.blend = Math.max(0, this.blend - dt * T.ease);
        if (this.grip) tryMount(this);
        if (this.mode === 0) return;
      }
      if (!this.grip) { letGo(this, 2); return; }
      // Grip costs focus; the Warden's bucking costs a great deal more. Out of focus: slip.
      const moving = Math.abs(this.mx) + Math.abs(this.mz) > 0.1;
      const cost = (moving ? T.drainMove : T.drainIdle) + (warden.shaking ? T.drainShake : 0);
      if (!this.spend(cost * dt)) { letGo(this, warden.shaking ? 1 : 3); return; }
      const ox = this.x, oy = this.y, oz = this.z;
      // Move in the surface's parameters: up/down the climb and across it.
      surface(this);
      if (moving) {
        const step = T.speed * dt;
        // Displacement in the world: along the climb's up and right.
        const dx = (this.ux * this.mz + this.rx * this.mx) * step, dy = (this.uy * this.mz + this.ry * this.mx) * step, dz = (this.uz * this.mz + this.rz * this.mx) * step;
        if (this.mode === LEG) {
          // Legs: straight along the axis (W up toward the hip) and around it (A/D), so a bent
          // knee's crease never traps the climber.
          const b = warden.body, l = this.leg;
          const len = Math.hypot(b.kx[l] - b.fx[l], b.ky[l] - b.fy[l], b.kz[l] - b.fz[l]) + Math.hypot(b.px[l] - b.kx[l], b.py[l] - b.ky[l], b.pz[l] - b.kz[l]);
          tangents(this);
          const aa = Math.sqrt(Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2]) || 1;
          const around = (Ta[0] * this.rx + Ta[1] * this.ry + Ta[2] * this.rz) >= 0 ? 1 : -1;
          this.u += this.mz * step / Math.max(len, 1);
          this.a += this.mx * step * around / aa;
        } else {
          tangents(this);
          const ss = Ts[0] * Ts[0] + Ts[1] * Ts[1] + Ts[2] * Ts[2] || 1, aa = Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2] || 1;
          this.s += (dx * Ts[0] + dy * Ts[1] + dz * Ts[2]) / ss; this.th += (dx * Ta[0] + dy * Ta[1] + dz * Ta[2]) / aa;
        }
        this.phase += dt * 6;
        transitions(this);
        if (this.mode === 0) return;
      }
      surface(this);
      this.blend = Math.min(1, this.blend + dt * T.ease);
      const idt = dt > 0 ? 1 / dt : 0;
      this.vx = (this.x - ox) * idt; this.vy = (this.y - oy) * idt; this.vz = (this.z - oz) * idt;
      // A back joint in reach?
      this.nearJoint = -1;
      for (let k = 2; k < 4; k++) {
        if (warden.joint[k] === 2) continue;
        if (Math.hypot(warden.jx[k] - this.x, warden.jy[k] - this.y, warden.jz[k] - this.z) < T.jointReach) this.nearJoint = k;
      }
    },
  };

  /** Grab the nearest leg within reach of the Wraith's chest. */
  function tryMount(c) {
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
    warden.climbed = true;
  }

  function letGo(c, why) {
    surface(c);
    // Thrown: flung outward and up; let go/slipped: drop away from the surface.
    const sp = why === 1 ? T.throwSpeed : T.dropSpeed;
    c.vx = -c.fx * sp + c.vx * 0.5; c.vy = (why === 1 ? 4 : 0.5) + c.vy * 0.5; c.vz = -c.fz * sp + c.vz * 0.5;
    c.mode = 0; c.fell = why; c.nearJoint = -1;
    warden.climbed = false;
  }

  // Continuous through the knee (a step there would trap the climber: every move would project
  // onto the jump instead of along the leg).
  // Radii follow the chunk rig's proportions (rig.js: leg chunks ≈ w across, torso ≈ girth).
  function legRadius(l, u) { const w = SH.hip * WARDEN_RIG.leg, t = Math.min(1, Math.max(0, (u - 0.35) / 0.3)); return w * (0.42 + 0.08 * t * t * (3 - 2 * t)); }
  function bodyRadius(s) { const t = Math.min(1, s / (SH.spine - 2)), G = WARDEN_RIG.girth; return SH.hip * (G - 0.12 * G / 0.44 * t) * 0.9; }

  /** Point and normal on the surface at the climber's parameters → P, N (and the frame on c). */
  function surface(c) {
    const b = warden.body;
    if (c.mode === LEG) {
      const l = c.leg, u = c.u;
      // Axis point along foot → knee → hip.
      let ax, ay, az, ex, ey, ez;
      if (u < 0.5) { const t = u / 0.5; ax = b.fx[l] + (b.kx[l] - b.fx[l]) * t; ay = b.fy[l] + (b.ky[l] - b.fy[l]) * t; az = b.fz[l] + (b.kz[l] - b.fz[l]) * t; ex = b.kx[l] - b.fx[l]; ey = b.ky[l] - b.fy[l]; ez = b.kz[l] - b.fz[l]; }
      else { const t = (u - 0.5) / 0.5; ax = b.kx[l] + (b.px[l] - b.kx[l]) * t; ay = b.ky[l] + (b.py[l] - b.ky[l]) * t; az = b.kz[l] + (b.pz[l] - b.kz[l]) * t; ex = b.px[l] - b.kx[l]; ey = b.py[l] - b.ky[l]; ez = b.pz[l] - b.kz[l]; }
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      // Radial direction at angle a (a measured around the axis from world +x, projected).
      let rx = Math.cos(c.a), ry = 0, rz = Math.sin(c.a);
      const d = rx * ex + ry * ey + rz * ez; rx -= ex * d; ry -= ey * d; rz -= ez * d;
      const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      const R = legRadius(l, u);
      P[0] = ax + rx * R; P[1] = ay + ry * R; P[2] = az + rz * R; N[0] = rx; N[1] = ry; N[2] = rz;
    } else {
      const S = SH.spine;
      const s = Math.min(S - 1, Math.max(0, c.s)), i = Math.min(S - 2, Math.floor(s)), t = s - i;
      const cx = b.sx[i] + (b.sx[i + 1] - b.sx[i]) * t, cy = b.sy[i] + (b.sy[i + 1] - b.sy[i]) * t, cz = b.sz[i] + (b.sz[i + 1] - b.sz[i]) * t;
      // Body frame at s: forward (toward the head), up ⟂ forward, right.
      let fx = b.sx[i] - b.sx[i + 1], fy = b.sy[i] - b.sy[i + 1], fz = b.sz[i] - b.sz[i + 1];
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let ux = -fx * fy, uy = 1 - fy * fy, uz = -fz * fy;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
      const R = bodyRadius(s), st = Math.sin(c.th), ct = Math.cos(c.th);
      N[0] = rx * st + ux * ct; N[1] = ry * st + uy * ct; N[2] = rz * st + uz * ct;
      P[0] = cx + N[0] * R; P[1] = cy + N[1] * R; P[2] = cz + N[2] * R;
    }
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
    const legs = SH.legs;
    if (c.mode === LEG) {
      if (c.u >= 1) {
        const leg = legs[c.leg];
        c.mode = BODY; c.s = leg.at; c.th = leg.side * 1.95;
      } else if (c.u < 0.04) letGo(c, 2);
      return;
    }
    // Body: the belly is not climbable; at the lower flank over a leg, step down onto it.
    if (Math.abs(c.th) > 2.15) {
      for (let l = 0; l < legs.length; l++) {
        if (Math.abs(c.s - legs[l].at) < 0.7 && Math.sign(c.th) === legs[l].side) {
          const b = warden.body;
          c.mode = LEG; c.leg = l; c.u = 0.96;
          c.a = Math.atan2(c.z - b.pz[l], c.x - b.px[l]);
          return;
        }
      }
      c.th = Math.sign(c.th) * 2.15;
    }
    c.s = Math.min(SH.spine - 1, Math.max(0, c.s));
  }

  return self;
}
