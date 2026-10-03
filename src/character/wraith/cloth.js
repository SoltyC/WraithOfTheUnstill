// Verlet cloth for the Wraith's robe (BRIEF §8.1: "GPU or CPU Verlet with distance and bending
// constraints, driven by locomotion velocity, acceleration, and the global wind field").
// CPU, allocation-free after construction: flat typed arrays for particles and constraints,
// capsule colliders, an optional ground query for the hem. Pinned particles are kinematic: the
// owner moves them every step (they follow the body), and the rest of the cloth is dragged along,
// so velocity and acceleration of the body drive it naturally.

export class Cloth {
  /**
   * @param {number} maxParticles
   * @param {number} maxConstraints
   * @param {number} maxColliders
   */
  constructor(maxParticles, maxConstraints, maxColliders = 16) {
    this.n = 0;
    this.p = new Float64Array(maxParticles * 3);      // position
    this.q = new Float64Array(maxParticles * 3);      // previous position
    this.w = new Float64Array(maxParticles);          // inverse mass (0 = pinned)
    this.ground = new Uint8Array(maxParticles);       // 1: collides with the ground
    this.mask = new Uint32Array(maxParticles).fill(0xffffffff); // bit k: collides with collider k
    this.c = 0;
    this.ci = new Uint32Array(maxConstraints * 2);
    this.cr = new Float64Array(maxConstraints);       // rest length
    this.ck = new Float64Array(maxConstraints);       // stiffness 0..1
    // Tethers (long-range attachments): particle i may not be farther than len from anchor a.
    this.t = 0;
    this.ti = new Uint32Array(maxParticles * 2);
    this.tl = new Float64Array(maxParticles);
    this.colN = 0;
    this.col = new Float64Array(maxColliders * 7);    // capsule ax ay az bx by bz r
    /** Bit k: collider k pushes horizontally only (legs part the hem; they never lift it). */
    this.flatMask = 0;
    /** Per-collider push fraction per pass (1 = hard; legs are soft: the hem bulges, never kicks). */
    this.colK = new Float64Array(maxColliders).fill(1);
    // Forces (fields): gravity, wind (m/s² acceleration), damping per second.
    this.gravity = 9.81; this.windX = 0.5 - 0.5; this.windY = 0.5 - 0.5; this.windZ = 0.5 - 0.5;
    // Damping: mostly relative to the moving frame (the body), a little relative to the world
    // (air drag). Damping only in the world frame makes running feel like a gale.
    this.damping = 1.6;        // per second, relative to the frame velocity
    this.airDrag = 0.2;        // per second, relative to the world
    this.frameVX = 0.5 - 0.5; this.frameVY = 0.5 - 0.5; this.frameVZ = 0.5 - 0.5; // m/s
    // Inertia scale: the fraction of the frame's change in velocity the free cloth feels (the
    // rest is carried with the body). The controller starts and stops in ~0.2 s; at full inertia
    // a sudden stop throws the hem over the waist.
    this.inertia = 0.4;
    this._pvx = 0.5 - 0.5; this._pvy = 0.5 - 0.5; this._pvz = 0.5 - 0.5;
    this.iterations = 6;
    this.maxSpeed = 25; // m/s
    /** Ground query for flagged particles (qx/qz → sample() → h); optional. */
    this.groundQuery = null;
    this.dt = 1 / 120;
  }

  addParticle(x, y, z, invMass) {
    if (this.n >= this.w.length) throw new Error('Cloth: particle capacity exceeded');
    const i = this.n++, o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.q[o] = x; this.q[o + 1] = y; this.q[o + 2] = z;
    this.w[i] = invMass;
    return i;
  }

  addConstraint(a, b, stiffness) {
    if (this.c >= this.cr.length) throw new Error('Cloth: constraint capacity exceeded');
    const k = this.c++, pa = a * 3, pb = b * 3;
    this.ci[k * 2] = a; this.ci[k * 2 + 1] = b;
    const dx = this.p[pb] - this.p[pa], dy = this.p[pb + 1] - this.p[pa + 1], dz = this.p[pb + 2] - this.p[pa + 2];
    this.cr[k] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.ck[k] = stiffness;
    return k;
  }

  /** Tether particle i to anchor a (usually a pinned particle) at its current distance × slack. */
  addTether(i, a, slack = 1.02) {
    const k = this.t++, pi = i * 3, pa = a * 3;
    this.ti[k * 2] = i; this.ti[k * 2 + 1] = a;
    this.tl[k] = Math.sqrt((this.p[pi] - this.p[pa]) ** 2 + (this.p[pi + 1] - this.p[pa + 1]) ** 2 + (this.p[pi + 2] - this.p[pa + 2]) ** 2) * slack;
  }

  /** Set capsule collider k (fields would be cleaner, but this runs once per collider per frame). */
  setCollider(k, ax, ay, az, bx, by, bz, r) {
    const o = k * 7, c = this.col;
    c[o] = ax; c[o + 1] = ay; c[o + 2] = az; c[o + 3] = bx; c[o + 4] = by; c[o + 5] = bz; c[o + 6] = r;
    if (k >= this.colN) this.colN = k + 1;
  }

  /** Move a pinned particle (kinematic): previous position follows so it carries no velocity jump. */
  pin(i, x, y, z) {
    const o = i * 3;
    this.q[o] = this.p[o]; this.q[o + 1] = this.p[o + 1]; this.q[o + 2] = this.p[o + 2];
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
  }

  /** Put particle i at (x, y, z) at rest (no velocity). */
  place(i, x, y, z) {
    const o = i * 3;
    this.p[o] = this.q[o] = x; this.p[o + 1] = this.q[o + 1] = y; this.p[o + 2] = this.q[o + 2] = z;
  }

  /** Teleport everything by an offset (spawn, teleports): no velocity. */
  /** Forget the frame velocity history (teleports: no velocity change is felt). */
  resetFrame() { this._pvx = this.frameVX; this._pvy = this.frameVY; this._pvz = this.frameVZ; }

  translate(dx, dy, dz) {
    for (let i = 0; i < this.n * 3; i += 3) {
      this.p[i] += dx; this.p[i + 1] += dy; this.p[i + 2] += dz;
      this.q[i] = this.p[i]; this.q[i + 1] = this.p[i + 1]; this.q[i + 2] = this.p[i + 2];
    }
  }

  step() {
    const dt = this.dt, p = this.p, q = this.q, w = this.w, n = this.n;
    const keep = Math.exp(-this.damping * dt), air = Math.exp(-this.airDrag * dt);
    const fvx = this.frameVX * dt, fvy = this.frameVY * dt, fvz = this.frameVZ * dt;
    // Carry (1 − inertia) of the frame's velocity change into every free particle.
    const ci0 = 1 - this.inertia;
    const cvx = (this.frameVX - this._pvx) * dt * ci0, cvy = (this.frameVY - this._pvy) * dt * ci0, cvz = (this.frameVZ - this._pvz) * dt * ci0;
    this._pvx = this.frameVX; this._pvy = this.frameVY; this._pvz = this.frameVZ;
    const ax = this.windX * dt * dt, ay = (this.windY - this.gravity) * dt * dt, az = this.windZ * dt * dt;
    // Integrate (Verlet). Speed is clamped (a safety net: no input may fling the cloth).
    const vmax = this.maxSpeed * dt;
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const o = i * 3;
      const x = p[o], y = p[o + 1], z = p[o + 2];
      q[o] -= cvx; q[o + 1] -= cvy; q[o + 2] -= cvz;
      let vx = (fvx + (x - q[o] - fvx) * keep) * air, vy = (fvy + (y - q[o + 1] - fvy) * keep) * air, vz = (fvz + (z - q[o + 2] - fvz) * keep) * air;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > vmax * vmax) { const s = vmax / Math.sqrt(v2); vx *= s; vy *= s; vz *= s; }
      p[o] = x + vx + ax;
      p[o + 1] = y + vy + ay;
      p[o + 2] = z + vz + az;
      q[o] = x; q[o + 1] = y; q[o + 2] = z;
    }
    // Constraints, then collisions, a few times.
    const ci = this.ci, cr = this.cr, ck = this.ck, C = this.c;
    for (let it = 0; it < this.iterations; it++) {
      for (let k = 0; k < C; k++) {
        const a = ci[k * 2], b = ci[k * 2 + 1];
        const wa = w[a], wb = w[b], ws = wa + wb;
        if (ws === 0) continue;
        const pa = a * 3, pb = b * 3;
        const dx = p[pb] - p[pa], dy = p[pb + 1] - p[pa + 1], dz = p[pb + 2] - p[pa + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const s = ((d - cr[k]) / (d * ws)) * ck[k];
        p[pa] += dx * s * wa; p[pa + 1] += dy * s * wa; p[pa + 2] += dz * s * wa;
        p[pb] -= dx * s * wb; p[pb + 1] -= dy * s * wb; p[pb + 2] -= dz * s * wb;
      }
      // Tethers: one-sided, so long cloth never stretches however far it is dragged.
      const ti = this.ti, tl = this.tl;
      for (let k = 0; k < this.t; k++) {
        const i = ti[k * 2], a = ti[k * 2 + 1], pi = i * 3, pa = a * 3;
        const dx = p[pi] - p[pa], dy = p[pi + 1] - p[pa + 1], dz = p[pi + 2] - p[pa + 2];
        const d2 = dx * dx + dy * dy + dz * dz, L = tl[k];
        if (d2 <= L * L) continue;
        const s = L / Math.sqrt(d2);
        p[pi] = p[pa] + dx * s; p[pi + 1] = p[pa + 1] + dy * s; p[pi + 2] = p[pa + 2] + dz * s;
      }
      // Collisions twice per step (mid-way and at the end) are enough at 120 Hz substeps.
      if (it === (this.iterations >> 1) || it === this.iterations - 1) this._collide();
    }
    this._ground();
  }

  _collide() {
    const p = this.p, w = this.w, col = this.col;
    for (let k = 0; k < this.colN; k++) {
      const o = k * 7;
      const ax = col[o], ay = col[o + 1], az = col[o + 2];
      const ex = col[o + 3] - ax, ey = col[o + 4] - ay, ez = col[o + 5] - az, r = col[o + 6];
      const ee = ex * ex + ey * ey + ez * ez || 1e-9;
      // Bounding sphere reject.
      const mx = ax + ex * 0.5, my = ay + ey * 0.5, mz = az + ez * 0.5, br = Math.sqrt(ee) * 0.5 + r;
      const bit = 1 << k, mask = this.mask, kk = this.colK[k];
      for (let i = 0; i < this.n; i++) {
        if (w[i] === 0 || (mask[i] & bit) === 0) continue;
        const pi = i * 3;
        let dx = p[pi] - mx, dy = p[pi + 1] - my, dz = p[pi + 2] - mz;
        if (dx * dx + dy * dy + dz * dz > br * br) continue;
        let t = ((p[pi] - ax) * ex + (p[pi + 1] - ay) * ey + (p[pi + 2] - az) * ez) / ee;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        dx = p[pi] - (ax + ex * t); dy = p[pi + 1] - (ay + ey * t); dz = p[pi + 2] - (az + ez * t);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        if ((this.flatMask & bit) !== 0) {
          // Out of the capsule horizontally: solve |(dx, dy, dz) + s·(dx, 0, dz)| = r for s ≥ 0.
          const hh = dx * dx + dz * dz;
          if (hh < 1e-10) continue;
          const rr = r * r;
          // (1+s)²·hh + dy² = r²  →  s = sqrt((r² − dy²)/hh) − 1
          const lim = rr - dy * dy;
          if (lim <= 0) continue;
          const sc = (Math.sqrt(lim / hh) - 1) * kk;
          p[pi] += dx * sc; p[pi + 2] += dz * sc;
          continue;
        }
        const d = Math.sqrt(d2) || 1e-6, push = (r - d) / d * kk;
        p[pi] += dx * push; p[pi + 1] += dy * push; p[pi + 2] += dz * push;
      }
    }
  }

  _ground() {
    const g = this.groundQuery;
    if (!g) return;
    const p = this.p, q = this.q;
    for (let i = 0; i < this.n; i++) {
      if (this.ground[i] === 0 || this.w[i] === 0) continue;
      const o = i * 3;
      g.qx = p[o]; g.qz = p[o + 2]; g.sample();
      const floor = g.h + 0.015;
      if (p[o + 1] < floor) {
        p[o + 1] = floor;
        // Friction: the hem drags on the snow instead of skating.
        q[o] += (p[o] - q[o]) * 0.15; q[o + 2] += (p[o + 2] - q[o + 2]) * 0.15; q[o + 1] = floor;
      }
    }
  }
}
