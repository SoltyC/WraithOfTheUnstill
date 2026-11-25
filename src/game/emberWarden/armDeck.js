// The way up a bound arm (docs/phase-11/ember-warden.md §6, the quality gate's ramp): once Frost has shackled a fist to
// the rock, that arm is held still, and its crust is footing — up the forearm from the fist, up the upper arm to the
// shoulder, and over the shoulder to the base of the neck, where the heart's light shows through the chest. The
// Long Walker's deck interface (game/walker/deck.js), so the capsule controller and the cloth stand on it as they stand
// on the Walker's back: floorQ / floorNearQ (the top of the arm under (qx, qz), near the given height), carry / after /
// push (it does not move once bound: nothing to carry). Allocation-free.

import { TITAN } from './titan.js';

/** @param {any} titan  game/emberWarden/titan.js */
export function createArmDeck(titan) {
  const B = titan.bones;
  // Segments walked (per bound arm): fist → wrist → elbow → shoulder → the neck's base; their half-width and the height
  // of their top above the bone.
  const segs = [];
  const D = {
    on: false, riding: false, under: false,
    qx: 0.5, qz: 0.5, qh: 0.5, qf: 0.5, h: 0.5, refY: 0.5, feet: Infinity,
    vx: 0, vy: 0, vz: 0, turned: 0,
    /** Which arms are footing (set by the fight's system). */
    arms: [false, false],
    floorQ() { this.feet = this.qf; floor(this); },
    floorNearQ() { this.feet = this.refY + 0.9; floor(this); },
    floorTopQ() { floor(this); },
    carry() {}, carryBody() {},
    after(p, v, grounded) { if (!this.on) { this.riding = false; return; } this.refY = p.y; this.riding = grounded && this.under; },
    push() {},
  };
  function seg(a, b, r) { segs.push([a, b, r]); }
  function rebuild() {
    segs.length = 0;
    for (let i = 0; i < 2; i++) {
      if (!D.arms[i]) continue;
      seg(B.H[i], B.W[i], TITAN.r.hand * 0.8);
      seg(B.W[i], B.E[i], TITAN.r.fore1 * 0.85);
      seg(B.E[i], B.S[i], TITAN.r.upper1 * 0.85);
      seg(B.S[i], B.P[3], TITAN.r.upper1 * 0.85);   // (the same as the upper arm's top where they meet: a step up there was a wall)
    }
  }
  function floor(d) {
    d.under = false;
    if (!d.on) { d.h = d.qh; return; }
    rebuild();
    let h = d.qh;
    for (const [a, b, r] of segs) {
      const abx = b[0] - a[0], abz = b[2] - a[2], l2 = abx * abx + abz * abz;
      if (l2 < 1e-6) continue;
      const u = ((d.qx - a[0]) * abx + (d.qz - a[2]) * abz) / l2;
      if (u < -0.05 || u > 1.05) continue;
      const uc = Math.max(0, Math.min(1, u));
      const cx = a[0] + abx * uc, cz = a[2] + abz * uc, off = Math.hypot(d.qx - cx, d.qz - cz);
      const hw = r * 0.97;   // (to its flanks: there the top comes down to the rock it lies on, a ramp onto it — not a lip)
      if (off > hw) continue;
      // The top of a round limb: highest over the bone, falling away toward its flanks.
      const top = a[1] + (b[1] - a[1]) * uc + r * Math.sqrt(Math.max(0, 1 - (off / r) ** 2)) * 0.95;
      if (top > h && top <= d.feet + 1.2) { h = top; d.under = true; }
    }
    d.h = h;
  }
  return D;
}
