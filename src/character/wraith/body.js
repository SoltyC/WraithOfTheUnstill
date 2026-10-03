// The Wraith's kinematic body (BRIEF §8.1): a procedural skeleton driven by the gait. Pelvis from
// the gait, a torso that leans into speed and banks into turns, shoulders and a head, arms that
// swing against the legs (raised and bent when running), hands. Everything is in plain fields
// and typed arrays (allocation-free). The cloth pins and colliders are placed from this frame.
//
// Body-local frame: origin at the pelvis, +y up, +z forward, +x right. toWorld() applies yaw and
// the lean (pitch about the right axis) and bank (roll about forward).

import { GAIT } from './gait.js';

export class Body {
  constructor() {
    this.yaw = 0.5 - 0.5;
    this.lean = 0.5 - 0.5;     // forward pitch (rad), eased
    this.bank = 0.5 - 0.5;     // roll into turns (rad), eased
    this.prevYaw = 0.5 - 0.5;
    this.px = 0.5; this.py = 0.5; this.pz = 0.5;
    // Joints (world): chest, head, shoulders, elbows, hands (L = 0, R = 1).
    this.chest = new Float64Array(3); this.head = new Float64Array(3);
    this.sh = new Float64Array(6); this.el = new Float64Array(6); this.ha = new Float64Array(6);
    // Basis (world) of the leaned torso: right r, up u, forward f.
    this.r = new Float64Array(3); this.u = new Float64Array(3); this.f = new Float64Array(3);
    // Head basis (steadier than the torso).
    this.hr = new Float64Array(3); this.hu = new Float64Array(3); this.hf = new Float64Array(3);
    this.out = new Float64Array(3);
    this.dt = 0.5;
    /** Surf engagement 0..1 and the carve's lean (rad, + = into a right turn): inputs. */
    this.surf = 0.5 - 0.5; this.surfLean = 0.5 - 0.5;
    /** Bending gesture 0..1 (input): the right arm reaches out toward the verb. */
    this.cast = 0.5 - 0.5;
    /** Death: 0..1 collapse (the figure folds forward as it sinks). */
    this.collapse = 0.5 - 0.5;
    /** Climbing (inputs): when set, the torso frame comes from the surface — forward into it,
     *  up along the climb — and the arms reach up onto it, alternating with climbPhase. */
    this.climbing = false; this.climbPhase = 0.5 - 0.5; this.climbBlend = 1.5 - 0.5;
    this.cr = new Float64Array(3); this.cu = new Float64Array(3); this.cf = new Float64Array(3);
  }

  /** World position of body-local (lx, ly, lz) about the pelvis → this.out. */
  toWorld(lx, ly, lz) {
    const r = this.r, u = this.u, f = this.f, o = this.out;
    o[0] = this.px + r[0] * lx + u[0] * ly + f[0] * lz;
    o[1] = this.py + r[1] * lx + u[1] * ly + f[1] * lz;
    o[2] = this.pz + r[2] * lx + u[2] * ly + f[2] * lz;
  }
  /** World position of head-local (lx, ly, lz) about the head → this.out. */
  toHead(lx, ly, lz) {
    const r = this.hr, u = this.hu, f = this.hf, o = this.out, h = this.head;
    o[0] = h[0] + r[0] * lx + u[0] * ly + f[0] * lz;
    o[1] = h[1] + r[1] * lx + u[1] * ly + f[1] * lz;
    o[2] = h[2] + r[2] * lx + u[2] * ly + f[2] * lz;
  }

  /** @param {import('./gait.js').Gait} g */
  update(g) {
    const dt = this.dt;
    this.px = g.px; this.py = g.py; this.pz = g.pz;
    // Eased lean into speed and bank into turns.
    let dy = this.yaw - this.prevYaw;
    dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    const yawRate = dt > 0 ? dy / dt : 0;
    this.prevYaw = this.yaw;
    const k = 1 - Math.exp(-dt * 6);
    const sb = this.surf;
    this.lean += (0.05 + 0.035 * Math.min(g.speed, 6) + 0.12 * sb + 0.75 * this.collapse - this.lean) * k;
    const walkBank = Math.max(-0.25, Math.min(0.25, -yawRate * g.speed * 0.03));
    // Surfing: the whole figure leans into the carve (roll toward the inside of the turn).
    this.bank += (walkBank * (1 - sb) - this.surfLean * sb - this.bank) * (1 - Math.exp(-dt * 10));
    const sway = g.speed > 0.25 ? 0.035 * Math.sin(Math.PI * 2 * g.phase) : 0;
    // Torso basis: yaw, then lean (pitch forward), then bank + sway (roll).
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cl = Math.cos(this.lean), sl = Math.sin(this.lean);
    const roll = this.bank + sway, cr = Math.cos(roll), sr = Math.sin(roll);
    // Unrolled: right0 = (cy, 0, -sy), up0 = (sl·sy, cl, sl·cy) leaned forward, fwd0 = (cl·sy, -sl, cl·cy).
    const r0x = cy, r0y = 0, r0z = -sy;
    const u0x = sl * sy, u0y = cl, u0z = sl * cy;
    this.r[0] = r0x * cr + u0x * sr; this.r[1] = r0y * cr + u0y * sr; this.r[2] = r0z * cr + u0z * sr;
    this.u[0] = u0x * cr - r0x * sr; this.u[1] = u0y * cr - r0y * sr; this.u[2] = u0z * cr - r0z * sr;
    this.f[0] = cl * sy; this.f[1] = -sl; this.f[2] = cl * cy;
    if (this.climbing) {
      // Turn from upright to the surface over the mount (blend), keeping the frame orthonormal.
      const k = Math.min(1, Math.max(0, this.climbBlend));
      let ux = this.u[0] + (this.cu[0] - this.u[0]) * k, uy = this.u[1] + (this.cu[1] - this.u[1]) * k, uz = this.u[2] + (this.cu[2] - this.u[2]) * k;
      let fx = this.f[0] + (this.cf[0] - this.f[0]) * k, fy = this.f[1] + (this.cf[1] - this.f[1]) * k, fz = this.f[2] + (this.cf[2] - this.f[2]) * k;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const d = fx * ux + fy * uy + fz * uz; fx -= ux * d; fy -= uy * d; fz -= uz * d;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      this.u[0] = ux; this.u[1] = uy; this.u[2] = uz; this.f[0] = fx; this.f[1] = fy; this.f[2] = fz;
      this.r[0] = uy * fz - uz * fy; this.r[1] = uz * fx - ux * fz; this.r[2] = ux * fy - uy * fx;
    }
    // Chest and head.
    this.toWorld(0, 0.42, 0); this.chest[0] = this.out[0]; this.chest[1] = this.out[1]; this.chest[2] = this.out[2];
    this.toWorld(0, 0.74, 0.02); this.head[0] = this.out[0]; this.head[1] = this.out[1]; this.head[2] = this.out[2];
    // Head basis: half the lean, no sway (the head steadies itself).
    const hl = this.lean * 0.5, chl = Math.cos(hl), shl = Math.sin(hl);
    this.hr[0] = cy; this.hr[1] = 0; this.hr[2] = -sy;
    this.hu[0] = shl * sy; this.hu[1] = chl; this.hu[2] = shl * cy;
    this.hf[0] = chl * sy; this.hf[1] = -shl; this.hf[2] = chl * cy;
    if (this.climbing) {
      // The head looks up the surface a little.
      for (let i = 0; i < 3; i++) { this.hr[i] = this.cr[i]; this.hu[i] = this.cu[i] * 0.92 - this.cf[i] * 0.38; this.hf[i] = this.cf[i] * 0.92 + this.cu[i] * 0.38; }
    }
    // Arms: swing opposite to the legs about the shoulder; running raises and bends them.
    const run = Math.min(1, Math.max(0, (g.speed - 2) / 2.5));
    const amp = g.speed > 0.25 ? 0.2 + 0.045 * Math.min(g.speed, 5) : 0;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      this.toWorld(side * 0.2, 0.5, -0.01);
      const o = s * 3;
      this.sh[o] = this.out[0]; this.sh[o + 1] = this.out[1]; this.sh[o + 2] = this.out[2];
      // Left arm swings forward when the right leg does (phase 0..1 per stride).
      // Surfing: the arms leave the stride and open out and back for balance.
      let a = amp * Math.sin(Math.PI * 2 * g.phase + (s === 0 ? 0 : Math.PI)) * (1 - sb) - 0.35 * sb;
      // Climbing: both arms reach up the surface, gripping in turn (one reaches while the other holds).
      if (this.climbing) a = 2.45 + 0.4 * Math.sin(this.climbPhase + (s === 0 ? 0 : Math.PI));
      // Bending: the right arm lifts forward to shoulder height, nearly straight.
      const cast = s === 1 && !this.climbing ? this.cast : 0;
      a += (1.35 - a) * cast;
      // Upper arm: down, rotated forward by a, slightly out.
      const ua = 0.3, fa = 0.28;
      const ex = side * (0.045 + 0.2 * sb), eyl = -Math.cos(a) * ua, ezl = Math.sin(a) * ua;
      this.toWorld(side * 0.2 + ex, 0.5 + eyl, -0.01 + ezl);
      this.el[o] = this.out[0]; this.el[o + 1] = this.out[1]; this.el[o + 2] = this.out[2];
      // Forearm: bends forward more when running.
      const b = a + (0.42 + 0.3 * run * (1 - sb) + 0.5 * sb) * (1 - 0.8 * cast);
      this.toWorld(side * 0.2 + ex * 1.5, 0.5 + eyl - Math.cos(b) * fa, -0.01 + ezl + Math.sin(b) * fa);
      this.ha[o] = this.out[0]; this.ha[o + 1] = this.out[1]; this.ha[o + 2] = this.out[2];
    }
    // Keep the knees/feet in the gait (legs are the gait's); hip width for colliders.
    this.hipWidth = GAIT.hipWidth;
  }
}
