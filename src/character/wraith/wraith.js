// The Wraith (BRIEF §8.1): gait → body → cloth, every frame, allocation-free. Owns the packed
// vertex data the renderer uploads (one storage buffer write per frame) and the footfall events
// that become terrain-state footprints and spray on the exact frame of contact.

import { Gait } from './gait.js';
import { Body } from './body.js';
import { buildGarments, GARMENT, COLLIDER, SLEEVE_WRIST_ROW, SLEEVE_ELBOW_ROW } from './garments.js';

const SUB = 1 / 120;
/** rad/s: fastest the figure turns to face its input heading. */
const TURN_RATE = 9;
const SETTLE_STEPS = 120, SETTLE_PER_FRAME = 24;
/** Air drag on the cloth (1/s): walking, and the extra while surfing (the robe streams back). */
const AIR_DRAG = 0.2, SURF_AIR_DRAG = 1.3;
const ARM = 0.58, UPPER = 0.3;
/** Head centre in the body frame (body.js). */
const HEAD_Y = 0.74, HEAD_Z = 0.02;
/** Mantle hem height in the body frame: the robe beneath it is in its shade. */
const MANTLE_HEM = 0.16;

export class Wraith {
  /** @param {{ qx: number, qz: number, h: number, sample: () => void }} ground */
  constructor(ground) {
    this.gait = new Gait(ground);
    this.body = new Body();
    // Inputs (fields).
    this.bx = 0.5; this.by = 0.5; this.bz = 0.5; this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5; this.yaw = 0.5 - 0.5;
    this.grounded = true; this.dt = 0.5;
    /** Surf engagement 0..1 and carve lean (rad): inputs from the controller's surf model. */
    this.surf = 0.5 - 0.5; this.surfLean = 0.5 - 0.5;
    /** Death collapse 0..1 (input). */
    this.collapse = 0.5 - 0.5;
    /** Climbing (inputs): the pelvis (cpx, cpy, cpz) and surface frame (right cr, up-the-climb cu,
     *  into-the-surface cf) replace the gait; climbPhase drives the alternating reach. */
    this.climbing = false; this.climbPhase = 0.5 - 0.5;
    /** Knocked down (with climbing set: the same frame override): thrown, on its back, rising. */
    this.knocked = false;
    this.cpx = 0.5; this.cpy = 0.5; this.cpz = 0.5;
    /** 0..1 how far the body has turned to the surface (from the climb system's blend). */
    this.climbBlend = 0.5 - 0.5;
    /** Eased pelvis while climbing (mounting glides onto the surface instead of snapping). */
    this._cx = NaN; this._cy = 0.5; this._cz = 0.5;
    this.cr = new Float64Array(3); this.cu = new Float64Array(3); this.cf = new Float64Array(3);
    /** Bending gesture target 0..1 (input); eased into the body's arm. */
    this.cast = 0.5 - 0.5;
    /** Facing actually shown (input yaw, rate-limited). */
    this.facing = 0.5 - 0.5;
    /** Wind (unit direction blown toward) and strength 0..2, gust phase from time. */
    this.windX = 0.76; this.windZ = -0.65; this.windStrength = 0.6; this.time = 0.5;
    // Place the body once so garments can be built in the world.
    this._syncInputs();
    this.gait.reset(); this.gait.dt = 0; this.gait.update();
    this.body.dt = 0; this.body.update(this.gait);
    const built = buildGarments(this.body);
    this.cloth = built.cloth; this.garments = built.garments;
    this.uv = built.uv; this.gid = built.gid; this.pid = built.pid; this.indices = built.indices; this.furIndices = built.furIndices;
    this.cloth.groundQuery = ground;
    // Sleeve elbows and wrists are pinned too (the bell of the cuff after the wrist hangs free).
    for (const g of this.garments) if (g.frame === 'arm') {
      for (let c = 0; c < g.cols; c++) {
        this.cloth.w[g.start + SLEEVE_WRIST_ROW * g.cols + c] = 0;
        this.cloth.w[g.start + SLEEVE_ELBOW_ROW * g.cols + c] = 0;
      }
    }
    // Legs (never rendered) are soft and push horizontally: the robe bulges and parts with the
    // stride but is never kicked up (a hard sweep flings the hem to the waist at a run).
    for (const l of [COLLIDER.THIGH_L, COLLIDER.SHIN_L, COLLIDER.THIGH_R, COLLIDER.SHIN_R]) {
      this.cloth.flatMask |= 1 << l; this.cloth.colK[l] = 0.3;
    }
    // Arms likewise for the mantle: a swinging arm moves it, never flips it over the shoulder.
    for (const l of [COLLIDER.UPPER_L, COLLIDER.FORE_L, COLLIDER.UPPER_R, COLLIDER.FORE_R]) {
      this.cloth.flatMask |= 1 << l; this.cloth.colK[l] = 0.5;
    }
    /** Packed vertex data: (pos.xyz, garment + 0.98·occlusion), (normal.xyz, thinness) per particle. */
    this.packed = new Float32Array(this.cloth.n * 8);
    /** Extra substeps still owed to settling the cloth after a teleport. */
    this.settleLeft = 0;
    this._lx = NaN; this._ly = NaN; this._lz = NaN; // last input position (teleport detection)
    this._k = 0;      // collider cursor for _cap()
    // Arm frame scratch (axis, e1, e2).
    this._fr = new Float64Array(9);
    // Orient every garment's normals outward (flip) from its rest pose.
    this.teleport();
    this._orient();
  }

  _syncInputs() {
    const g = this.gait;
    g.bx = this.bx; g.by = this.by; g.bz = this.bz; g.vx = this.vx; g.vz = this.vz; g.yaw = this.facing; g.grounded = this.grounded;
    g.surf = this.surf;
    this.body.yaw = this.facing; this.body.surf = this.surf; this.body.surfLean = this.surfLean;
  }

  /** Facing follows the input yaw at a bounded turn rate (a snapped heading would fling the hem). */
  _turn(dt) {
    let d = this.yaw - this.facing;
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    const m = TURN_RATE * dt;
    this.facing += d > m ? m : d < -m ? -m : d;
  }

  /** Teleport (spawn, respawn, any jump the body cannot have walked): snap the gait and body to
   *  the new place and re-drape every particle from its rest pose, with no velocity, then let the
   *  next update settle it. Called by update() itself when the input position jumps. */
  teleport() {
    this.facing = this.yaw;
    this._syncInputs();
    this.gait.reset(); this.gait.dt = 0; this.gait.evCount = 0; this.gait.update();
    this.body.dt = 0; this.body.prevYaw = this.yaw; this.body.update(this.gait);
    for (const g of this.garments) this._place(g, true);
    this.cloth.frameVX = this.vx; this.cloth.frameVZ = this.vz;
    // Traversal: the robe whips back hard (BRIEF §9.3) — strong drag against the rush of air.
    this.cloth.airDrag = AIR_DRAG + SURF_AIR_DRAG * this.surf; this.cloth.resetFrame();
    this.settleLeft = SETTLE_STEPS;
    this._lx = this.bx; this._ly = this.by; this._lz = this.bz;
  }

  update() {
    // A jump no walk could make (spawn, respawn, spot changes; vertical too) is a teleport.
    const jx = this.bx - this._lx, jy = this.by - this._ly, jz = this.bz - this._lz;
    if (!(jx * jx + jy * jy + jz * jz < 12)) this.teleport();
    this._lx = this.bx; this._ly = this.by; this._lz = this.bz;
    this._turn(this.dt);
    this._syncInputs();
    const g = this.gait, b = this.body;
    g.dt = this.dt; g.evCount = 0; g.collapse = this.collapse;
    if (this.climbing) this._climbPose(); else { this._cx = NaN; g.update(); }
    b.climbing = this.climbing; b.climbPhase = this.climbPhase; b.climbBlend = this.climbBlend; b.knocked = this.knocked;
    if (this.climbing) for (let i = 0; i < 3; i++) { b.cr[i] = this.cr[i]; b.cu[i] = this.cu[i]; b.cf[i] = this.cf[i]; }
    b.dt = this.dt;
    b.cast += (this.cast - b.cast) * (1 - Math.exp(-this.dt * (this.cast > b.cast ? 18 : 5)));
    b.collapse = this.collapse;
    b.update(g);
    this._colliders();
    // Wind: prevailing direction, gusting.
    const gust = 0.6 + 0.4 * Math.sin(this.time * 1.7) * Math.sin(this.time * 0.63 + 1.3);
    const ws = this.windStrength * 4.5 * gust;
    this.cloth.frameVX = this.vx; this.cloth.frameVZ = this.vz;
    this.cloth.windX = this.windX * ws; this.cloth.windZ = this.windZ * ws; this.cloth.windY = 0.4 * ws * 0.2;
    // Substeps at 120 Hz; the first frames after a spawn settle the cloth.
    // After a teleport the cloth settles over a few frames (120 extra substeps, 24 a frame: one
    // frame of 120 was a visible hitch).
    let steps = Math.min(4, Math.max(1, Math.round(this.dt / SUB)));
    if (this.settleLeft > 0) { const k = Math.min(SETTLE_PER_FRAME, this.settleLeft); steps += k; this.settleLeft -= k; }
    for (let s = 0; s < steps; s++) { this._pins(); this.cloth.step(); }
    this._pack();
  }

  /** Climbing: pelvis held to the surface; feet braced below it, stepping in turn; knees bent
   *  out from the surface. Replaces the gait's output (no planting, no footfalls). */
  _climbPose() {
    const g = this.gait, u = this.cu, f = this.cf, r = this.cr;
    if (Number.isNaN(this._cx)) { this._cx = this.body.px; this._cy = this.body.py; this._cz = this.body.pz; }
    // Knocked: the pelvis is the knockdown's own (fast; no easing lag in the throw).
    const k = this.knocked ? 1 : 1 - Math.exp(-this.dt * 9);
    this._cx += (this.cpx - this._cx) * k; this._cy += (this.cpy - this._cy) * k; this._cz += (this.cpz - this._cz) * k;
    g.px = this._cx; g.py = this._cy; g.pz = this._cz; g.speed = 0; g.phase = 0; g.evCount = 0;
    if (this.knocked) {
      // Thrown / on its back: legs loose and splayed, knees up off the snow (toward the chest).
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1, kick = 0.1 * Math.sin(this.climbPhase * 1.7 + k * 2.1);
        const down = 0.8, spread = 0.2 + 0.06 * k;
        g.fx[k] = g.px - u[0] * down + r[0] * side * spread + f[0] * kick;
        g.fy[k] = g.py - u[1] * down + r[1] * side * spread + f[1] * kick;
        g.fz[k] = g.pz - u[2] * down + r[2] * side * spread + f[2] * kick;
        g.state[k] = 0;
        g.kx[k] = g.px - u[0] * down * 0.45 + r[0] * side * 0.17 + f[0] * (0.22 + 0.08 * k);
        g.ky[k] = g.py - u[1] * down * 0.45 + r[1] * side * 0.17 + f[1] * (0.22 + 0.08 * k);
        g.kz[k] = g.pz - u[2] * down * 0.45 + r[2] * side * 0.17 + f[2] * (0.22 + 0.08 * k);
      }
      return;
    }
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1, step = 0.12 * Math.sin(this.climbPhase + (k === 0 ? Math.PI : 0));
      const down = 0.78 - step, out = -0.06;
      g.fx[k] = g.px - u[0] * down + r[0] * side * 0.14 + f[0] * out;
      g.fy[k] = g.py - u[1] * down + r[1] * side * 0.14 + f[1] * out;
      g.fz[k] = g.pz - u[2] * down + r[2] * side * 0.14 + f[2] * out;
      g.state[k] = 0;
      g.kx[k] = g.px - u[0] * down * 0.5 + r[0] * side * 0.13 - f[0] * 0.28;
      g.ky[k] = g.py - u[1] * down * 0.5 + r[1] * side * 0.13 - f[1] * 0.28;
      g.kz[k] = g.pz - u[2] * down * 0.5 + r[2] * side * 0.13 - f[2] * 0.28;
    }
  }

  _cap(ax, ay, az, bx, by, bz, r) {
    const c = this.cloth.col, o = this._k++ * 7;
    c[o] = ax; c[o + 1] = ay; c[o + 2] = az; c[o + 3] = bx; c[o + 4] = by; c[o + 5] = bz; c[o + 6] = r;
  }

  _colliders() {
    const b = this.body, g = this.gait;
    this._k = 0;
    // Torso: pelvis to chest/shoulders.
    b.toWorld(0, 0.02, -0.01);
    this._cap(b.out[0], b.out[1], b.out[2], b.chest[0], b.chest[1] + 0.08, b.chest[2], 0.17);
    // Shoulder bar.
    this._cap(b.sh[0], b.sh[1], b.sh[2], b.sh[3], b.sh[4], b.sh[5], 0.085);
    // Legs: hips → knees → feet.
    for (let f = 0; f < 2; f++) {
      b.toWorld(f === 0 ? -0.11 : 0.11, -0.04, 0);
      this._cap(b.out[0], b.out[1], b.out[2], g.kx[f], g.ky[f], g.kz[f], 0.095);
      this._cap(g.kx[f], g.ky[f], g.kz[f], g.fx[f], g.fy[f] + 0.06, g.fz[f], 0.075);
    }
    // Arms.
    for (let s = 0; s < 2; s++) {
      const o = s * 3;
      this._cap(b.sh[o], b.sh[o + 1], b.sh[o + 2], b.el[o], b.el[o + 1], b.el[o + 2], 0.06);
      this._cap(b.el[o], b.el[o + 1], b.el[o + 2], b.ha[o], b.ha[o + 1], b.ha[o + 2], 0.055);
    }
    // Head.
    this._cap(b.head[0], b.head[1], b.head[2], b.head[0], b.head[1] + 0.05, b.head[2], 0.14);
    this.cloth.colN = this._k;
  }

  _pins() {
    for (const g of this.garments) this._place(g, false);
  }

  /** Segment frame for arm s → _fr: axis (upper arm: shoulder → elbow; forearm: elbow → hand;
   *  unit), e1 (forward ⟂ axis), e2 = axis × e1. */
  _armFrame(s, fore) {
    const b = this.body, o = s * 3, f = this._fr;
    const A = fore ? b.el : b.sh, B = fore ? b.ha : b.el;
    let ax = B[o] - A[o], ay = B[o + 1] - A[o + 1], az = B[o + 2] - A[o + 2];
    const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= al; ay /= al; az /= al;
    let ex = b.f[0], ey = b.f[1], ez = b.f[2];
    const d = ex * ax + ey * ay + ez * az; ex -= ax * d; ey -= ay * d; ez -= az * d;
    const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1; ex /= el; ey /= el; ez /= el;
    f[0] = ax; f[1] = ay; f[2] = az; f[3] = ex; f[4] = ey; f[5] = ez;
    f[6] = ay * ez - az * ey; f[7] = az * ex - ax * ez; f[8] = ax * ey - ay * ex;
  }

  /** Put particle i: pinned (kinematic, every step) or placed at rest (teleport). */
  _put(all, i, x, y, z) { if (all) this.cloth.place(i, x, y, z); else this.cloth.pin(i, x, y, z); }

  /** Place a garment's kinematic particles in its frame (all = true: every particle, at rest). */
  _place(g, all) {
    const b = this.body, out = b.out;
    if (!all && g.pinRows === 0) return;
    const n = all ? g.rows * g.cols : Math.min(g.pinRows, g.rows) * g.cols;
    if (g.frame === 'body') {
      for (let k = 0; k < n; k++) { b.toWorld(g.lx[k], g.ly[k], g.lz[k]); this._put(all, g.start + k, out[0], out[1], out[2]); }
      return;
    }
    if (g.frame === 'head') {
      // Head frame, easing to the body frame where blend > 0 (the cowl's shoulder drape).
      const bl = g.blend;
      for (let k = 0; k < n; k++) {
        const lx = g.lx[k], ly = g.ly[k], lz = g.lz[k], w = bl ? bl[k] : 0;
        b.toHead(lx, ly, lz);
        if (w <= 0) { this._put(all, g.start + k, out[0], out[1], out[2]); continue; }
        const hx = out[0], hy = out[1], hz = out[2];
        b.toWorld(lx, ly + HEAD_Y, lz + HEAD_Z);
        this._put(all, g.start + k, hx + (out[0] - hx) * w, hy + (out[1] - hy) * w, hz + (out[2] - hz) * w);
      }
      return;
    }
    if (g.frame === 'arm') {
      // Sleeve: rings centred along the arm (shoulder → elbow → hand, then on past the wrist) at
      // ly (distance along the arm), in each segment's frame. Pinned at the shoulder, elbow and
      // wrist; the cloth between sags and the bell after the wrist hangs free.
      const o = g.side * 3, f = this._fr;
      for (let r = 0; r < g.rows; r++) {
        if (!all && r !== 0 && r !== SLEEVE_ELBOW_ROW && r !== SLEEVE_WRIST_ROW) continue;
        const d = g.ly[r * g.cols];
        const upper = d < UPPER;
        this._armFrame(g.side, !upper);
        const A = upper ? b.sh : b.el, B = upper ? b.el : b.ha;
        const t = upper ? d / UPPER : (d - UPPER) / (ARM - UPPER);
        const cx = A[o] + (B[o] - A[o]) * t, cy = A[o + 1] + (B[o + 1] - A[o + 1]) * t, cz = A[o + 2] + (B[o + 2] - A[o + 2]) * t;
        for (let c = 0; c < g.cols; c++) {
          const k = r * g.cols + c, lx = g.lx[k], lz = g.lz[k];
          this._put(all, g.start + k, cx + f[6] * lx + f[3] * lz, cy + f[7] * lx + f[4] * lz, cz + f[8] * lx + f[5] * lz);
        }
      }
      return;
    }
    if (g.frame === 'hand') {
      // Along the forearm from the wrist.
      const o = g.side * 3, f = this._fr;
      this._armFrame(g.side, true);
      const ox = b.ha[o], oy = b.ha[o + 1], oz = b.ha[o + 2];
      for (let k = 0; k < n; k++) {
        const lx = g.lx[k], ly = g.ly[k], lz = g.lz[k];
        this._put(all, g.start + k, ox + f[0] * ly + f[6] * lx + f[3] * lz, oy + f[1] * ly + f[7] * lx + f[4] * lz, oz + f[2] * ly + f[8] * lx + f[5] * lz);
      }
      return;
    }
    // Foot: at the gait's foot point, facing the foot's direction (the body's while swinging),
    // pitched toe-down through the swing (heel leads the lift, the toe trails).
    const ga = this.gait, s = g.side;
    let dx = ga.dirX[s], dz = ga.dirZ[s], cp = 1, sp = 0;
    if (ga.state[s] !== 0) {
      dx = Math.sin(this.facing); dz = Math.cos(this.facing);
      const t = Math.min(1, ga.t[s]), pitch = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t * 0.6);
      cp = Math.cos(pitch); sp = Math.sin(pitch);
    }
    const ox = ga.fx[s], oy = ga.fy[s], oz = ga.fz[s];
    for (let k = 0; k < n; k++) {
      const lx = g.lx[k], ly0 = g.ly[k], lz0 = g.lz[k];
      // Pitch about the ball of the foot (local z = 0.08): toe down, heel up.
      const pz = lz0 - 0.08, ly = ly0 * cp - pz * sp, lz = 0.08 + pz * cp + ly0 * sp;
      this._put(all, g.start + k, ox + dz * lx + dx * lz, oy + ly, oz - dx * lx + dz * lz);
    }
  }

  /** Flip each garment's normals so they point out of the figure (computed once at rest). */
  _orient() {
    this._pack();
    const p = this.cloth.p, P = this.packed, b = this.body;
    for (const g of this.garments) {
      const N = g.rows * g.cols;
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < N; k++) { const i = (g.start + k) * 3; cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
      cx /= N; cy /= N; cz /= N;
      // Flat strips (sash) face away from the body's axis; closed shapes away from their centre.
      const strip = g.id === GARMENT.SASH;
      if (strip) { cx = b.px; cz = b.pz; }
      let s = 0;
      for (let k = 0; k < N; k++) {
        const i = g.start + k, o = i * 8;
        s += P[o + 4] * (p[i * 3] - cx) + (strip ? 0 : P[o + 5] * (p[i * 3 + 1] - cy)) + P[o + 6] * (p[i * 3 + 2] - cz);
      }
      g.flip = s < 0 ? -1 : 1;
    }
    this._pack();
  }

  /** Normals, fold occlusion and the packed upload buffer. */
  _pack() {
    const p = this.cloth.p, out = this.packed, b = this.body;
    for (const g of this.garments) {
      const { rows, cols, wrap, start, flip } = g;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = start + r * cols + c;
        const cl = wrap ? (c - 1 + cols) % cols : Math.max(c - 1, 0), cr = wrap ? (c + 1) % cols : Math.min(c + 1, cols - 1);
        const ru = Math.max(r - 1, 0), rd = Math.min(r + 1, rows - 1);
        const a = (start + r * cols + cr) * 3, bb = (start + r * cols + cl) * 3;
        const u = (start + rd * cols + c) * 3, v = (start + ru * cols + c) * 3;
        const tx = p[a] - p[bb], ty = p[a + 1] - p[bb + 1], tz = p[a + 2] - p[bb + 2];
        const sx = p[u] - p[v], sy = p[u + 1] - p[v + 1], sz = p[u + 2] - p[v + 2];
        let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
        const nl = (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1) * flip;
        nx /= nl; ny /= nl; nz /= nl;
        const pi = i * 3;
        // Fold occlusion: how far the point sits below its neighbours' mean along the normal
        // (valleys of folds darken, ridges stay lit).
        const mx = (p[a] + p[bb] + p[u] + p[v]) * 0.25 - p[pi];
        const my = (p[a + 1] + p[bb + 1] + p[u + 1] + p[v + 1]) * 0.25 - p[pi + 1];
        const mz = (p[a + 2] + p[bb + 2] + p[u + 2] + p[v + 2]) * 0.25 - p[pi + 2];
        const cav = mx * nx + my * ny + mz * nz;
        let occ = 1 - Math.min(0.55, Math.max(0, cav * 22));
        // Layering: the robe in the mantle's shade, the mantle under the cowl's drape.
        if (g.id === GARMENT.ROBE || g.id === GARMENT.MANTLE) {
          const h = (p[pi] - b.px) * b.u[0] + (p[pi + 1] - b.py) * b.u[1] + (p[pi + 2] - b.pz) * b.u[2];
          const top = g.id === GARMENT.ROBE ? MANTLE_HEM : 0.44;
          occ *= 1 - 0.55 * Math.min(1, Math.max(0, (h - top + 0.12) / 0.14));
        }
        const o = i * 8;
        out[o] = p[pi]; out[o + 1] = p[pi + 1]; out[o + 2] = p[pi + 2]; out[o + 3] = g.id + 0.98 * occ;
        out[o + 4] = nx; out[o + 5] = ny; out[o + 6] = nz;
        // Thinness: single-layer edges (hem, mantle edge, cuffs) transmit the most light.
        out[o + 7] = g.id === GARMENT.COWL ? 0.15 : g.id >= GARMENT.HAND_L && g.id <= GARMENT.BELT ? 0 : r / (rows - 1);
      }
    }
  }
}
