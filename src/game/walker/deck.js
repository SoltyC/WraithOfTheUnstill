// The Long Walker's back as ground (Phase 9 D10): its court is a moving floor. The boxes are in the
// body's own frame (game/walker/walker.js `b*`, its transform R, T and last frame's Rp, Tp), so the
// floor tilts, rolls and walks with it:
//   • floorQ — the highest box top under (qx, qz) no more than a step above the feet (qf), solved on
//     the box's tilted top plane; walls are the boxes whose tops are higher than a step;
//   • push — the capsule out of the walls (in the body's frame, back to world);
//   • carry — at the start of a frame, a Wraith riding (stood on it, or in the air over it) moves with
//     the body from last frame's pose to this one, and turns with it; leaving it in the air it keeps the
//     body's velocity (a jump off a walking colossus carries its stride).
// The capsule controller calls these (character/capsuleController.js `deck`). Allocation-free.

const STEP = 0.7, BODY_H = 1.8, RAD = 0.38;

/** @param {any} w  the walker (game/walker/walker.js) */
export function createDeck(w) {
  const L = new Float64Array(3);
  let hit = false;
  const self = {
    /** Off (buried, at rest far away): nothing is queried. */
    on: false,
    /** The Wraith rides it (set by after(); read by carry()). */
    riding: false, under: false,
    qx: 0.5, qz: 0.5, qh: 0.5, qf: 0.5, h: 0.5,
    /** Feet height for floorNearQ (the body's feet and cloth: floors near the Wraith's own height). */
    refY: 0.5,
    /** The deck's velocity when the Wraith last rode it (m/s, world). */
    vx: 0.5 - 0.5, vy: 0.5 - 0.5, vz: 0.5 - 0.5,
    /** Seconds the deck lets the Wraith through (a balk throws it off over the walls). */
    ghostT: 0.5 - 0.5,
    /** Yaw turned by the last carry (rad): the owner turns the camera with it. */
    turned: 0.5 - 0.5,
    floorQ() { this.feet = this.qf; floor(); this.under = hit; },
    floorNearQ() { this.feet = this.refY + 0.9; floor(); },
    feet: 0.5,
    /** Push the capsule at p out of the deck's walls; v loses its speed into them. */
    push(p, v) {
      if (!this.on || this.ghostT > 0) return;
      for (let it = 0; it < 2; it++) {
        local(p);
        if (L[0] < -40 || L[0] > 40 || L[2] < -40 || L[2] > 40) return;
        for (let i = 0; i < w.nBox; i++) {
          if (!w.bon[i]) continue;
          const top = w.by1[i];
          if (L[1] >= top - STEP || L[1] + BODY_H <= w.by0[i]) continue;   // stood on (or a step), or clear under
          const dx = L[0] - w.bx[i], dz = L[2] - w.bz[i], c = w.bc[i], s = w.bsn[i];
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          const ex = w.bhx[i] + RAD, ez = w.bhz[i] + RAD;
          if (lx <= -ex || lx >= ex || lz <= -ez || lz >= ez) continue;
          // Out along the shallower side (in the box's frame → body → world).
          const px = lx < 0 ? -ex - lx : ex - lx, pz = lz < 0 ? -ez - lz : ez - lz;
          let mx = 0, mz = 0;
          if (Math.abs(px) < Math.abs(pz)) mx = px; else mz = pz;
          // box frame → body frame (the inverse rotation), then body → world (horizontal part).
          const bxl = mx * c + mz * s, bzl = -mx * s + mz * c;
          const R = w.R;
          const wx = R[0] * bxl + R[6] * bzl, wz = R[2] * bxl + R[8] * bzl;
          p.x += wx; p.z += wz;
          const wl = Math.sqrt(wx * wx + wz * wz);
          if (wl > 1e-6) { const into = -(v.x * wx + v.z * wz) / wl; if (into > 0) { v.x += wx / wl * into; v.z += wz / wl * into; } }
          local(p);
        }
      }
    },
    /** Frame start: move a riding body with the deck (last pose → this pose); returns nothing (fields). */
    carry(p, ctl) {
      this.turned = 0;
      if (this.ghostT > 0) this.ghostT = Math.max(0, this.ghostT - (w.dt > 0 ? w.dt : 1 / 60));
      if (!this.on || !this.riding) return;
      const R = w.R, Rp = w.Rp, Tp = w.Tp;
      const dx = p.x - Tp[0], dy = p.y - Tp[1], dz = p.z - Tp[2];
      const lx = Rp[0] * dx + Rp[1] * dy + Rp[2] * dz, ly = Rp[3] * dx + Rp[4] * dy + Rp[5] * dz, lz = Rp[6] * dx + Rp[7] * dy + Rp[8] * dz;
      p.x = w.x + R[0] * lx + R[3] * ly + R[6] * lz;
      p.y = w.y + R[1] * lx + R[4] * ly + R[7] * lz;
      p.z = w.z + R[2] * lx + R[5] * ly + R[8] * lz;
      const a0 = Math.atan2(Rp[6], Rp[8]), a1 = Math.atan2(R[6], R[8]);
      let d = a1 - a0; if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      this.turned = d; if (ctl) ctl.yaw += d;
      const dt = w.dt > 1e-4 ? w.dt : 1 / 60;
      this.vx = (w.x - Tp[0]) / dt; this.vy = (w.y - Tp[1]) / dt; this.vz = (w.z - Tp[2]) / dt;
    },
    /** Frame end: is the Wraith riding (over the deck's footprint, near or on it)? Leaving it in the
     *  air hands it the deck's speed. */
    after(p, v, grounded) {
      if (!this.on) { this.riding = false; this.under = false; return; }
      local(p);
      const over = L[0] > -13.8 && L[0] < 13.8 && L[2] > -19.5 && L[2] < 19.5 && L[1] > -8.5 && L[1] < 12;
      const was = this.riding;
      this.riding = over && ((this.under && grounded) || was);
      if (was && !this.riding && !grounded) { v.x += this.vx; v.z += this.vz; }
    },
  };
  function local(p) {
    const R = w.R, dx = p.x - w.x, dy = p.y - w.y, dz = p.z - w.z;
    L[0] = R[0] * dx + R[1] * dy + R[2] * dz; L[1] = R[3] * dx + R[4] * dy + R[5] * dz; L[2] = R[6] * dx + R[7] * dy + R[8] * dz;
  }
  /** The highest walkable top over (qx, qz) at or below feet + STEP, if above qh → h. */
  function floor() {
    const x = self.qx, z = self.qz, feet = self.feet;
    let h = self.qh;
    hit = false;
    self.h = h;
    if (!self.on || self.ghostT > 0) return;
    const R = w.R, Ty = w.y, dx0 = x - w.x, dz0 = z - w.z;
    // Quick reject: far outside the footprint (horizontal distance from the body's centre).
    if (dx0 * dx0 + dz0 * dz0 > 45 * 45) return;
    for (let i = 0; i < w.nBox; i++) {
      if (!w.bon[i]) continue;
      const top = w.by1[i];
      // World y of the box's top plane over (x, z): local y = top along the vertical through (x, z).
      const y = Ty + (top - R[3] * dx0 - R[5] * dz0) / R[4];
      if (y <= h || y > feet + STEP) continue;
      const dy = y - Ty;
      const lx = R[0] * dx0 + R[1] * dy + R[2] * dz0, lz = R[6] * dx0 + R[7] * dy + R[8] * dz0;
      const ddx = lx - w.bx[i], ddz = lz - w.bz[i], c = w.bc[i], s = w.bsn[i];
      const bx = ddx * c - ddz * s, bz = ddx * s + ddz * c;
      if (bx < -w.bhx[i] || bx > w.bhx[i] || bz < -w.bhz[i] || bz > w.bhz[i]) continue;
      h = y; hit = true;
    }
    self.h = h;
  }
  return self;
}
