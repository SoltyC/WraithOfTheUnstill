// Gale bending (BRIEF §9.2, PLAN.md M6): Gust (tap), Vortex (hold), Updraft (heavy). Like the
// frost verbs, every verb writes the terrain state through the shared brush path (FLATTEN,
// STRIP), eases in and settles out, and emits a pale light; the gale also writes the wind field
// (bursts), so the grass beyond a Gust ripples and a Vortex stirs the meadow round it.
//
// Allocation-free per frame: fixed pools, plain fields, typed arrays.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { SPELL_LIGHTS } from './frost.js';

export const gustTuning = {
  speed: 32,          // m/s the lance travels
  range: 24,          // m
  halfWidth0: 0.55,   // m at the hand
  halfWidth1: 1.5,    // m at full range
  scour: 0.06,        // m of loose powder stripped from snow
  berm: 0.8,          // powder banked at the lane's edges (× scour)
  compaction: 0.75,   // lays the grass (turf)
  easeIn: 0.06, easeOut: 0.25,
  burstEvery: 0.12,   // s between wind bursts along the front
  burstStrength: 1.4,
  damage: 9, knock: 1,
  lightRadius: 3.5, lightIntensity: 1.1,
};

export const vortexTuning = {
  maxRange: 14,       // m from the caster
  follow: 3,          // 1/s: how fast the column drifts to the aim
  radius: 2.3,        // m
  grow: 0.5,          // s to full strength
  settle: 1.4,        // s to die away after release
  depth: 0.12,        // m: the ring it scours (at full strength)
  berm: 0.95,
  stampEvery: 0.12,   // s
  burstEvery: 0.6, burstStrength: 0.8,
  reach: 7,           // m: Shaped within this are drawn in
  pull: 7,            // m/s toward the centre at the edge of reach
  dps: 12,
  lightRadius: 5, lightIntensity: 1.3,
};

export const updraftTuning = {
  maxRange: 12,       // m from the caster
  radius: 1.9,        // m
  height: 14,         // m: the column
  life: 2.6,          // s
  rise: 0.18,         // s to full
  accel: 42,          // m/s² up at the axis, near the ground (gravity is 24)
  ring: 0.06,         // m: the blown-out ring it leaves
  damage: 14, lift: 1, // Shaped: struck and staggered
  lightRadius: 6, lightIntensity: 1.8,
};

const GUSTS = 3, DRAFTS = 2;
/** Floats in `fx` (the renderer's uniform block, shaders/galeFx.wgsl.js): 12 vec4. */
export const GALE_FX_VEC4 = 12;

/**
 * @param {{ ts: any, ground: { qx: number, qz: number, h: number, sample: () => void }, wind: any, lights: Float32Array }} ctx
 *   ts: terrain state (brush fields + stamp), ground query, wind field (burst), shared light slots
 */
export function createGaleBending(ctx) {
  const { ts, ground, wind, lights } = ctx;
  // Gust pool: active, t, origin, dir, previous front distance, last burst time.
  const gu = { active: new Uint8Array(GUSTS), t: new Float64Array(GUSTS), ox: new Float64Array(GUSTS), oz: new Float64Array(GUSTS),
    dx: new Float64Array(GUSTS), dz: new Float64Array(GUSTS), prev: new Float64Array(GUSTS), burst: new Float64Array(GUSTS), sc: new Float64Array(GUSTS) };
  const vx = { x: 0, z: 0, y: 0, s: 0, t: 0, stamp: 0, burst: 0 };
  const up = { active: new Uint8Array(DRAFTS), x: new Float64Array(DRAFTS), z: new Float64Array(DRAFTS), y: new Float64Array(DRAFTS),
    age: new Float64Array(DRAFTS), next: 0 };
  let serial = 0;
  const fx = new Float32Array(GALE_FX_VEC4 * 4);
  const ground1 = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  // The aim target, pulled in to `max` m from the caster → (cx, cz) (no allocation).
  let cx = 0, cz = 0;
  const clampAim = (s, max) => {
    const ax = s.tx - s.x, az = s.tz - s.z, d = Math.sqrt(ax * ax + az * az);
    const k = d > max ? max / d : 1;
    cx = s.x + ax * k; cz = s.z + az * k;
  };

  const self = {
    lights, fx,
    /** Inputs (fields): caster position, aim direction (unit, horizontal), aim target on the
     *  ground (tx, ty, tz), dt, time; requests set for one frame by the owner; vortexHeld held. */
    x: 0.5, y: 0.5, z: 0.5, aimX: 0.5, aimZ: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, dt: 0.5, time: 0.5,
    castGust: false, castUpdraft: false, vortexHeld: false,
    /** Flow (game/flow.js), set with the cast: scales the Gust's range and width (1 = none). */
    power: 1,
    /** First light slot this frame (after the frost verbs'). */
    lightBase: 0,
    /** Gesture for the body: 1 right after a cast, decaying; held by the Vortex. */
    gesture: 0.5 - 0.5,
    /** Gusts for combat: per slot active, front x/z, direction, half width, id (new per cast). */
    gustActive: gu.active, gustFX: new Float64Array(GUSTS), gustFZ: new Float64Array(GUSTS), gustDX: gu.dx, gustDZ: gu.dz,
    gustHW: new Float64Array(GUSTS), gustId: new Uint32Array(GUSTS),
    /** The Vortex: centre, strength 0..1. */
    get vortexX() { return vx.x; }, get vortexZ() { return vx.z; }, get vortexStrength() { return vx.s; },
    /** An Updraft was raised this frame at (updraftX, updraftZ) (combat lifts what it catches). */
    updraftEvent: false, updraftX: 0.5, updraftZ: 0.5,

    /** Upward acceleration (m/s²) the updrafts give a body at (x, y, z): the Wraith's lift. */
    liftAt(x, y, z) {
      const T = updraftTuning;
      let a = 0;
      for (let k = 0; k < DRAFTS; k++) {
        if (!up.active[k]) continue;
        const dx = x - up.x[k], dz = z - up.z[k], r = Math.sqrt(dx * dx + dz * dz);
        if (r >= T.radius * 1.3) continue;
        const h = y - up.y[k];
        if (h < -1 || h > T.height) continue;
        const env = draftEnvelope(up.age[k]);
        const radial = 1 - Math.min(1, r / (T.radius * 1.3)); // strongest on the axis
        const top = 1 - Math.max(0, (h - T.height * 0.6) / (T.height * 0.4)); // thins at the top
        a = Math.max(a, T.accel * env * radial * radial * (2 - radial) * top);
      }
      return a;
    },

    update() {
      const dt = this.dt;
      this.gesture = Math.max(0, this.gesture - dt / 0.45);
      this.updraftEvent = false;
      if (this.castGust) { this.castGust = false; startGust(this); this.gesture = 1; }
      if (this.castUpdraft) { this.castUpdraft = false; startUpdraft(this); this.gesture = 1; }
      lights.fill(0, this.lightBase * 8, SPELL_LIGHTS * 8);
      let li = this.lightBase;
      for (let k = 0; k < GUSTS; k++) li = stepGust(k, dt, li);
      li = stepVortex(this, dt, li);
      li = stepUpdrafts(dt, li);
      if (vx.s > 0) this.gesture = Math.max(this.gesture, vx.s * 0.8);
      writeFx(this);
    },
  };

  function startGust(s) {
    let k = 0;
    for (let i = 0; i < GUSTS; i++) if (!gu.active[i]) { k = i; break; } else if (gu.t[i] > gu.t[k]) k = i;
    gu.active[k] = 1; gu.t[k] = 0; gu.ox[k] = s.x + s.aimX * 0.6; gu.oz[k] = s.z + s.aimZ * 0.6;
    gu.dx[k] = s.aimX; gu.dz[k] = s.aimZ; gu.prev[k] = 0; gu.burst[k] = -1; gu.sc[k] = s.power;
    self.gustId[k] = ++serial;
  }

  function stepGust(k, dt, li) {
    if (!gu.active[k]) { self.gustHW[k] = 0; return li; }
    const T = gustTuning;
    gu.t[k] += dt;
    const sc = gu.sc[k], range = T.range * sc;
    const t = gu.t[k], travel = range / T.speed;
    const d = Math.min(range, t * T.speed);
    if (t > travel + T.easeOut) { gu.active[k] = 0; self.gustHW[k] = 0; return li; }
    const ease = Math.min(1, t / T.easeIn) * Math.min(1, Math.max(0, (travel + T.easeOut - t) / T.easeOut));
    const hw = (T.halfWidth0 + (T.halfWidth1 - T.halfWidth0) * (d / range)) * sc;
    const dx = gu.dx[k], dz = gu.dz[k];
    const fx0 = gu.ox[k] + dx * d, fz0 = gu.oz[k] + dz * d;
    self.gustFX[k] = fx0; self.gustFZ[k] = fz0; self.gustHW[k] = hw * ease;
    const seg = d - gu.prev[k];
    if (seg > 0.01 && ease > 0.02) {
      const mid = (d + gu.prev[k]) * 0.5;
      ts.bx = gu.ox[k] + dx * mid; ts.bz = gu.oz[k] + dz * mid; ts.bdx = dx; ts.bdz = dz;
      ts.bl = seg * 0.5; ts.bw = hw; ts.bd = T.scour * ease; ts.bc = T.compaction * ease;
      ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = T.berm;
      ts.stamp();
    }
    gu.prev[k] = d;
    // The wind field: a burst along the front now and then (the grass beyond ripples).
    if (wind && d < range && t - gu.burst[k] >= T.burstEvery) { gu.burst[k] = t; wind.burst(fx0, fz0, T.burstStrength * ease); }
    if (li < SPELL_LIGHTS && d < range) {
      const o = li * 8, gy = ground1(fx0, fz0);
      lights[o] = fx0; lights[o + 1] = gy + 0.8; lights[o + 2] = fz0; lights[o + 3] = T.lightRadius;
      lights[o + 4] = 0.78; lights[o + 5] = 0.88; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * ease;
      li++;
    }
    return li;
  }

  function stepVortex(s, dt, li) {
    const T = vortexTuning;
    clampAim(s, T.maxRange);
    const ax = cx, az = cz;
    if (s.vortexHeld) {
      if (vx.s <= 0.001) { vx.x = ax; vx.z = az; vx.t = 0; vx.stamp = -1; vx.burst = -1; }
      vx.s = Math.min(1, vx.s + dt / T.grow);
    } else vx.s = Math.max(0, vx.s - dt / T.settle);
    if (vx.s <= 0) return li;
    vx.t += dt;
    // The column drifts after the aim (it is held, not thrown).
    const k = 1 - Math.exp(-T.follow * dt);
    if (s.vortexHeld) { vx.x += (ax - vx.x) * k; vx.z += (az - vx.z) * k; }
    vx.y = ground1(vx.x, vx.z);
    const e = vx.s * vx.s * (3 - 2 * vx.s);
    if (vx.t - vx.stamp >= T.stampEvery && e > 0.2) {
      vx.stamp = vx.t;
      ts.bx = vx.x; ts.bz = vx.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius; ts.bd = T.depth * e; ts.bc = 0.5 * e;
      ts.bk = BRUSH.STRIP; ts.bwet = 0; ts.bbias = 0; ts.bberm = T.berm;
      ts.stamp();
    }
    if (wind && vx.t - vx.burst >= T.burstEvery) { vx.burst = vx.t; wind.burst(vx.x, vx.z, T.burstStrength * e); }
    if (li < SPELL_LIGHTS) {
      const o = li * 8;
      lights[o] = vx.x; lights[o + 1] = vx.y + 1.6; lights[o + 2] = vx.z; lights[o + 3] = T.lightRadius;
      lights[o + 4] = 0.75; lights[o + 5] = 0.86; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * e;
      li++;
    }
    return li;
  }

  function startUpdraft(s) {
    const T = updraftTuning;
    clampAim(s, T.maxRange);
    const x = cx, z = cz;
    const k = up.next; up.next = (up.next + 1) % DRAFTS;
    up.active[k] = 1; up.x[k] = x; up.z[k] = z; up.y[k] = ground1(x, z); up.age[k] = 0;
    self.updraftEvent = true; self.updraftX = x; self.updraftZ = z;
    // The blown-out ring it leaves.
    ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = T.radius; ts.bd = T.ring; ts.bc = 0.4;
    ts.bk = BRUSH.STRIP; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1.1;
    ts.stamp();
    if (wind) wind.burst(x, z, 1.2);
  }

  function stepUpdrafts(dt, li) {
    const T = updraftTuning;
    for (let k = 0; k < DRAFTS; k++) {
      if (!up.active[k]) continue;
      up.age[k] += dt;
      if (up.age[k] > T.life) { up.active[k] = 0; continue; }
      if (li < SPELL_LIGHTS) {
        const o = li * 8, env = draftEnvelope(up.age[k]);
        lights[o] = up.x[k]; lights[o + 1] = up.y[k] + 2.5; lights[o + 2] = up.z[k]; lights[o + 3] = T.lightRadius;
        lights[o + 4] = 0.8; lights[o + 5] = 0.9; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * env;
        li++;
      }
    }
    return li;
  }

  /** The renderer's block (GALE_FX_VEC4 vec4), see shaders/galeFx.wgsl.js:
   *  [0..2] gust k: front x, ground y, front z, strength · [3..5] gust k: dir x, dir z, half width, distance travelled
   *  [6] vortex: x, ground y, z, strength · [7] vortex: radius, time, -, -
   *  [8..9] updraft k: x, ground y, z, strength · [10..11] updraft k: radius, height, age, - */
  function writeFx(s) {
    const T = gustTuning;
    for (let k = 0; k < GUSTS; k++) {
      const o = k * 4, o2 = (3 + k) * 4;
      if (!gu.active[k]) { fx[o + 3] = 0; continue; }
      const range = T.range * gu.sc[k], d = Math.min(range, gu.t[k] * T.speed), travel = range / T.speed;
      const ease = Math.min(1, gu.t[k] / T.easeIn) * Math.min(1, Math.max(0, (travel + T.easeOut - gu.t[k]) / T.easeOut));
      fx[o] = self.gustFX[k]; fx[o + 1] = ground1(self.gustFX[k], self.gustFZ[k]); fx[o + 2] = self.gustFZ[k]; fx[o + 3] = ease;
      fx[o2] = gu.dx[k]; fx[o2 + 1] = gu.dz[k]; fx[o2 + 2] = self.gustHW[k]; fx[o2 + 3] = d;
    }
    fx[24] = vx.x; fx[25] = vx.y; fx[26] = vx.z; fx[27] = vx.s * vx.s * (3 - 2 * vx.s);
    fx[28] = vortexTuning.radius; fx[29] = vx.t; fx[30] = 0; fx[31] = 0;
    for (let k = 0; k < DRAFTS; k++) {
      const o = (8 + k) * 4, o2 = (10 + k) * 4;
      fx[o] = up.x[k]; fx[o + 1] = up.y[k]; fx[o + 2] = up.z[k]; fx[o + 3] = up.active[k] ? draftEnvelope(up.age[k]) : 0;
      fx[o2] = updraftTuning.radius; fx[o2 + 1] = updraftTuning.height; fx[o2 + 2] = up.age[k]; fx[o2 + 3] = 0;
    }
  }

  return self;
}

/** An updraft's strength over its life: rises fast, holds, then dies away over the last 40 %. */
export function draftEnvelope(age) {
  const T = updraftTuning;
  if (age < 0 || age > T.life) return 0;
  const a = Math.min(1, age / T.rise), b = Math.min(1, (T.life - age) / (T.life * 0.4));
  return a * b * b * (3 - 2 * b);
}
