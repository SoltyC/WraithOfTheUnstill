// The lantern flail's head on its chain (docs §11.2): a point mass hung from the haft's eye by a
// rope of fixed length, stepped with position Verlet in small slices so a hard swing never tunnels,
// gravity and drag, and a `guide` that pulls it toward the line the haft points along — low in the
// windup (the weight hangs and lags, so the swing is read before it lands), high in the cut (it flies
// out on the arc the hit code is sweeping). Out: the head's ring, the chain's elbow (the slack hangs
// down, so a resting flail swings on two segments) and the direction the cage hangs. Fields in and
// out, no allocation.

const G = 17, DRAG = 2.6, SLICE = 1 / 90, GUIDE_RATE = 26;

export class FlailHead {
  constructor() {
    /** In: the haft's eye (t), the haft's direction (u, unit), the chain's length, the guide 0..1, the step. */
    this.tx = 0.5 - 0.5; this.ty = 0.5 - 0.5; this.tz = 0.5 - 0.5; this.ux = 0.5 - 0.5; this.uy = 1.5 - 0.5; this.uz = 0.5 - 0.5;
    this.len = 1.5 - 0.5; this.guide = 0.5 - 0.5; this.dt = 0.5 - 0.5;
    /** State: the head and where it was a slice ago. */
    this.hx = 0.5 - 0.5; this.hy = 0.5 - 0.5; this.hz = 0.5 - 0.5; this.px = 0.5 - 0.5; this.py = 0.5 - 0.5; this.pz = 0.5 - 0.5;
    this.ready = false;
    /** Out: the elbow, the direction the head hangs (unit, away from the haft) and the head's speed (m/s). */
    this.mx = 0.5 - 0.5; this.my = 0.5 - 0.5; this.mz = 0.5 - 0.5; this.dx = 0.5 - 0.5; this.dy = -0.5 - 0.5; this.dz = 0.5 - 0.5; this.speed = 0.5 - 0.5;
  }

  /** Hang the head still below the eye (a swap, a spawn, a jump across the map). */
  snap() {
    this.hx = this.px = this.tx; this.hy = this.py = this.ty - this.len; this.hz = this.pz = this.tz; this.ready = true;
  }

  step() {
    const L = this.len;
    if (!this.ready || Math.hypot(this.hx - this.tx, this.hy - this.ty, this.hz - this.tz) > L * 2.5) this.snap();
    const dt = Math.min(this.dt, 0.1);
    const n = dt <= 0 ? 0 : Math.min(8, Math.ceil(dt / SLICE)), h = n > 0 ? dt / n : 0;
    const damp = Math.exp(-DRAG * h), gk = 1 - Math.exp(-GUIDE_RATE * h) , gs = this.guide * gk;
    let vx = 0, vy = 0, vz = 0;
    for (let k = 0; k < n; k++) {
      vx = (this.hx - this.px) * damp; vy = (this.hy - this.py) * damp - G * h * h; vz = (this.hz - this.pz) * damp;
      this.px = this.hx; this.py = this.hy; this.pz = this.hz;
      this.hx += vx; this.hy += vy; this.hz += vz;
      // The guide: toward the end of the haft's line, a chain's length out.
      this.hx += (this.tx + this.ux * L - this.hx) * gs; this.hy += (this.ty + this.uy * L - this.hy) * gs; this.hz += (this.tz + this.uz * L - this.hz) * gs;
      // The rope: it pulls, it never pushes.
      const rx = this.hx - this.tx, ry = this.hy - this.ty, rz = this.hz - this.tz, d = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (d > L) { const f = L / d; this.hx = this.tx + rx * f; this.hy = this.ty + ry * f; this.hz = this.tz + rz * f; }
    }
    this.speed = h > 0 ? Math.hypot(this.hx - this.px, this.hy - this.py, this.hz - this.pz) / h : 0;
    // The elbow: halfway, dropped by the slack (two straight segments of L/2 each cannot be shorter than the gap).
    const ex = this.hx - this.tx, ey = this.hy - this.ty, ez = this.hz - this.tz, gap = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const sag = Math.sqrt(Math.max(0, L * L - gap * gap)) * 0.5;
    this.mx = this.tx + ex * 0.5; this.my = this.ty + ey * 0.5 - sag; this.mz = this.tz + ez * 0.5;
    // The cage hangs along the last segment.
    let dx = this.hx - this.mx, dy = this.hy - this.my, dz = this.hz - this.mz;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl > 1e-4) { this.dx = dx / dl; this.dy = dy / dl; this.dz = dz / dl; }
  }
}
