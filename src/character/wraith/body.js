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
    this.lean += (0.05 + 0.035 * Math.min(g.speed, 6) - this.lean) * k;
    this.bank += (Math.max(-0.25, Math.min(0.25, -yawRate * g.speed * 0.03)) - this.bank) * k;
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
    // Chest and head.
    this.toWorld(0, 0.42, 0); this.chest[0] = this.out[0]; this.chest[1] = this.out[1]; this.chest[2] = this.out[2];
    this.toWorld(0, 0.74, 0.02); this.head[0] = this.out[0]; this.head[1] = this.out[1]; this.head[2] = this.out[2];
    // Head basis: half the lean, no sway (the head steadies itself).
    const hl = this.lean * 0.5, chl = Math.cos(hl), shl = Math.sin(hl);
    this.hr[0] = cy; this.hr[1] = 0; this.hr[2] = -sy;
    this.hu[0] = shl * sy; this.hu[1] = chl; this.hu[2] = shl * cy;
    this.hf[0] = chl * sy; this.hf[1] = -shl; this.hf[2] = chl * cy;
    // Arms: swing opposite to the legs about the shoulder; running raises and bends them.
    const run = Math.min(1, Math.max(0, (g.speed - 2) / 2.5));
    const amp = g.speed > 0.25 ? 0.2 + 0.045 * Math.min(g.speed, 5) : 0;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      this.toWorld(side * 0.2, 0.5, -0.01);
      const o = s * 3;
      this.sh[o] = this.out[0]; this.sh[o + 1] = this.out[1]; this.sh[o + 2] = this.out[2];
      // Left arm swings forward when the right leg does (phase 0..1 per stride).
      const a = amp * Math.sin(Math.PI * 2 * g.phase + (s === 0 ? 0 : Math.PI));
      // Upper arm: down, rotated forward by a, slightly out.
      const ua = 0.3, fa = 0.28;
      const ex = side * 0.045, eyl = -Math.cos(a) * ua, ezl = Math.sin(a) * ua;
      this.toWorld(side * 0.2 + ex, 0.5 + eyl, -0.01 + ezl);
      this.el[o] = this.out[0]; this.el[o + 1] = this.out[1]; this.el[o + 2] = this.out[2];
      // Forearm: bends forward more when running.
      const b = a + 0.42 + 0.3 * run;
      this.toWorld(side * 0.2 + ex * 1.5, 0.5 + eyl - Math.cos(b) * fa, -0.01 + ezl + Math.sin(b) * fa);
      this.ha[o] = this.out[0]; this.ha[o + 1] = this.out[1]; this.ha[o + 2] = this.out[2];
    }
    // Keep the knees/feet in the gait (legs are the gait's); hip width for colliders.
    this.hipWidth = GAIT.hipWidth;
  }
}
