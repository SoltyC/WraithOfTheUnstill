// The Warden's ice-spike barrage (user design 2026-10-09): every fifteen seconds it stops, gathers
// and sheds its spires as spikes in every direction. They cannot be dodged — only stone stands
// between them and the Wraith. Aimed spikes follow the Wraith while it is in the open (the
// bend-step's immunity does not help); once a wall or a pillar is between them, they fly on
// straight and shatter on it. Wild spikes rain across the arena, stick in the snow (and in any
// Shaped caught in the open), and crumble after a few seconds. Allocation-free per frame.

import { CHUNK_FLOATS } from '../shaped/rig.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { SFX } from '../../audio/sfx.js';

export const SPIKES = 64;
export const spikeTuning = {
  speed: 46,             // m/s
  aimedDamage: 5,        // per aimed spike that reaches the Wraith (a whole barrage in the open ≈ 45)
  wildDamage: 7,         // a wild spike that happens to strike the Wraith
  hitRadius: 0.9,        // m round the Wraith's axis
  stuckTime: 5,          // s a spike stands in the snow before it crumbles
  shapedRadius: 1.3,     // m: a wild spike through a Shaped wounds it
};
const FLY = 1, STUCK = 2;

/**
 * @param {{ ground: any, ts: any, fx: any, blocker: { ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, segBlocked: () => boolean } }} ctx
 *   blocker: a line-of-sight test against the built solids (world/solids.js segBlocked); with
 *   `body` set it also tests the Warden's own bulk (only for an aimed spike's long look).
 */
export function createSpikes(ctx) {
  const { ground, ts, fx, blocker } = ctx;
  const T = spikeTuning;
  const st = new Uint8Array(SPIKES), aimed = new Uint8Array(SPIKES), homing = new Uint8Array(SPIKES);
  const x = new Float64Array(SPIKES), y = new Float64Array(SPIKES), z = new Float64Array(SPIKES);
  const vx = new Float64Array(SPIKES), vy = new Float64Array(SPIKES), vz = new Float64Array(SPIKES);
  const life = new Float64Array(SPIKES);
  /** Chunk records for the renderer (the Shaped's shader: long ice shards). */
  const chunks = new Float32Array(SPIKES * CHUNK_FLOATS);
  let next = 0, seed = 99, frame = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const self = {
    chunks,
    /** The Wraith (fields in): feet position; out: hits this frame and their damage (not dodgeable). */
    px: 0.5, py: 0.5, pz: 0.5, dt: 0.5, hits: 0, hitDamage: 0.5 - 0.5,
    /** Owner hook: a spike at (sx, sz) — does it strike a Shaped? (wounds it, returns true). */
    hitShaped: null, sx: 0.5, sz: 0.5,
    /** Sound (audio/sfx.js), set by the owner. */
    sfx: null,
    /** Fire from (fx0, fy0, fz0): aimed at the Wraith's chest, or wild toward (tx, ty, tz). Fields in. */
    fx0: 0.5, fy0: 0.5, fz0: 0.5, tx: 0.5, ty: 0.5, tz: 0.5,
    fireAimed() { launch(this.fx0, this.fy0, this.fz0, this.px, this.py + 1.2, this.pz, 1); },
    fireWild() { launch(this.fx0, this.fy0, this.fz0, this.tx, this.ty, this.tz, 0); },
    /** Spikes still in the air or standing in the snow. */
    get live() { let n = 0; for (let k = 0; k < SPIKES; k++) if (st[k]) n++; return n; },
    /** Gone at once (the fight resets while the Wraith is away). */
    clear() { st.fill(0); for (let k = 0; k < SPIKES; k++) chunks[k * CHUNK_FLOATS + 15] = 0; },
    /** Is the Wraith's chest in the open as seen from (ax, ay, az)? */
    exposedFrom(ax, ay, az) { return !los(ax, ay, az, this.px, this.py + 1.2, this.pz); },

    update() {
      const dt = this.dt;
      this.hits = 0; this.hitDamage = 0; frame++;
      const cx = this.px, cy = this.py + 1.2, cz = this.pz;
      for (let k = 0; k < SPIKES; k++) {
        if (st[k] === 0) continue;
        if (st[k] === STUCK) {
          life[k] -= dt;
          if (life[k] <= 0) { crumble(k); st[k] = 0; }
          write(k);
          continue;
        }
        // Aimed: steer at the Wraith while nothing stands between (then it flies on straight).
        if (homing[k]) {
          blocker.body = true;
          const hid = los(x[k], y[k], z[k], cx, cy, cz);
          blocker.body = false;
          if (hid) homing[k] = 0;
          else {
            const dx = cx - x[k], dy = cy - y[k], dz = cz - z[k], d = Math.hypot(dx, dy, dz) || 1;
            vx[k] = dx / d * T.speed; vy[k] = dy / d * T.speed; vz[k] = dz / d * T.speed;
          }
        }
        const ox = x[k], oy = y[k], oz = z[k];
        const nx = ox + vx[k] * dt, ny = oy + vy[k] * dt, nz = oz + vz[k] * dt;
        // Into stone: it shatters there.
        if (los(ox, oy, oz, nx, ny, nz)) {
          const t = blocker.t;
          x[k] = ox + (nx - ox) * t; y[k] = oy + (ny - oy) * t; z[k] = oz + (nz - oz) * t;
          shatter(k); st[k] = 0; write(k); continue;
        }
        x[k] = nx; y[k] = ny; z[k] = nz;
        // A frost trail behind it (it reads against the sky and the snow).
        if ((k + frame) % 2 === 0) { fx.ex = x[k]; fx.ey = y[k]; fx.ez = z[k]; fx.evx = vx[k] * 0.02; fx.evy = 0.2; fx.evz = vz[k] * 0.02; fx.esize = 0.08 + 0.06 * rnd(); fx.emit(); }
        // The Wraith: a spike passing through it strikes (aimed ones are what normally reach it).
        const ex = x[k] - cx, ez = z[k] - cz;
        if (ex * ex + ez * ez < T.hitRadius * T.hitRadius && y[k] > this.py - 0.2 && y[k] < this.py + 2.1) {
          this.hits++; this.hitDamage += aimed[k] ? T.aimedDamage : T.wildDamage;
          shatter(k); st[k] = 0; write(k); continue;
        }
        // A Shaped in the open.
        if (!aimed[k] && this.hitShaped !== null) { this.sx = x[k]; this.sz = z[k]; if (y[k] < ground.h + 3 && this.hitShaped()) { shatter(k); st[k] = 0; write(k); continue; } }
        ground.qx = x[k]; ground.qz = z[k]; ground.sample();
        if (y[k] <= ground.h + 0.1) {
          // Driven into the snow: a gash along its flight and a patch of frost; it stands there.
          const sl = Math.hypot(vx[k], vz[k]) || 1;
          y[k] = ground.h + 0.15;
          ts.bx = x[k]; ts.bz = z[k]; ts.bdx = vx[k] / sl; ts.bdz = vz[k] / sl; ts.bl = 0.5; ts.bw = 0.12; ts.bd = 0.1; ts.bc = 0.5;
          ts.bk = BRUSH.SCORE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.4; ts.stamp();
          ts.bk = BRUSH.FREEZE; ts.bl = 0; ts.bw = 0.5; ts.bd = 0; ts.bc = 0.4; ts.stamp();
          for (let q = 0; q < 8; q++) { fx.ex = x[k]; fx.ey = ground.h + 0.05; fx.ez = z[k]; fx.evx = (rnd() - 0.5) * 2.5; fx.evz = (rnd() - 0.5) * 2.5; fx.evy = 0.6 + rnd() * 1.6; fx.esize = 0.05 + 0.06 * rnd(); fx.emit(); }
          if (this.sfx && rnd() < 0.35) { this.sfx.x = x[k]; this.sfx.y = ground.h; this.sfx.z = z[k]; this.sfx.gain = 0.5; this.sfx.play(SFX.CRUNCH); }
          st[k] = STUCK; life[k] = T.stuckTime * (0.7 + 0.6 * rnd());
        }
        write(k);
      }
    },
  };

  function los(ax, ay, az, bx, by, bz) {
    blocker.ax = ax; blocker.ay = ay; blocker.az = az; blocker.bx = bx; blocker.by = by; blocker.bz = bz;
    return blocker.segBlocked();
  }
  function launch(sx, sy, sz, tx, ty, tz, isAimed) {
    const k = next; next = (next + 1) % SPIKES;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz, d = Math.hypot(dx, dy, dz) || 1;
    x[k] = sx; y[k] = sy; z[k] = sz;
    vx[k] = dx / d * T.speed; vy[k] = dy / d * T.speed; vz[k] = dz / d * T.speed;
    st[k] = FLY; aimed[k] = isAimed; homing[k] = isAimed; life[k] = 0;
    if (self.sfx && (isAimed || rnd() < 0.2)) { const s = self.sfx; s.x = sx; s.y = sy; s.z = sz; s.gain = isAimed ? 0.9 : 0.6; s.play(SFX.SHARD); }
    write(k);
  }
  function shatter(k) {
    for (let q = 0; q < 14; q++) {
      fx.ex = x[k]; fx.ey = y[k]; fx.ez = z[k];
      fx.evx = -vx[k] * 0.06 + (rnd() - 0.5) * 4; fx.evy = 0.5 + rnd() * 3; fx.evz = -vz[k] * 0.06 + (rnd() - 0.5) * 4; fx.esize = 0.04 + 0.08 * rnd(); fx.emit();
    }
    if (self.sfx) { const s = self.sfx; s.x = x[k]; s.y = y[k]; s.z = z[k]; s.gain = 0.7; s.play(SFX.SHATTER); }
  }
  function crumble(k) {
    for (let q = 0; q < 10; q++) { fx.ex = x[k]; fx.ey = y[k] + rnd() * 0.8; fx.ez = z[k]; fx.evx = (rnd() - 0.5); fx.evz = (rnd() - 0.5); fx.evy = -0.3 + rnd() * 0.6; fx.esize = 0.04 + 0.05 * rnd(); fx.emit(); }
  }
  /** Record k: a long ice shard along its flight (standing: the same, shrinking as it crumbles). */
  function write(k) {
    const o = k * CHUNK_FLOATS;
    if (st[k] === 0) { chunks[o + 15] = 0; return; }
    const v = Math.hypot(vx[k], vy[k], vz[k]) || 1;
    const ux = vx[k] / v, uy = vy[k] / v, uz = vz[k] / v;
    let rx = -uz, rz = ux; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const s = st[k] === STUCK ? Math.min(1, life[k] / 0.8) : 1;
    chunks[o] = x[k] - ux * 0.9; chunks[o + 1] = y[k] - uy * 0.9; chunks[o + 2] = z[k] - uz * 0.9; chunks[o + 3] = 0.3 * s;
    chunks[o + 4] = rx; chunks[o + 5] = 0; chunks[o + 6] = rz; chunks[o + 7] = 2.4 * s;
    chunks[o + 8] = ux; chunks[o + 9] = uy; chunks[o + 10] = uz; chunks[o + 11] = 0.3 * s;
    chunks[o + 12] = k * 7.31; chunks[o + 13] = 1; chunks[o + 14] = st[k] === FLY ? 2.8 : 2.3; chunks[o + 15] = 1;   // glazed (frozen) ice, lit from within while it flies
  }

  return self;
}
