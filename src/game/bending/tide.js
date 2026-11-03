// Tide bending (Phase 10 F4; docs/phase-10/plan.md): Surge (tap), Draw (hold), Undertow (heavy). Like the other elements, every verb
// writes the terrain state through the shared brushes (wetness, compaction, depression), eases in and settles out, and lights its
// water; on open water the verbs throw ripples (render/water.js). The Surge travels as a sound (noise at its front: a decoy for what
// hunts by ear, the Listener and the Drowned).
//
// Allocation-free per frame: fixed pools, plain fields, typed arrays.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { SPELL_LIGHTS } from './frost.js';

export const surgeTuning = {
  speed: 14,          // m/s: a rolling wave, slower than a Gust
  range: 20,          // m
  halfWidth0: 1.0,    // m at the hand
  halfWidth1: 2.6,    // m at full range
  wetness: 0.9,       // soaks what it crosses
  compaction: 0.35,   // and packs it down a little (slush in snow, laid grass)
  easeIn: 0.08, easeOut: 0.35,
  rippleEvery: 0.12,  // s between ripples along its front on open water
  noise: 0.7,         // how loud its front is (an ordinary walk is 0.42): a decoy
  damage: 7, shove: 9,
  lightRadius: 4, lightIntensity: 1.0,
};

export const drawTuning = {
  maxRange: 12,       // m from the caster
  grow: 1.2,          // s to a full mass
  radius: 2.2,        // m: the ground it draws from
  crust: 0.7,         // compaction: the source dries and cracks
  stampEvery: 0.15,
  pull: 4,            // m/s: Shaped within reach are drawn in
  reach: 6,
  throwPower: 1.8,    // a full mass thrown is a Surge this much wider and stronger
  lightRadius: 4.5, lightIntensity: 1.3,
};

export const undertowTuning = {
  maxRange: 12,
  radius: 3.2,        // m: the whirlpool
  life: 3.2,          // s
  rise: 0.25,
  depth: 0.28,        // m: the basin it leaves (holds water)
  reach: 8,           // m: drags Shaped in from here
  pull: 9,            // m/s at the rim of its reach
  dps: 10,
  rippleEvery: 0.3,
  noise: 0.55,
  lightRadius: 6, lightIntensity: 1.6,
};

const SURGES = 3;
/** Floats in `fx` (the renderer's block, shaders/tideFx.wgsl.js): 10 vec4. */
export const TIDE_FX_VEC4 = 10;

/**
 * @param {{ ts: any, ground: { qx: number, qz: number, h: number, sample: () => void }, lights: Float32Array, water?: () => any }} ctx
 *   ts: terrain state (brush fields + stamp); water: a getter for render/water.js (ripple(x, z, t, s, dx, dz), levelQ), made later
 */
export function createTideBending(ctx) {
  const { ts, ground, lights } = ctx;
  const waterOf = ctx.water || (() => null);
  let water = null;
  const su = { active: new Uint8Array(SURGES), t: new Float64Array(SURGES), ox: new Float64Array(SURGES), oz: new Float64Array(SURGES),
    dx: new Float64Array(SURGES), dz: new Float64Array(SURGES), prev: new Float64Array(SURGES), rip: new Float64Array(SURGES), sc: new Float64Array(SURGES) };
  const dr = { x: 0, z: 0, y: 0, m: 0, t: 0, stamp: 0, held: false };
  const un = { on: false, x: 0, z: 0, y: 0, age: 0, rip: 0 };
  let serial = 0;
  const fx = new Float32Array(TIDE_FX_VEC4 * 4);
  const ground1 = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  /** Open water at (x, z)? (Ripples there instead of nothing.) */
  const onWater = (x, z) => {
    if (water === null) water = waterOf() || null;
    if (water === null) return false;
    water.qx = x; water.qz = z; water.levelQ();
    return water.lv === water.lv && water.lv > ground1(x, z) + 0.05;
  };
  let cx = 0, cz = 0;
  const clampAim = (s, max) => {
    const ax = s.tx - s.x, az = s.tz - s.z, d = Math.sqrt(ax * ax + az * az);
    const k = d > max ? max / d : 1;
    cx = s.x + ax * k; cz = s.z + az * k;
  };
  const light = (x, y, z, r, i) => {
    let k = 0;
    while (k < SPELL_LIGHTS && lights[k * 8 + 7] !== 0) k++;
    if (k >= SPELL_LIGHTS || i <= 0.01) return;
    const o = k * 8;
    lights[o] = x; lights[o + 1] = y; lights[o + 2] = z; lights[o + 3] = r;
    lights[o + 4] = 0.42; lights[o + 5] = 0.72; lights[o + 6] = 1.0; lights[o + 7] = i;
  };

  const self = {
    lights, fx,
    /** Inputs (fields): caster, aim direction (unit, horizontal), aim target on the ground, dt, time; requests for one frame. */
    x: 0.5, y: 0.5, z: 0.5, aimX: 0.5, aimZ: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, dt: 0.5, time: 0.5,
    castSurge: false, castUndertow: false, drawHeld: false,
    /** Flow (game/flow.js), set with the cast: scales the Surge (1 = none). */
    power: 1,
    gesture: 0.5 - 0.5,
    /** Surges for combat: per slot active, front x/z, direction, half width, strength, id (new per cast). */
    surgeActive: su.active, surgeFX: new Float64Array(SURGES), surgeFZ: new Float64Array(SURGES), surgeDX: su.dx, surgeDZ: su.dz,
    surgeHW: new Float64Array(SURGES), surgeK: su.sc, surgeId: new Uint32Array(SURGES),
    /** The Draw: where, how much water it holds 0..1. */
    get drawX() { return dr.x; }, get drawZ() { return dr.z; }, get drawMass() { return dr.m; },
    /** The Undertow: on, where, strength 0..1. */
    get undertowX() { return un.x; }, get undertowZ() { return un.z; }, get undertowStrength() { return un.on ? envelope(un.age) : 0; },
    /** The loudest sound the verbs make now (a Surge's front, an Undertow): level 0..1 at (noiseX, noiseZ). */
    noiseLevel: 0, noiseX: 0.5, noiseZ: 0.5,

    update() {
      const dt = this.dt;
      this.gesture = Math.max(0, this.gesture - dt / 0.45);
      this.noiseLevel = 0;
      if (this.castSurge) { this.castSurge = false; startSurge(this, this.x + this.aimX * 0.8, this.z + this.aimZ * 0.8, this.aimX, this.aimZ, this.power); this.gesture = 1; }
      if (this.castUndertow) { this.castUndertow = false; startUndertow(this); this.gesture = 1; }
      stepDraw(this, dt);
      for (let k = 0; k < SURGES; k++) stepSurge(k, dt);
      stepUndertow(dt);
      if (dr.m > 0) this.gesture = Math.max(this.gesture, 0.4 + 0.5 * dr.m);
      writeFx();
    },
  };

  function startSurge(s, x, z, dx, dz, k) {
    let i = 0;
    for (let j = 0; j < SURGES; j++) if (!su.active[j]) { i = j; break; } else if (su.t[j] > su.t[i]) i = j;
    su.active[i] = 1; su.t[i] = 0; su.ox[i] = x; su.oz[i] = z; su.dx[i] = dx; su.dz[i] = dz; su.prev[i] = 0; su.rip[i] = -1; su.sc[i] = k;
    self.surgeId[i] = ++serial;
  }

  function stepSurge(k, dt) {
    if (!su.active[k]) { self.surgeHW[k] = 0; return; }
    const T = surgeTuning, sc = su.sc[k], range = T.range * Math.sqrt(sc);
    su.t[k] += dt;
    const t = su.t[k], travel = range / T.speed, d = Math.min(range, t * T.speed);
    if (t > travel + T.easeOut) { su.active[k] = 0; self.surgeHW[k] = 0; return; }
    const ease = Math.min(1, t / T.easeIn) * Math.min(1, Math.max(0, (travel + T.easeOut - t) / T.easeOut));
    const hw = (T.halfWidth0 + (T.halfWidth1 - T.halfWidth0) * (d / range)) * sc;
    const dx = su.dx[k], dz = su.dz[k], fx = su.ox[k] + dx * d, fz = su.oz[k] + dz * d;
    self.surgeFX[k] = fx; self.surgeFZ[k] = fz; self.surgeHW[k] = hw * ease;
    const seg = d - su.prev[k];
    if (seg > 0.01 && ease > 0.02) {
      const mid = (d + su.prev[k]) * 0.5;
      ts.bx = su.ox[k] + dx * mid; ts.bz = su.oz[k] + dz * mid; ts.bdx = dx; ts.bdz = dz;
      ts.bl = seg * 0.5; ts.bw = hw; ts.bd = 0; ts.bc = T.compaction * ease;
      ts.bk = BRUSH.WET; ts.bwet = T.wetness * ease; ts.bbias = 0; ts.bberm = 0;
      ts.stamp();
    }
    su.prev[k] = d;
    if (d < range && t - su.rip[k] >= T.rippleEvery && onWater(fx, fz)) { su.rip[k] = t; water.ripple(fx, fz, self.time, 1.2 * sc * ease, dx, dz); }
    if (d < range && T.noise * ease > self.noiseLevel) { self.noiseLevel = T.noise * ease; self.noiseX = fx; self.noiseZ = fz; }
    light(fx, ground1(fx, fz) + 0.9, fz, T.lightRadius, T.lightIntensity * ease);
  }

  function stepDraw(s, dt) {
    const T = drawTuning;
    if (s.drawHeld) {
      if (!dr.held) { clampAim(s, T.maxRange); dr.x = cx; dr.z = cz; dr.t = 0; dr.stamp = -1; dr.m = 0; }
      dr.held = true;
      dr.m = Math.min(1, dr.m + dt / T.grow); dr.t += dt;
      dr.y = ground1(dr.x, dr.z);
      // The source gives up its water: packed and crusted where it is drawn from.
      if (dr.t - dr.stamp >= T.stampEvery) {
        dr.stamp = dr.t;
        ts.bx = dr.x; ts.bz = dr.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius; ts.bd = 0; ts.bc = T.crust * dr.m;
        ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
        if (onWater(dr.x, dr.z)) water.ripple(dr.x, dr.z, s.time, 0.5 + 0.5 * dr.m, 0, 0);
      }
      light(dr.x, dr.y + 1.5 + dr.m, dr.z, T.lightRadius, T.lightIntensity * dr.m);
      return;
    }
    if (dr.held) {
      // Let go: the mass is thrown along the aim from where it hung — a Surge as strong as what was drawn.
      dr.held = false;
      if (dr.m > 0.25) { startSurge(s, dr.x, dr.z, s.aimX, s.aimZ, 1 + (T.throwPower - 1) * dr.m); s.gesture = 1; }
      dr.m = 0;
    }
  }

  function startUndertow(s) {
    clampAim(s, undertowTuning.maxRange);
    un.on = true; un.x = cx; un.z = cz; un.y = ground1(cx, cz); un.age = 0; un.rip = -1;
    // The basin it leaves (and that holds water after).
    const T = undertowTuning;
    ts.bx = cx; ts.bz = cz; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius; ts.bd = T.depth; ts.bc = 0.5;
    ts.bk = BRUSH.CRATER; ts.bwet = 1; ts.bbias = 0; ts.bberm = 0.6;
    ts.stamp();
  }

  function stepUndertow(dt) {
    if (!un.on) return;
    const T = undertowTuning;
    un.age += dt;
    if (un.age > T.life) { un.on = false; return; }
    const e = envelope(un.age);
    if (un.age - un.rip >= T.rippleEvery && onWater(un.x, un.z)) { un.rip = un.age; water.ripple(un.x, un.z, self.time, 1.5 * e, 0, 0); }
    if (T.noise * e > self.noiseLevel) { self.noiseLevel = T.noise * e; self.noiseX = un.x; self.noiseZ = un.z; }
    light(un.x, un.y + 0.8, un.z, T.lightRadius, T.lightIntensity * e);
  }

  /** The renderer's block (TIDE_FX_VEC4 vec4), see shaders/tideFx.wgsl.js:
   *  [0..2] surge k: front x, ground y, front z, strength · [3..5] surge k: dir x, dir z, half width, distance travelled
   *  [6] draw: x, the mass's centre y, z, mass 0..1 · [7] draw: source ground y, radius, -, -
   *  [8] undertow: x, ground y, z, strength · [9] undertow: radius, age, -, - */
  function writeFx() {
    const T = surgeTuning;
    for (let k = 0; k < SURGES; k++) {
      const o = k * 4, o2 = (3 + k) * 4;
      if (!su.active[k]) { fx[o + 3] = 0; continue; }
      const sc = su.sc[k], range = T.range * Math.sqrt(sc), t = su.t[k], travel = range / T.speed, d = Math.min(range, t * T.speed);
      const ease = Math.min(1, t / T.easeIn) * Math.min(1, Math.max(0, (travel + T.easeOut - t) / T.easeOut));
      fx[o] = self.surgeFX[k]; fx[o + 1] = ground1(self.surgeFX[k], self.surgeFZ[k]); fx[o + 2] = self.surgeFZ[k]; fx[o + 3] = ease * Math.min(1.4, sc);
      fx[o2] = su.dx[k]; fx[o2 + 1] = su.dz[k]; fx[o2 + 2] = self.surgeHW[k]; fx[o2 + 3] = d;
    }
    fx[24] = dr.x; fx[25] = dr.y + 1.4 + 0.5 * dr.m; fx[26] = dr.z; fx[27] = dr.m;
    fx[28] = dr.y; fx[29] = drawTuning.radius; fx[30] = 0; fx[31] = 0;
    fx[32] = un.x; fx[33] = un.y; fx[34] = un.z; fx[35] = un.on ? envelope(un.age) : 0;
    fx[36] = undertowTuning.radius; fx[37] = un.age; fx[38] = 0; fx[39] = 0;
  }

  return self;
}

/** The Undertow's strength over its life: up fast, held, gone over the last third. */
export function envelope(age) {
  const T = undertowTuning;
  if (age < 0 || age > T.life) return 0;
  const a = Math.min(1, age / T.rise), b = Math.min(1, (T.life - age) / (T.life / 3));
  return a * b * b * (3 - 2 * b);
}
