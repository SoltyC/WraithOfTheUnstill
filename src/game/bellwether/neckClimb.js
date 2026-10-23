// Climbing the Bellwether's neck: the same hold-to-hold climb as the Warden's (game/warden/climb.js)
// on a tube surface, here the neck's own (s along the spine, th round it; th 0 = the dorsal top).
// The Wraith holds a position in those parameters, so it rides every sway, inhale and thrash
// exactly. W/S climb toward the head / the shoulders, A/D round the neck; gripping spends focus
// and SHAKE spends a great deal more (out of focus: thrown off). Reaching a valve within ~3 m sets
// `nearValve` (the owner opens it with bell.openValve(k)). Same output fields as the Warden's climb
// so the climb system can drive either. Allocation-free.

import { NECK_SEGS, neckRadius, VALVES } from './bellwether.js';

export const neckTuning = {
  stride: 0.9, reachTime: 0.24, pullTime: 0.34, beat: 0.06,
  reach: 2.5,            // m beyond the neck's surface the Wraith can grab from
  standoff: 0.3,
  handUp: 0.92, handOut: 0.24, footDown: 0.7, footOut: 0.17,
  drainIdle: 1.5, drainMove: 5, drainShake: 26,   // focus per second
  throwSpeed: 7, dropSpeed: 2.5,
  valveReach: 5,         // m: a valve is within the owner's reach
  ease: 7,
  footClear: 0.85,
  thMax: 2.3,            // the throat side beyond this is not climbable (an overhang)
  sMin: 0.4, sMax: NECK_SEGS - 0.8,
  maxSpeed: 14,
};

const NECK = 1;
export const NECK_MODE = { NECK };
const HANG = 0, REACH = 1, PULL = 2;

/** @param {{ bell: any, ground?: any }} ctx */
export function createNeckClimb(ctx) {
  const { bell } = ctx;
  const T = neckTuning;
  const Ts = new Float64Array(3), Ta = new Float64Array(3);
  const P = new Float64Array(3), Nn = new Float64Array(3), Tt = new Float64Array(3);
  const hold = new Float64Array(8), holdW = new Float64Array(12), reachFrom = new Float64Array(3);
  
  const self = {
    /** 0 none, 1 NECK. */
    mode: 0,
    /** Along the neck (0 base … NECK_SEGS head) and round it (0 top). */
    s: 0.5, th: 0.5,
    x: 0.5, y: 0.5, z: 0.5, rx: 0.5, ry: 0.5, rz: 0.5, ux: 0.5, uy: 0.5, uz: 0.5, fx: 0.5, fy: 0.5, fz: 0.5,
    vx: 0.5, vy: 0.5, vz: 0.5, phase: 0.5, blend: 0.5 - 0.5,
    grip: false, holds: holdW, feetFree: false,
    cycle: HANG, cycleT: 0.5 - 0.5, lead: 0,
    grabbed: false, gx: 0.5, gy: 0.5, gz: 0.5,
    /** Valve within reach (0..2) or -1. */
    nearValve: -1,
    /** Events this frame: 1 thrown off, 2 let go, 3 slipped (no focus). */
    fell: 0,
    mx: 0.5 - 0.5, mz: 0.5 - 0.5, crx: 1.5 - 0.5, crz: 0.5 - 0.5, px: 0.5, py: 0.5, pz: 0.5, dt: 0.5,
    spend: null,
    _f1: 0.5, _f2: 0.5, _t1: 0.5, _t2: 0.5, _feetMoved: 0,
    get climbing() { return this.mode !== 0; },
    regrip() { if (this.mode) { regrip(this); writeHolds(this); this.blend = 1; } },

    update() {
      const dt = this.dt;
      this.fell = 0; this.grabbed = false;
      if (this.mode !== 0 && !bell.active) { letGo(this, 2); this.blend = Math.max(0, this.blend - dt * T.ease); return; }
      if (this.mode === 0) {
        this.blend = Math.max(0, this.blend - dt * T.ease);
        this.nearValve = -1;
        if (this.grip) tryMount(this);
        if (this.mode === 0) return;
      }
      if (!this.grip) { letGo(this, 2); return; }
      const wants = Math.abs(this.mx) + Math.abs(this.mz) > 0.1;
      const shaking = bell.shaking > 0.3;
      const cost = (this.cycle !== HANG ? T.drainMove : T.drainIdle) + (shaking ? T.drainShake * bell.shaking : 0);
      if (!this.spend(cost * dt)) { letGo(this, shaking ? 1 : 3); return; }
      const ox = this.x, oy = this.y, oz = this.z;
      this.cycleT += dt;
      if (this.cycle === HANG) {
        if (wants && !shaking && this.cycleT >= T.beat) startMove(this);
      } else if (this.cycle === REACH) {
        if (this.cycleT >= T.reachTime) {
          this.cycle = PULL; this.cycleT = 0; this.grabbed = true;
          const o = this.lead * 3; this.gx = holdW[o]; this.gy = holdW[o + 1]; this.gz = holdW[o + 2];
        }
      } else {
        const k = Math.min(1, this.cycleT / T.pullTime), e = k * k * (3 - 2 * k);
        this.s = this._f1 + (this._t1 - this._f1) * e; this.th = this._f2 + (this._t2 - this._f2) * e;
        if (k > 0.45 && this._feetMoved < 1) { placeLimb(this, 2, -T.footDown, -T.footOut); this._feetMoved = 1; }
        if (k > 0.75 && this._feetMoved < 2) { placeLimb(this, 3, -T.footDown, T.footOut); this._feetMoved = 2; }
        this.phase += dt * 6;
        if (k >= 1) {
          this.cycle = HANG; this.cycleT = 0; this.lead = 1 - this.lead;
          if (this.s < T.sMin) { this.s = T.sMin; if (this.mz < 0) { letGo(this, 2); return; } }
          if (this.s > T.sMax) this.s = T.sMax;
          this.th = Math.max(-T.thMax, Math.min(T.thMax, this.th));
        }
      }
      surface(this);
      // Climbing down to the floor steps off.
      if (feetBelowFloor(this)) { letGo(this, 2); this.vx = 0; this.vy = 0; this.vz = 0; return; }
      writeHolds(this);
      this.blend = Math.min(1, this.blend + dt * T.ease);
      const idt = dt > 0 ? 1 / dt : 0;
      let vx = (this.x - ox) * idt, vy = (this.y - oy) * idt, vz = (this.z - oz) * idt;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > T.maxSpeed) { const k = T.maxSpeed / sp; vx *= k; vy *= k; vz *= k; }
      this.vx = vx; this.vy = vy; this.vz = vz;
      // A valve in reach?
      this.nearValve = -1;
      const V = bell.valves;
      let best = T.valveReach;
      for (let k = 0; k < VALVES; k++) {
        if (V.open[k]) continue;
        const d = Math.hypot(V.x[k] - this.x, V.y[k] - this.y, V.z[k] - this.z);
        if (d < best) { best = d; this.nearValve = k; }
      }
    },
  };

  /** Point/normal/tangent at (s, th) → P, Nn, Tt. */
  function evalAt(s, th) {
    bell.neckEval(s, th, 0.0);
    P[0] = bell.sp[0]; P[1] = bell.sp[1]; P[2] = bell.sp[2];
    Nn[0] = bell.sn[0]; Nn[1] = bell.sn[1]; Nn[2] = bell.sn[2];
    Tt[0] = bell.st[0]; Tt[1] = bell.st[1]; Tt[2] = bell.st[2];
  }
  /** The climber's frame at its parameters: into the surface, up the climb (toward the head), right. */
  function surface(c) {
    evalAt(c.s, c.th);
    c.fx = -Nn[0]; c.fy = -Nn[1]; c.fz = -Nn[2];
    let ux = Tt[0], uy = Tt[1], uz = Tt[2];
    const d = ux * Nn[0] + uy * Nn[1] + uz * Nn[2]; ux -= Nn[0] * d; uy -= Nn[1] * d; uz -= Nn[2] * d;
    const ul = Math.hypot(ux, uy, uz) || 1;
    c.ux = ux / ul; c.uy = uy / ul; c.uz = uz / ul;
    c.rx = c.uy * c.fz - c.uz * c.fy; c.ry = c.uz * c.fx - c.ux * c.fz; c.rz = c.ux * c.fy - c.uy * c.fx;
    if (c.rx * c.crx + c.rz * c.crz < 0) { c.rx = -c.rx; c.ry = -c.ry; c.rz = -c.rz; }
    c.x = P[0] + Nn[0] * T.standoff; c.y = P[1] + Nn[1] * T.standoff; c.z = P[2] + Nn[2] * T.standoff;
  }
  /** dP/ds and dP/dth (numeric) → Ts, Ta; leaves the surface evaluated at the climber. */
  function tangents(c) {
    const h = 0.02;
    evalAt(c.s, c.th); const x0 = P[0], y0 = P[1], z0 = P[2];
    evalAt(c.s + h, c.th); Ts[0] = (P[0] - x0) / h; Ts[1] = (P[1] - y0) / h; Ts[2] = (P[2] - z0) / h;
    evalAt(c.s, c.th + h); Ta[0] = (P[0] - x0) / h; Ta[1] = (P[1] - y0) / h; Ta[2] = (P[2] - z0) / h;
    surface(c);
  }

  function startMove(c) {
    surface(c); tangents(c);
    const m = Math.hypot(c.mx, c.mz) || 1;
    const dx = (c.ux * c.mz + c.rx * c.mx) / m * T.stride, dy = (c.uy * c.mz + c.ry * c.mx) / m * T.stride, dz = (c.uz * c.mz + c.rz * c.mx) / m * T.stride;
    const ss = Ts[0] * Ts[0] + Ts[1] * Ts[1] + Ts[2] * Ts[2] || 1, aa = Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2] || 1;
    const d1 = (dx * Ts[0] + dy * Ts[1] + dz * Ts[2]) / ss, d2 = (dx * Ta[0] + dy * Ta[1] + dz * Ta[2]) / aa;
    c._f1 = c.s; c._f2 = c.th;
    c._t1 = Math.max(T.sMin - 0.3, Math.min(T.sMax, c.s + d1));
    c._t2 = Math.max(-T.thMax, Math.min(T.thMax, c.th + d2));
    c._feetMoved = 0;
    const o = c.lead * 3;
    reachFrom[0] = holdW[o]; reachFrom[1] = holdW[o + 1]; reachFrom[2] = holdW[o + 2];
    const s0 = c.s, t0 = c.th;
    c.s = c._t1; c.th = c._t2; surface(c);
    placeLimb(c, c.lead, T.handUp, (c.lead === 0 ? -1 : 1) * T.handOut);
    c.s = s0; c.th = t0; surface(c);
    c.cycle = REACH; c.cycleT = 0;
  }
  /** Hold for limb i at (up, across) metres from the pelvis, in the surface's parameters. */
  function placeLimb(c, i, up, across) {
    tangents(c);
    const wx = c.ux * up + c.rx * across, wy = c.uy * up + c.ry * across, wz = c.uz * up + c.rz * across;
    const ss = Ts[0] * Ts[0] + Ts[1] * Ts[1] + Ts[2] * Ts[2] || 1, aa = Ta[0] * Ta[0] + Ta[1] * Ta[1] + Ta[2] * Ta[2] || 1;
    hold[i * 2] = c.s + (wx * Ts[0] + wy * Ts[1] + wz * Ts[2]) / ss;
    hold[i * 2 + 1] = c.th + (wx * Ta[0] + wy * Ta[1] + wz * Ta[2]) / aa;
  }
  function regrip(c) {
    surface(c);
    placeLimb(c, 0, T.handUp, -T.handOut); placeLimb(c, 1, T.handUp, T.handOut);
    placeLimb(c, 2, -T.footDown, -T.footOut); placeLimb(c, 3, -T.footDown, T.footOut);
    surface(c);
    c.cycle = HANG; c.cycleT = 0;
  }
  function writeHolds(c) {
    const s0 = c.s, t0 = c.th, x = c.x, y = c.y, z = c.z;
    const nx = -c.fx, ny = -c.fy, nz = -c.fz;
    for (let i = 0; i < 4; i++) {
      const hs = Math.max(0, Math.min(NECK_SEGS, hold[i * 2]));
      // Hands find the crags a hair proud of the smooth tube.
      bell.neckEval(hs, hold[i * 2 + 1], 0.08);
      holdW[i * 3] = bell.sp[0]; holdW[i * 3 + 1] = bell.sp[1]; holdW[i * 3 + 2] = bell.sp[2];
    }
    c.s = s0; c.th = t0; surface(c);
    c.x = x; c.y = y; c.z = z;
    if (c.cycle === REACH) {
      const k = Math.min(1, c.cycleT / T.reachTime), e = k * k * (3 - 2 * k), lift = 0.2 * Math.sin(Math.PI * k), o = c.lead * 3;
      holdW[o] = reachFrom[0] + (holdW[o] - reachFrom[0]) * e + nx * lift;
      holdW[o + 1] = reachFrom[1] + (holdW[o + 1] - reachFrom[1]) * e + ny * lift;
      holdW[o + 2] = reachFrom[2] + (holdW[o + 2] - reachFrom[2]) * e + nz * lift;
    }
    c.feetFree = bell.shaking > 0.3;
  }

  function feetBelowFloor(c) {
    const fy = c.y - c.uy * T.footClear;
    return fy < bell.floorY + 0.05;
  }

  /** Grab the neck wherever the Wraith's chest is within reach of its surface. */
  function tryMount(c) {
    if (!bell.active) return;
    const cx = c.px, cy = c.py + 1.1, cz = c.pz;
    let bestS = -1, bestD = 1e9, bestTh = 0;
    for (let s = 0.5; s <= NECK_SEGS - 0.99; s += 0.25) {
      bell.neckEval(s, 0, 0);
      const ax = cx - bell.sc[0], ay = cy - bell.sc[1], az = cz - bell.sc[2];
      const d = Math.hypot(ax, ay, az) - neckRadius(s);
      if (d < bestD) {
        bestD = d; bestS = s;
        // The angle round the neck from the top (u) toward the right (r): from the frame at s.
        const u = bell.sn, ux = u[0], uy = u[1], uz = u[2];   // th = 0 normal is the up vector
        bell.neckEval(s, Math.PI / 2, 0);
        const rx = bell.sn[0], ry = bell.sn[1], rz = bell.sn[2];
        bestTh = Math.atan2(ax * rx + ay * ry + az * rz, ax * ux + ay * uy + az * uz);
      }
    }
    if (bestS < 0 || bestD > T.reach) return;
    c.mode = NECK; c.s = Math.max(T.sMin + 0.2, bestS); c.th = Math.max(-T.thMax, Math.min(T.thMax, bestTh)); c.phase = 0;
    // Mount with the feet clear of the floor (grabbing it low means reaching up it).
    for (let k = 0; k < 20; k++) { surface(c); if (!feetBelowFloor(c)) break; c.s = Math.min(T.sMax, c.s + 0.1); }
    bell.climbed = true;
    regrip(c);
    c.grabbed = true; c.gx = holdW[0]; c.gy = holdW[1]; c.gz = holdW[2];
  }

  function letGo(c, why) {
    surface(c);
    const sp = why === 1 ? T.throwSpeed : T.dropSpeed;
    c.vx = -c.fx * sp + c.vx * 0.5; c.vy = (why === 1 ? 4 : 0.5) + c.vy * 0.5; c.vz = -c.fz * sp + c.vz * 0.5;
    bell.climbed = false;
    c.mode = 0; c.fell = why; c.nearValve = -1;
  }

  return self;
}
