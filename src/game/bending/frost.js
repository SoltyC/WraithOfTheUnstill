// Frost bending (BRIEF §9.2): Sweep (tap), Ribbon (hold), Crystallize (heavy). Every verb reads
// and writes the terrain state through the shared brush path, eases in from the ground and
// settles back into it (nothing spawns or despawns instantly), and emits light that the snow's
// subsurface term picks up (spell lights, §5.3).
//
// Allocation-free per frame: fixed pools, plain fields, typed arrays.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export const sweepTuning = {
  speed: 15,          // m/s the crescent travels
  range: 14,          // m
  halfWidth0: 0.75,   // m at the hand
  halfWidth1: 1.5,    // m at full range (the crescent fans out)
  depth: 0.2,         // m: the channel it ploughs
  berm: 1.05,
  wetness: 0.85,      // slush left in the channel
  easeIn: 0.12,       // s
  easeOut: 0.3,       // s (of the travel time)
  lightRadius: 4,     // m
  lightIntensity: 1.6,
};

export const ribbonTuning = {
  nodes: 48,          // spine length (one node emitted per emitStep seconds)
  emitStep: 1 / 60,
  speed: 13,          // m/s leaving the hand
  gravity: 7,         // m/s² (water held together by the bending: lighter than a fall)
  life: 1.15,         // s per node (flight to the aim, then skimming)
  skimFriction: 2.5,  // 1/s along the ground
  minRange: 3, maxRange: 18,
  radius: 0.055,      // m at full body
  scoreHalfWidth: 0.05, scoreDepth: 0.035, wetness: 0.9,
  scoreTime: 0.12,    // s after a node lands during which it scores
  lightRadius: 3, lightIntensity: 1.2,
};

export const crystalTuning = {
  clusters: 24,       // pool (the oldest formation is reused)
  perCluster: 11,
  spread: 1.05,       // m: radius the satellite crystals rise within
  iceRadius: 2.4,     // m: glossy ice spreads this far under a formation (permanent)
  iceSpread: 0.6,     // s to spread
  lightRadius: 6, lightIntensity: 2.4, lightHold: 0.6, lightFade: 3.5,
};

/** Spell lights published to materials: 4 × (pos.xyz, radius), (colour.rgb, intensity). */
export const SPELL_LIGHTS = 4;

/**
 * @param {{ ts: any, fx: any, ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 *   ts: terrain state (brush fields + stamp), fx: particle sink (emit fields + emit), ground query
 */
export function createFrostBending(ctx) {
  const { ts, fx, ground } = ctx;
  /** Spell lights (written in place: the terrain material reads this array). */
  const lights = ctx.lights || new Float32Array(SPELL_LIGHTS * 8);
  const SWEEPS = 4;
  // Sweep pool: active, t, origin x/z, dir x/z, previous front distance.
  const sw = { active: new Uint8Array(SWEEPS), t: new Float64Array(SWEEPS), ox: new Float64Array(SWEEPS), oz: new Float64Array(SWEEPS),
    dx: new Float64Array(SWEEPS), dz: new Float64Array(SWEEPS), prev: new Float64Array(SWEEPS) };
  let seed = 11, sweepSerial = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // Ribbon spine: a ring of nodes (oldest overwritten): pos, vel, age, grounded, previous
  // ground contact (for scoring). Published for the tube mesh as pos.xyz + life fraction.
  const R = ribbonTuning.nodes;
  const rb = { px: new Float64Array(R), py: new Float64Array(R), pz: new Float64Array(R), vx: new Float64Array(R), vy: new Float64Array(R), vz: new Float64Array(R),
    age: new Float64Array(R).fill(1e9), ground: new Uint8Array(R), sx: new Float64Array(R), sz: new Float64Array(R), land: new Float64Array(R),
    head: 0, acc: 0, strength: 0 };
  /** Ribbon nodes for the renderer, in emission order from the hand (index 0 = newest): pos.xyz, alpha. */
  const ribbonNodes = new Float32Array(R * 4);
  // Crystals: per prism 3 vec4 — base (x, y, z, birth time), axis (x, y, z, height), (radius, seed,
  // grow time, cluster). Written only when a formation is cast (crystalsDirty).
  const CC = crystalTuning.clusters, CK = crystalTuning.perCluster;
  const crystals = new Float32Array(CC * CK * 12);
  const cl = { x: new Float64Array(CC), y: new Float64Array(CC), z: new Float64Array(CC), age: new Float64Array(CC).fill(1e9), next: 0 };

  const self = {
    lights, ribbonNodes, crystals,
    /** Sweeps for combat: per slot active, front x/z, direction x/z, half width, id (new per cast). */
    sweepActive: sw.active, sweepFX: new Float64Array(SWEEPS), sweepFZ: new Float64Array(SWEEPS), sweepDX: sw.dx, sweepDZ: sw.dz,
    sweepHW: new Float64Array(SWEEPS), sweepId: new Uint32Array(SWEEPS),
    /** A formation was cast this frame at (crystalX, crystalZ) (combat freezes what it catches). */
    crystalEvent: false, crystalX: 0.5, crystalZ: 0.5,
    /** True after a formation was written (the renderer uploads and clears it). */
    crystalsDirty: false,
    /** Heavy: freeze a formation at the aim target (tx, ty, tz) this frame. */
    castCrystal: false,
    /** Gesture for the body: 1 right after a cast, decaying; held by the Ribbon. */
    gesture: 0.5 - 0.5,
    /** Ribbon: held (input), hand position (hx, hy, hz), aim target (tx, ty, tz) on the ground. */
    ribbonHeld: false, hx: 0.5, hy: 0.5, hz: 0.5, tx: 0.5, ty: 0.5, tz: 0.5,
    /** 0..1 how much stream is out (eases in on hold, out on release). */
    get ribbonStrength() { return rb.strength; },
    /** Inputs (fields): caster position (hand height ignored: verbs run along the ground), aim
     *  direction (unit, horizontal), dt, time; requests set for one frame by the owner. */
    x: 0.5, y: 0.5, z: 0.5, aimX: 0.5, aimZ: 0.5, dt: 0.5, time: 0.5,
    castSweep: false,

    update() {
      this.gesture = Math.max(0, this.gesture - this.dt / 0.45);
      this.crystalEvent = false;
      if (this.castSweep) { this.castSweep = false; startSweep(this); this.gesture = 1; }
      if (this.castCrystal) { this.castCrystal = false; startCrystals(this); this.gesture = 1; }
      lights.fill(0);
      let li = 0;
      for (let k = 0; k < SWEEPS; k++) if (sw.active[k]) li = stepSweep(k, this.dt, li);
      li = stepRibbon(this, li);
      li = stepCrystals(this.dt, li);
    },
  };

  function startSweep(s) {
    let k = 0;
    for (; k < SWEEPS; k++) if (!sw.active[k]) break;
    if (k === SWEEPS) return;
    const l = Math.sqrt(s.aimX * s.aimX + s.aimZ * s.aimZ) || 1;
    sw.active[k] = 1; sw.t[k] = 0;
    sw.dx[k] = s.aimX / l; sw.dz[k] = s.aimZ / l;
    sw.ox[k] = s.x + sw.dx[k] * 0.6; sw.oz[k] = s.z + sw.dz[k] * 0.6;
    sw.prev[k] = 0;
    self.sweepId[k] = ++sweepSerial;
  }

  /** Advance sweep k: plough from its previous front to the new one; spray the crescent. */
  function stepSweep(k, dt, li) {
    const T = sweepTuning;
    sw.t[k] += dt;
    const travel = T.range / T.speed;
    const t = sw.t[k];
    const d = Math.min(T.range, t * T.speed);
    // Ease in from the ground, settle back out at the end of its run.
    const ease = Math.min(1, t / T.easeIn) * Math.min(1, Math.max(0, (travel + T.easeOut - t) / T.easeOut));
    const f = d / T.range, hw = T.halfWidth0 + (T.halfWidth1 - T.halfWidth0) * f;
    const dx = sw.dx[k], dz = sw.dz[k];
    const seg = d - sw.prev[k];
    if (seg > 0.01 && ease > 0.02) {
      const mid = (d + sw.prev[k]) * 0.5;
      ts.bx = sw.ox[k] + dx * mid; ts.bz = sw.oz[k] + dz * mid; ts.bdx = dx; ts.bdz = dz;
      ts.bl = seg * 0.5; ts.bw = hw; ts.bd = T.depth * ease; ts.bc = 0.6;
      ts.bk = BRUSH.PLOUGH; ts.bwet = T.wetness * ease; ts.bbias = 0; ts.bberm = T.berm;
      ts.stamp();
    }
    sw.prev[k] = d;
    self.sweepFX[k] = sw.ox[k] + dx * d; self.sweepFZ[k] = sw.oz[k] + dz * d; self.sweepHW[k] = hw * Math.min(1, ease * 2);
    // The crescent: a wall of slush along an arc ahead of the channel, thrown up and forward.
    const fx0 = sw.ox[k] + dx * d, fz0 = sw.oz[k] + dz * d;
    ground.qx = fx0; ground.qz = fz0; ground.sample();
    const gy = ground.h;
    const rx = dz, rz = -dx;
    const n = Math.round(22 * ease);
    for (let p = 0; p < n; p++) {
      const u = rnd() * 2 - 1;                       // across the crescent
      const back = u * u * hw * 0.55;                 // horns trail behind the centre
      fx.ex = fx0 + rx * u * hw - dx * back; fx.ez = fz0 + rz * u * hw - dz * back; fx.ey = gy + 0.05;
      const fwd = T.speed * (0.45 + 0.3 * rnd());
      fx.evx = dx * fwd + rx * u * 1.5; fx.evz = dz * fwd + rz * u * 1.5; fx.evy = 1.6 + 2.2 * rnd() * (1 - 0.5 * Math.abs(u));
      fx.esize = -(0.05 + 0.07 * rnd());              // negative: slush
      fx.emit();
    }
    // A spell light rides with the crescent (cold, inside the slush wall).
    if (li < SPELL_LIGHTS) {
      const o = li * 8;
      lights[o] = fx0; lights[o + 1] = gy + 0.4; lights[o + 2] = fz0; lights[o + 3] = T.lightRadius;
      lights[o + 4] = 0.55; lights[o + 5] = 0.8; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * ease;
      li++;
    }
    if (t > travel + T.easeOut) sw.active[k] = 0;
    return li;
  }

  /** A crystal formation at the aim: a tall central crystal and satellites leaning out of it. */
  function startCrystals(s) {
    const T = crystalTuning, c = cl.next; cl.next = (cl.next + 1) % CC;
    cl.x[c] = s.tx; cl.z[c] = s.tz;
    self.crystalEvent = true; self.crystalX = s.tx; self.crystalZ = s.tz; ground.qx = s.tx; ground.qz = s.tz; ground.sample(); cl.y[c] = ground.h; cl.age[c] = 0;
    for (let k = 0; k < CK; k++) {
      const o = (c * CK + k) * 12;
      const centre = k === 0;
      const a = rnd() * Math.PI * 2, r = centre ? 0 : T.spread * (0.25 + 0.75 * Math.sqrt(rnd()));
      const x = s.tx + Math.cos(a) * r, z = s.tz + Math.sin(a) * r;
      ground.qx = x; ground.qz = z; ground.sample();
      // Lean outward from the centre (satellites), up to ~40°; the centre leans a little.
      const tilt = centre ? 0.08 + 0.1 * rnd() : 0.2 + 0.5 * rnd() * (r / T.spread + 0.3);
      const ta = centre ? rnd() * Math.PI * 2 : a + (rnd() - 0.5) * 0.6;
      const st = Math.sin(tilt);
      crystals[o] = x; crystals[o + 1] = ground.h - 0.08; crystals[o + 2] = z;
      crystals[o + 3] = s.time + (centre ? 0 : 0.04 + 0.22 * rnd() * (r / T.spread));
      crystals[o + 4] = Math.cos(ta) * st; crystals[o + 5] = Math.cos(tilt); crystals[o + 6] = Math.sin(ta) * st;
      crystals[o + 7] = centre ? 1.25 + 0.4 * rnd() : (0.35 + 0.7 * rnd()) * (1.1 - 0.5 * r / T.spread);
      crystals[o + 8] = centre ? 0.16 + 0.04 * rnd() : 0.05 + 0.07 * rnd();
      crystals[o + 9] = rnd();
      crystals[o + 10] = centre ? 0.55 : 0.35 + 0.3 * rnd();
      crystals[o + 11] = c;
    }
    self.crystalsDirty = true;
  }

  /** Formations: spread the permanent ice beneath them; their light flares, then fades. */
  function stepCrystals(dt, li) {
    const T = crystalTuning;
    for (let c = 0; c < CC; c++) {
      if (cl.age[c] > 1e8) continue;
      const age = cl.age[c] += dt;
      if (age < T.iceSpread + 0.1) {
        const f = Math.min(1, age / T.iceSpread), e = 1 - (1 - f) * (1 - f);
        ts.bx = cl.x[c]; ts.bz = cl.z[c]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = Math.max(0.2, T.iceRadius * e); ts.bd = 0; ts.bc = 0.5;
        ts.bk = BRUSH.FREEZE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
      }
      const lt = age < T.lightHold ? 1 : Math.max(0, 1 - (age - T.lightHold) / T.lightFade);
      if (lt > 0 && li < SPELL_LIGHTS) {
        const o = li * 8;
        lights[o] = cl.x[c]; lights[o + 1] = cl.y[c] + 0.7; lights[o + 2] = cl.z[c]; lights[o + 3] = T.lightRadius;
        lights[o + 4] = 0.55; lights[o + 5] = 0.85; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * lt * Math.min(1, age / 0.15);
        li++;
      }
    }
    return li;
  }

  /** Ribbon: emit at the hand toward the aim, fly, arc, land and skim; score where it skims. */
  function stepRibbon(s, li) {
    const T = ribbonTuning, dt = s.dt;
    rb.strength += ((s.ribbonHeld ? 1 : 0) - rb.strength) * (1 - Math.exp(-dt * (s.ribbonHeld ? 6 : 3)));
    // Emit nodes while held (one per emitStep).
    if (s.ribbonHeld) {
      rb.acc += dt;
      while (rb.acc >= T.emitStep) {
        rb.acc -= T.emitStep;
        const i = rb.head = (rb.head + R - 1) % R;
        rb.px[i] = s.hx; rb.py[i] = s.hy; rb.pz[i] = s.hz;
        // Ballistic aim: launched so it lands on the aim point after distance/speed seconds,
        // whatever the slope (it arcs over level ground, dives onto ground falling away).
        const ax = s.tx - s.hx, ay = s.ty + 0.03 - s.hy, az = s.tz - s.hz;
        const tau = Math.min(0.9, Math.max(0.25, Math.sqrt(ax * ax + az * az) / T.speed));
        rb.vx[i] = ax / tau; rb.vy[i] = ay / tau + 0.5 * T.gravity * tau; rb.vz[i] = az / tau;
        rb.age[i] = 0; rb.ground[i] = 0;
      }
    } else rb.acc = 0;
    let lit = false;
    for (let n = 0; n < R; n++) {
      const i = (rb.head + n) % R;
      if (rb.age[i] >= T.life) { ribbonNodes[n * 4 + 3] = 0; continue; }
      rb.age[i] += dt;
      rb.vy[i] -= T.gravity * dt;
      rb.px[i] += rb.vx[i] * dt; rb.py[i] += rb.vy[i] * dt; rb.pz[i] += rb.vz[i] * dt;
      ground.qx = rb.px[i]; ground.qz = rb.pz[i]; ground.sample();
      const gy = ground.h + 0.03;
      // Once down, a node stays in contact (it follows the slope instead of flying off a
      // downhill as the ground falls away from it).
      if (rb.py[i] <= gy || (rb.ground[i] && rb.py[i] <= gy + 0.25)) {
        // Skims along the surface, scoring a thin wet line.
        rb.py[i] = gy;
        const k = Math.exp(-dt * T.skimFriction);
        rb.vx[i] *= k; rb.vz[i] *= k;
        ground.qx = rb.px[i] + rb.vx[i] * dt; ground.qz = rb.pz[i] + rb.vz[i] * dt; ground.sample();
        rb.vy[i] = (ground.h + 0.03 - gy) / Math.max(dt, 1e-4);
        if (!rb.ground[i]) { rb.sx[i] = rb.px[i]; rb.sz[i] = rb.pz[i]; rb.ground[i] = 1; rb.land[i] = rb.age[i]; }
        // Score from the last stamped point once the node has slid far enough (keeps the brush
        // queue near what the GPU drains per frame).
        const dx = rb.px[i] - rb.sx[i], dz = rb.pz[i] - rb.sz[i], len = Math.sqrt(dx * dx + dz * dz);
        // Only where the stream meets the snow (just after a node lands) does it score: the line
        // traces the contact point as the aim moves, instead of every skimming node scratching.
        if (len > 0.15 && rb.age[i] - rb.land[i] < ribbonTuning.scoreTime) {
          ts.bx = (rb.px[i] + rb.sx[i]) * 0.5; ts.bz = (rb.pz[i] + rb.sz[i]) * 0.5; ts.bdx = dx / len; ts.bdz = dz / len;
          ts.bl = len * 0.5; ts.bw = T.scoreHalfWidth; ts.bd = T.scoreDepth; ts.bc = 0.3;
          ts.bk = BRUSH.SCORE; ts.bwet = T.wetness; ts.bbias = 0; ts.bberm = 0;
          ts.stamp();
          rb.sx[i] = rb.px[i]; rb.sz[i] = rb.pz[i];
        }
      }
      const fade = (1 - rb.age[i] / T.life);
      ribbonNodes[n * 4] = rb.px[i]; ribbonNodes[n * 4 + 1] = rb.py[i]; ribbonNodes[n * 4 + 2] = rb.pz[i];
      ribbonNodes[n * 4 + 3] = Math.min(1, fade * 3) * rb.strength;
      // The light rides near the head of the stream.
      if (!lit && n === 6 && li < SPELL_LIGHTS && rb.strength > 0.05) {
        const o = li * 8;
        lights[o] = rb.px[i]; lights[o + 1] = rb.py[i] + 0.2; lights[o + 2] = rb.pz[i]; lights[o + 3] = T.lightRadius;
        lights[o + 4] = 0.5; lights[o + 5] = 0.78; lights[o + 6] = 1.0; lights[o + 7] = T.lightIntensity * rb.strength;
        li++; lit = true;
      }
    }
    return li;
  }

  return self;
}
