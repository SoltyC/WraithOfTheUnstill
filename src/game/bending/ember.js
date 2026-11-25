// Ember bending (BRIEF §9.2 table: Flare, Stream, Fuse; learned at the Ember Warden's release, docs/phase-11/ember-warden.md):
//   Flare  (tap)   — a burst of heat in a cone before the hand: snow slumps to slush, what it catches burns.
//   Stream (hold)  — a sustained jet of fire along the aim: it cuts a molten channel through snow (wet, sunk), and burns
//                    what it plays on; water and ice under it boil to steam.
//   Fuse   (heavy) — a focused core at the aim: sand fuses to glass (permanent: the terrain's GLASS transform), ice and
//                    snow flash to steam, what stands in it is struck hard.
// Like the other elements it writes the terrain state through the shared brush path and reports what it reached (cone,
// jet line, core) for combat and the world (systems/emberBending.js). Allocation-free per frame.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export const flareTuning = { range: 8.5, halfAngle: 0.62, life: 0.55, melt: 0.09, damage: 16, ignite: 3 };
export const streamTuning = { range: 12, grow: 0.25, settle: 0.35, width: 0.9, melt: 0.16, stampEvery: 0.08, dps: 26, follow: 6 };
export const fuseTuning = { maxRange: 14, charge: 0.45, radius: 2.8, damage: 38, life: 1.6, steam: 3.5 };

/**
 * @param {{ ts: any, ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createEmberBending(ctx) {
  const { ts, ground } = ctx;
  const ground1 = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const fl = { t: 99, x: 0, z: 0, dx: 0, dz: 1, id: 0 };
  const st = { s: 0, t: 0, stamp: 0, dx: 0, dz: 1, len: 0 };
  const fu = { phase: 0, t: 0, x: 0, z: 0, y: 0, id: 0 };   // phase: 0 idle, 1 charging, 2 burst
  let serial = 0;
  const self = {
    /** Inputs (fields): caster, aim direction (unit, horizontal), aim target on the ground, dt; requests for one frame. */
    x: 0.5, y: 0.5, z: 0.5, aimX: 0.5, aimZ: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, dt: 0.5,
    castFlare: false, castFuse: false, streamHeld: false, power: 1,
    /** Gesture for the body: 1 right after a cast, decaying; held by the Stream. */
    gesture: 0,
    /** The Flare: its origin, direction, age (s) and id (new per cast); active while age < its life. */
    flareX: 0, flareZ: 0, flareDX: 0, flareDZ: 1, flareT: 99, flareId: 0,
    /** The Stream: strength 0..1, direction, current length (m). */
    get streamStrength() { return st.s; }, streamDX: 0, streamDZ: 1, streamLen: 0,
    /** The Fuse: phase (0 idle, 1 charging, 2 burst), centre, age in phase, id (new per burst); fuseEvent the burst's frame. */
    get fusePhase() { return fu.phase; }, fuseX: 0, fuseY: 0, fuseZ: 0, fuseT: 0, fuseId: 0, fuseEvent: false,
    /** A Flare was cast this frame. */
    flareEvent: false,

    update() {
      const dt = this.dt;
      this.gesture = Math.max(0, this.gesture - dt / 0.5);
      this.flareEvent = false; this.fuseEvent = false;
      if (this.castFlare) { this.castFlare = false; startFlare(this); this.gesture = 1; }
      if (this.castFuse) { this.castFuse = false; if (fu.phase === 0) startFuse(this); this.gesture = 1; }
      stepFlare(dt);
      stepStream(this, dt);
      stepFuse(this, dt);
      if (st.s > 0) this.gesture = Math.max(this.gesture, st.s * 0.85);
    },
  };

  function startFlare(s) {
    fl.t = 0; fl.x = s.x + s.aimX * 0.8; fl.z = s.z + s.aimZ * 0.8; fl.dx = s.aimX; fl.dz = s.aimZ; fl.id = ++serial;
    self.flareX = fl.x; self.flareZ = fl.z; self.flareDX = fl.dx; self.flareDZ = fl.dz; self.flareT = 0; self.flareId = fl.id; self.flareEvent = true;
    // The heat's footprint: a fan of slush where the cone meets the snow (a short wet plough each way, eased by distance).
    const T = flareTuning;
    for (let k = -2; k <= 2; k++) {
      const a = (k / 2) * T.halfAngle * 0.85, ca = Math.cos(a), sa = Math.sin(a);
      const dx = fl.dx * ca - fl.dz * sa, dz = fl.dx * sa + fl.dz * ca, m = T.range * 0.5 * s.power;
      ts.bx = fl.x + dx * m; ts.bz = fl.z + dz * m; ts.bdx = dx; ts.bdz = dz; ts.bl = m * 0.9; ts.bw = 1.1 + 0.6 * (1 - Math.abs(k) / 2);
      ts.bd = T.melt; ts.bc = 0.2; ts.bk = BRUSH.PLOUGH; ts.bwet = 1; ts.bbias = 0; ts.bberm = 0.2;
      ts.stamp();
    }
  }
  function stepFlare(dt) { fl.t += dt; self.flareT = fl.t; }

  function stepStream(s, dt) {
    const T = streamTuning;
    if (s.streamHeld) st.s = Math.min(1, st.s + dt / T.grow); else st.s = Math.max(0, st.s - dt / T.settle);
    if (st.s <= 0) { self.streamLen = 0; return; }
    st.t += dt;
    // The jet swings after the aim (a held stream of fire, not a beam).
    const k = 1 - Math.exp(-T.follow * dt);
    st.dx += (s.aimX - st.dx) * k; st.dz += (s.aimZ - st.dz) * k;
    const l = Math.hypot(st.dx, st.dz) || 1; st.dx /= l; st.dz /= l;
    st.len = T.range * st.s * s.power;
    self.streamDX = st.dx; self.streamDZ = st.dz; self.streamLen = st.len;
    // The channel it cuts: where the jet comes down, two thirds out to its end.
    if (st.t - st.stamp >= T.stampEvery && st.s > 0.5) {
      st.stamp = st.t;
      const a = st.len * 0.45, b = st.len;
      ts.bx = s.x + st.dx * (a + b) * 0.5; ts.bz = s.z + st.dz * (a + b) * 0.5; ts.bdx = st.dx; ts.bdz = st.dz;
      ts.bl = (b - a) * 0.5; ts.bw = T.width; ts.bd = T.melt * st.s; ts.bc = 0.3; ts.bk = BRUSH.PLOUGH; ts.bwet = 1; ts.bbias = 0; ts.bberm = 0.35;
      ts.stamp();
    }
  }

  function startFuse(s) {
    const T = fuseTuning, ax = s.tx - s.x, az = s.tz - s.z, d = Math.hypot(ax, az), k = d > T.maxRange ? T.maxRange / d : 1;
    fu.phase = 1; fu.t = 0; fu.x = s.x + ax * k; fu.z = s.z + az * k; fu.y = ground1(fu.x, fu.z);
    self.fuseX = fu.x; self.fuseY = fu.y; self.fuseZ = fu.z;
  }
  function stepFuse(s, dt) {
    const T = fuseTuning;
    if (fu.phase === 0) return;
    fu.t += dt; self.fuseT = fu.t;
    if (fu.phase === 1 && fu.t >= T.charge) {
      fu.phase = 2; fu.t = 0; fu.id = ++serial; self.fuseId = fu.id; self.fuseEvent = true;
      // Sand fuses (the glass transform: the sand shades it as a crazed glassy crust, slick to surf; permanent).
      ts.bx = fu.x; ts.bz = fu.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius * s.power; ts.bd = 0; ts.bc = 0.5; ts.bk = BRUSH.GLASS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
      ts.stamp();
      // Snow and ice flash off: a sunk, wet bowl.
      ts.bx = fu.x; ts.bz = fu.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius * 1.2 * s.power; ts.bd = 0.22; ts.bc = 0.2; ts.bk = BRUSH.CRATER; ts.bwet = 1; ts.bbias = 0; ts.bberm = 0.6;
      ts.stamp();
    } else if (fu.phase === 2 && fu.t >= T.life) fu.phase = 0;
  }
  return self;
}

/** Whether (px, pz) lies in a Flare's cone from (x, z) along (dx, dz) (pure: tested). */
export function inFlare(x, z, dx, dz, px, pz, range = flareTuning.range, half = flareTuning.halfAngle) {
  const ex = px - x, ez = pz - z, d = Math.hypot(ex, ez);
  if (d > range || d < 0.01) return d <= 0.01;
  return (ex * dx + ez * dz) / d >= Math.cos(half);
}
/** Distance from (px, pz) to the Stream's jet from (x, z) along (dx, dz) for len (pure: tested). */
export function streamDist(x, z, dx, dz, len, px, pz) {
  const ex = px - x, ez = pz - z, u = Math.max(0, Math.min(len, ex * dx + ez * dz));
  return Math.hypot(ex - dx * u, ez - dz * u);
}
