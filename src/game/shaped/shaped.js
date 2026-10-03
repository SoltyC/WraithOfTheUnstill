// The Shaped (BRIEF §8.3, §10): a pool of creatures made of the biome's material that rise out of
// the terrain, hunt the Wraith, and collapse back into it. At most MAX_SHAPED are active (the
// encounter limit). Each slot has a procedural body (body.js), a chunk rig (rig.js), a simple
// readable state machine per archetype, health, and terrain writes: a hollow where it rose,
// prints where it steps, a mound where it fell. Allocation-free per frame.

import { ShapedBody } from './body.js';
import { ARCHETYPES } from './archetypes.js';
import { buildRig, createRigState, writeAlive, writeFall, writeHidden, startFall, CHUNK_FLOATS } from './rig.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export const MAX_SHAPED = 8;
/** Chunk records per slot (the largest archetype). */
export const CHUNKS_PER = 96;

// States.
export const S = { EMPTY: 0, RISING: 1, STALK: 2, TELEGRAPH: 3, LUNGE: 4, RECOVER: 5, STAGGER: 6, FROZEN: 7, FALLING: 8, SLAM: 9, CAST: 10 };
/** Thrown ice shards in flight (their chunk records follow the creatures'). */
export const MAX_SHOTS = 12;

const RISE_TIME = 1.5, FALL_TIME = 1.1, SINK_TIME = 2.6;

/**
 * @param {{ ts: any, fx: any, ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createShaped(ctx) {
  const { ts, fx, ground } = ctx;
  const rigs = {};
  for (const k in ARCHETYPES) rigs[k] = buildRig(ARCHETYPES[k].shape, Math.min(CHUNKS_PER, ARCHETYPES[k].chunks), 1234 + k.length * 77, ARCHETYPES[k].rig);
  const slots = [];
  for (let i = 0; i < MAX_SHAPED; i++) slots.push({ idx: i, arch: null, body: null, rig: null, st: null, state: S.EMPTY, t: 0, hp: 0, glow: 0,
    cool: 0, lungeX: 0, lungeZ: 0, hitDone: false, orbit: 0, fallSink: 0, wet: 0, frozenFor: 0, sweepHit: 0, hurt: 0, flinch: 0 });
  /** Chunk records for the renderer (MAX_SHAPED × CHUNKS_PER). */
  const chunks = new Float32Array((MAX_SHAPED * CHUNKS_PER + MAX_SHOTS) * CHUNK_FLOATS);
  // Shards: position, velocity, alive.
  const shot = { x: new Float64Array(MAX_SHOTS), y: new Float64Array(MAX_SHOTS), z: new Float64Array(MAX_SHOTS),
    vx: new Float64Array(MAX_SHOTS), vy: new Float64Array(MAX_SHOTS), vz: new Float64Array(MAX_SHOTS),
    live: new Uint8Array(MAX_SHOTS), dmg: new Float64Array(MAX_SHOTS), next: 0 };
  let seed = 99;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // Bodies are built per slot on first use of an archetype (spawn), then reused.
  function bodyFor(slot, name) {
    if (slot.arch !== name) {
      const A = ARCHETYPES[name];
      slot.arch = name; slot.body = new ShapedBody(A.shape, ground); slot.rig = rigs[name]; slot.st = createRigState(slot.rig);
    }
    return slot.body;
  }

  const self = {
    slots, chunks,
    /** Player (fields): position, velocity. Events out: hits on the player this frame. */
    px: 0.5, pz: 0.5, pvx: 0.5, pvz: 0.5, dt: 0.5, time: 0.5,
    hits: 0, hitDamage: 0.5 - 0.5,
    /** The Wraith is on the ground (slams and shockwaves pass under a jump). */
    pgrounded: true,
    /** The pack's lunge token: one hound attacks at a time while the rest circle (−1 free). */
    lungeToken: -1,
    /** A shattering kill happened this frame (owner: the big hit-stop and punch) at (bx, by, bz). */
    shattered: 0, bx: 0.5, by: 0.5, bz: 0.5,
    /** Ground slams this frame (camera shake), and the strongest one's distance to the Wraith. */
    slams: 0, slamDist: 0.5,
    /** Spawn an archetype at (x, z): it rises out of the snow. Returns the slot or −1. */
    spawn(name, x, z) {
      let i = 0;
      for (; i < MAX_SHAPED; i++) if (slots[i].state === S.EMPTY) break;
      if (i === MAX_SHAPED) return -1;
      const s = slots[i], A = ARCHETYPES[name];
      const b = bodyFor(s, name);
      b.place(x, z, Math.atan2(this.px - x, this.pz - z));
      b.rise = 0; b.crouch = 0; b.lift = 0; b.frozen = false; b.wantVx = 0; b.wantVz = 0;
      s.state = S.RISING; s.t = 0; s.hp = A.health; s.glow = 0; s.cool = 1 + rnd(); s.orbit = rnd() * Math.PI * 2; s.fallSink = 0;
      s.wet = 0; s.frozenFor = 0; s.sweepHit = 0; s.hurt = 0; s.flinch = 0;
      s.orbit = (i / MAX_SHAPED) * Math.PI * 2 * 3.3;   // a pack spreads round the Wraith
      // The hollow it rises out of: snow ploughed aside into a ring.
      ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = A.shape.spacing * A.shape.spine * 0.55; ts.bd = 0.22; ts.bc = 0.3;
      ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.9;
      ts.stamp();
      return i;
    },
    /** Damage slot i; stagger knocks it back along (kx, kz). Returns true if it died. */
    damage(i, amount, stagger, kx, kz) {
      const s = slots[i];
      if (s.state === S.EMPTY || s.state === S.FALLING) return false;
      if (s.state === S.RISING && amount < 1e8) return false;
      s.hp -= amount;
      s.hurt = 1;
      if (s.hp <= 0) {
        const shatter = s.state === S.FROZEN;
        if (shatter) { this.shattered++; this.bx = s.body.sx[1]; this.by = s.body.sy[1]; this.bz = s.body.sz[1]; }
        die(s, shatter ? 7 : 0);
        return true;
      }
      const A = ARCHETYPES[s.arch], poise = A.poise || 0, b = s.body;
      if (stagger && amount >= poise && s.state !== S.FROZEN) {
        s.state = S.STAGGER; s.t = 0; b.vx = kx * A.knock; b.vz = kz * A.knock; b.crouch = 0; b.lift = 0;
        if (this.lungeToken === s.idx) this.lungeToken = -1;
      } else if (s.state !== S.FROZEN && amount > 1) {
        // Every real hit tells: a recoil along the blow and a flinch (a hop, a dip, a rock).
        b.vx += kx * A.knock * 0.5; b.vz += kz * A.knock * 0.5; s.flinch = 1;
      }
      return false;
    },
    /** Freeze slot i solid for `seconds` (wet Shaped freeze longer). */
    freeze(i, seconds) {
      const s = slots[i];
      if (s.state === S.EMPTY || s.state === S.FALLING || s.state === S.RISING) return;
      s.state = S.FROZEN; s.t = 0; s.frozenFor = seconds + (s.wet > 0 ? 2 : 0); s.glow = 0;
      s.body.lift = 0; s.body.crouch = 0;
    },
    isFrozen(i) { return slots[i].state === S.FROZEN; },
    isLive(i) { const st = slots[i].state; return st !== S.EMPTY && st !== S.FALLING && st !== S.RISING; },
    /** Material chips off slot i: spray thrown along (dx, dz), and small mounds of it left in the snow. */
    chip(i, dx, dz, amount) {
      const s = slots[i], b = s.body;
      const n = Math.min(40, Math.round(10 + amount));
      for (let k = 0; k < n; k++) {
        fx.ex = b.sx[1] + (rnd() - 0.5) * 0.4; fx.ez = b.sz[1] + (rnd() - 0.5) * 0.4; fx.ey = b.sy[1] + (rnd() - 0.3) * 0.3;
        fx.evx = dx * (1.5 + 3 * rnd()) + (rnd() - 0.5) * 2; fx.evz = dz * (1.5 + 3 * rnd()) + (rnd() - 0.5) * 2; fx.evy = 0.8 + 2.4 * rnd();
        fx.esize = 0.04 + 0.08 * rnd();
        fx.emit();
      }
      const m = amount > 25 ? 3 : 1;
      for (let k = 0; k < m; k++) {
        ts.bx = b.sx[1] + dx * (0.6 + 0.9 * rnd()) + (rnd() - 0.5) * 0.6; ts.bz = b.sz[1] + dz * (0.6 + 0.9 * rnd()) + (rnd() - 0.5) * 0.6;
        ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 0.12 + 0.12 * rnd(); ts.bd = 0.05 + 0.05 * rnd(); ts.bc = 0;
        ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
      }
    },
    update() {
      const dt = this.dt;
      this.hits = 0; this.hitDamage = 0; this.slams = 0; this.slamDist = 1e9; this.shattered = 0;
      if (this.lungeToken >= 0) { const ts0 = slots[this.lungeToken].state; if (ts0 !== S.TELEGRAPH && ts0 !== S.LUNGE) this.lungeToken = -1; }
      stepShots(this, dt);
      for (let i = 0; i < MAX_SHAPED; i++) {
        const s = slots[i];
        const rec = i * CHUNKS_PER;
        if (s.state === S.EMPTY) { writeHidden(chunks, rec, CHUNKS_PER); continue; }
        s.t += dt;
        if (s.state === S.FALLING) {
          const sink = Math.max(0, (s.t - FALL_TIME) / SINK_TIME);
          if (s.t >= FALL_TIME && s.fallSink === 0) {
            // Settled: the mound of displaced mass it leaves (heals like any displaced snow).
            const b = s.body, A = ARCHETYPES[s.arch];
            ts.bx = b.sx[2]; ts.bz = b.sz[2]; ts.bdx = Math.sin(b.heading); ts.bdz = Math.cos(b.heading);
            ts.bl = A.shape.spacing * A.shape.spine * 0.35; ts.bw = A.shape.hip * 0.8; ts.bd = A.shape.hip * 0.45; ts.bc = 0.4;
            ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
            ts.stamp();
            s.fallSink = 1;
          }
          writeFall(s.st, chunks, rec, dt, Math.min(1, sink), ground);
          if (sink >= 1) { s.state = S.EMPTY; writeHidden(chunks, rec, CHUNKS_PER); }
          continue;
        }
        think(s, this, dt);
        const b = s.body;
        s.hurt = Math.max(0, s.hurt - dt * 5);
        if (s.flinch > 0) {
          // Flinch: hounds hop back, the big ones dip and rock.
          s.flinch = Math.max(0, s.flinch - dt * 4);
          const f = Math.sin(Math.PI * (1 - s.flinch));
          if (s.arch === 'hound') b.lift = Math.max(b.lift, 0.22 * f);
          else b.crouch = Math.max(b.crouch, 0.35 * f);
        }
        // Keep apart: Shaped push off each other instead of overlapping.
        const ri = ARCHETYPES[s.arch].shape.hip * 0.9;
        for (let j = 0; j < MAX_SHAPED; j++) {
          const o = slots[j];
          if (j === i || o.state === S.EMPTY || o.state === S.FALLING) continue;
          const ex = b.x - o.body.x, ez = b.z - o.body.z, d = Math.sqrt(ex * ex + ez * ez) || 1e-3;
          const min = ri + ARCHETYPES[o.arch].shape.hip * 0.9;
          if (d < min) { const push = (min - d) / min * 4; b.wantVx += ex / d * push; b.wantVz += ez / d * push; }
        }
        b.dt = dt; b.update();
        // Prints where it steps.
        for (let e = 0; e < b.evCount; e++) {
          const o = e * 5;
          ts.bx = b.ev[o]; ts.bz = b.ev[o + 1]; ts.bdx = b.ev[o + 2]; ts.bdz = b.ev[o + 3]; ts.bl = 0.03; ts.bw = 0.055; ts.bd = 0.035; ts.bc = 0.7;
          ts.stamp();
        }
        const rise = s.state === S.RISING ? Math.min(1, s.t / RISE_TIME) : 1;
        b.rise = 0.55 + 0.45 * rise;
        s.wet = Math.max(0, s.wet - dt);
        // Glow channel: telegraph light 0..1, +2 when frozen solid (glazed ice in the shader).
        writeAlive(b, s.st, chunks, rec, rise, s.glow + (s.state === S.FROZEN ? 2 : 0), s.hurt);
        for (let c = s.rig.count; c < CHUNKS_PER; c++) chunks[(rec + c) * CHUNK_FLOATS + 15] = 0;
        if (s.state === S.RISING) {
          // Snow gathering up into the body as it forms.
          for (let k = 0; k < 4; k++) {
            const a = rnd() * Math.PI * 2, r = 0.3 + 0.7 * rnd();
            fx.ex = b.x + Math.cos(a) * r; fx.ez = b.z + Math.sin(a) * r; fx.ey = b.y + 0.05;
            fx.evx = -Math.cos(a) * 0.8; fx.evz = -Math.sin(a) * 0.8; fx.evy = 0.8 + 1.2 * rnd();
            fx.esize = 0.05 + 0.07 * rnd();
            fx.emit();
          }
        }
      }
    },
    /** Throw a shard from (sx, sy, sz) at (tx, ty, tz) at shotSpeed, wounding shotDmg (fields in;
     *  the Warden's volley uses the same pool). */
    sx: 0.5, sy: 0.5, sz: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, shotSpeed: 14.5, shotDmg: 12.5,
    shoot() { throwShard(this.sx, this.sy, this.sz, this.tx, this.ty, this.tz, this.shotSpeed, this.shotDmg); },
    /** Count of living (or rising) Shaped. */
    get alive() { let n = 0; for (let i = 0; i < MAX_SHAPED; i++) if (slots[i].state !== S.EMPTY && slots[i].state !== S.FALLING) n++; return n; },
  };

  /** Shards: fly (light gravity), wound the Wraith on contact, score the snow where they land. */
  function stepShots(P, dt) {
    const base = MAX_SHAPED * CHUNKS_PER;
    for (let k = 0; k < MAX_SHOTS; k++) {
      const o = (base + k) * CHUNK_FLOATS;
      if (!shot.live[k]) { chunks[o + 15] = 0; continue; }
      shot.vy[k] -= 3 * dt;
      const ox = shot.x[k], oz = shot.z[k];
      shot.x[k] += shot.vx[k] * dt; shot.y[k] += shot.vy[k] * dt; shot.z[k] += shot.vz[k] * dt;
      const dx = shot.x[k] - P.px, dz = shot.z[k] - P.pz;
      ground.qx = shot.x[k]; ground.qz = shot.z[k]; ground.sample();
      if (dx * dx + dz * dz < 0.36 && shot.y[k] - ground.h < 1.9) { P.hits++; P.hitDamage += shot.dmg[k]; shot.live[k] = 0; chunks[o + 15] = 0; continue; }
      if (shot.y[k] <= ground.h + 0.05) {
        // Buried in the snow: a scored gash along its flight, a puff of powder.
        const sx = shot.x[k] - ox, sz = shot.z[k] - oz, sl = Math.hypot(sx, sz) || 1;
        ts.bx = shot.x[k]; ts.bz = shot.z[k]; ts.bdx = sx / sl; ts.bdz = sz / sl; ts.bl = 0.35; ts.bw = 0.06; ts.bd = 0.06; ts.bc = 0.3;
        ts.bk = BRUSH.SCORE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
        for (let q = 0; q < 8; q++) { fx.ex = shot.x[k]; fx.ey = ground.h + 0.05; fx.ez = shot.z[k]; fx.evx = (rnd() - 0.5) * 2; fx.evz = (rnd() - 0.5) * 2; fx.evy = 0.5 + rnd() * 1.5; fx.esize = 0.05 + 0.05 * rnd(); fx.emit(); }
        shot.live[k] = 0; chunks[o + 15] = 0; continue;
      }
      // Render: a long ice shard pointing along its flight.
      const v = Math.hypot(shot.vx[k], shot.vy[k], shot.vz[k]) || 1;
      const ux = shot.vx[k] / v, uy = shot.vy[k] / v, uz = shot.vz[k] / v;
      let fx2 = -uz, fz2 = ux; const fl = Math.hypot(fx2, fz2) || 1; fx2 /= fl; fz2 /= fl;
      chunks[o] = shot.x[k]; chunks[o + 1] = shot.y[k]; chunks[o + 2] = shot.z[k]; chunks[o + 3] = 0.09;
      chunks[o + 4] = fx2; chunks[o + 5] = 0; chunks[o + 6] = fz2; chunks[o + 7] = 0.6;
      chunks[o + 8] = ux; chunks[o + 9] = uy; chunks[o + 10] = uz; chunks[o + 11] = 0.09;
      chunks[o + 12] = k * 13.7; chunks[o + 13] = 1; chunks[o + 14] = 0.6; chunks[o + 15] = 1;
    }
  }
  function throwShard(x, y, z, tx, ty, tz, speed, dmg) {
    const k = shot.next; shot.next = (shot.next + 1) % MAX_SHOTS;
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1, t = d / speed;
    shot.x[k] = x; shot.y[k] = y; shot.z[k] = z;
    shot.vx[k] = dx / t; shot.vz[k] = dz / t; shot.vy[k] = (ty - y) / t + 1.5 * t;   // lands on target
    shot.live[k] = 1; shot.dmg[k] = dmg;
  }

  function die(s, burst) {
    s.state = S.FALLING; s.t = 0; s.glow = 0;
    if (self.lungeToken === s.idx) self.lungeToken = -1;
    startFall(s.body, s.st, rnd, burst);
    if (burst > 0) {
      // Shattered: a blast of ice glinting outward.
      const b = s.body;
      for (let k = 0; k < 60; k++) {
        const a = rnd() * Math.PI * 2, up = rnd();
        fx.ex = b.sx[1]; fx.ey = b.sy[1]; fx.ez = b.sz[1];
        fx.evx = Math.cos(a) * (3 + 6 * rnd()); fx.evz = Math.sin(a) * (3 + 6 * rnd()); fx.evy = 1 + 5 * up;
        fx.esize = 0.03 + 0.09 * rnd(); fx.emit();
      }
    }
  }

  function think(s, P, dt) {
    const role = ARCHETYPES[s.arch].role;
    if (role === 'advance') thinkBrute(s, P, dt);
    else if (role === 'ranged') thinkSeer(s, P, dt);
    else thinkHound(s, P, dt);
  }

  /** Brute: advance straight on; close in, rear up (cracks glow), slam a crater; recover slowly. */
  function thinkBrute(s, P, dt) {
    const b = s.body, A = ARCHETYPES[s.arch];
    const dx = P.px - b.x, dz = P.pz - b.z, dist = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    s.glow += ((s.state === S.TELEGRAPH ? 1 : 0) - s.glow) * (1 - Math.exp(-dt * (s.state === S.TELEGRAPH ? 3 : 4)));
    switch (s.state) {
      case S.RISING: b.wantVx = 0; b.wantVz = 0; if (s.t >= RISE_TIME * 1.4) { s.state = S.STALK; s.t = 0; } break;
      case S.STALK: {
        const sp = dist > 3 ? A.shape.maxSpeed : 0.6;
        b.wantVx = dx / dist * sp; b.wantVz = dz / dist * sp;
        b.crouch += (0 - b.crouch) * Math.min(1, dt * 4);
        s.cool -= dt;
        if (s.cool <= 0 && dist < 3.6) {
          s.state = S.TELEGRAPH; s.t = 0;
          // The ground cracks where the blow will land: frost lines radiating from it.
          const hx = Math.sin(b.heading), hz = Math.cos(b.heading), ix = b.x + hx * 1.3, iz = b.z + hz * 1.3;
          for (let q = 0; q < 7; q++) {
            const a = q / 7 * Math.PI * 2 + rnd() * 0.5, ca = Math.cos(a), sa = Math.sin(a), r = A.slamRadius * (0.45 + 0.25 * rnd());
            ts.bx = ix + ca * r * 0.55; ts.bz = iz + sa * r * 0.55; ts.bdx = ca; ts.bdz = sa; ts.bl = r * 0.5; ts.bw = 0.05; ts.bd = 0.04; ts.bc = 0.2;
            ts.bk = BRUSH.SCORE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
            ts.stamp();
          }
        }
        break;
      }
      case S.TELEGRAPH:
        b.wantVx = dx / dist * 0.2; b.wantVz = dz / dist * 0.2;
        b.crouch += (-0.55 - b.crouch) * Math.min(1, dt * 3);       // rears up
        if (s.t >= 0.95) { s.state = S.SLAM; s.t = 0; }
        break;
      case S.SLAM:
        b.wantVx = 0; b.wantVz = 0;
        b.crouch += (1 - b.crouch) * Math.min(1, dt * 18);
        if (s.t >= 0.22) {
          // Impact in front: a crater of thrown snow, a burst of powder, and the blow.
          const hx = Math.sin(b.heading), hz = Math.cos(b.heading);
          const ix = b.x + hx * 1.3, iz = b.z + hz * 1.3;
          ts.bx = ix; ts.bz = iz; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 1.3; ts.bd = 0.3; ts.bc = 0.8;
          ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1.2;
          ts.stamp();
          ground.qx = ix; ground.qz = iz; ground.sample();
          for (let q = 0; q < 34; q++) {
            const a = rnd() * Math.PI * 2, r = rnd() * 1.2;
            fx.ex = ix + Math.cos(a) * r; fx.ez = iz + Math.sin(a) * r; fx.ey = ground.h + 0.1;
            fx.evx = Math.cos(a) * (2 + 3 * rnd()); fx.evz = Math.sin(a) * (2 + 3 * rnd()); fx.evy = 1.5 + 3.5 * rnd();
            fx.esize = 0.08 + 0.14 * rnd(); fx.emit();
          }
          // The shock runs out along the ground: a ring of powder; a jump clears it.
          for (let q = 0; q < 30; q++) {
            const a = q / 30 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            fx.ex = ix + ca * 0.8; fx.ez = iz + sa * 0.8; fx.ey = ground.h + 0.05;
            fx.evx = ca * A.slamRadius * 2.6; fx.evz = sa * A.slamRadius * 2.6; fx.evy = 0.4 + 0.6 * rnd(); fx.esize = 0.1 + 0.08 * rnd(); fx.emit();
          }
          const pd = Math.hypot(P.px - ix, P.pz - iz);
          if (pd < A.slamRadius && P.pgrounded) { P.hits++; P.hitDamage += A.slamDamage; }
          P.slams++; P.slamDist = Math.min(P.slamDist, pd);
          s.state = S.RECOVER; s.t = 0;
        }
        break;
      case S.RECOVER:
        b.wantVx = 0; b.wantVz = 0;
        b.crouch += (0 - b.crouch) * Math.min(1, dt * 2);
        if (s.t >= 1.2) { s.state = S.STALK; s.t = 0; s.cool = 1.5 + 1.5 * rnd(); }
        break;
      case S.STAGGER:
        b.wantVx = 0; b.wantVz = 0; b.lift = 0;
        if (s.t >= 0.8) { s.state = S.STALK; s.t = 0; s.cool = 1; }
        break;
      case S.FROZEN:
        b.frozen = true; b.wantVx = 0; b.wantVz = 0;
        if (s.t >= s.frozenFor) { s.state = S.STALK; s.t = 0; b.frozen = false; s.cool = 1.5; }
        break;
    }
  }

  /** Seer: hold a distance, drifting sideways; gather light in the core, throw a fan of shards. */
  function thinkSeer(s, P, dt) {
    const b = s.body, A = ARCHETYPES[s.arch];
    const dx = P.px - b.x, dz = P.pz - b.z, dist = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    const ux = dx / dist, uz = dz / dist;
    s.glow += ((s.state === S.TELEGRAPH ? 1 : 0) - s.glow) * (1 - Math.exp(-dt * (s.state === S.TELEGRAPH ? 2.5 : 5)));
    switch (s.state) {
      case S.RISING: b.wantVx = 0; b.wantVz = 0; if (s.t >= RISE_TIME * 1.2) { s.state = S.STALK; s.t = 0; } break;
      case S.STALK: {
        // Back off or close in to its distance, and drift round the Wraith.
        s.orbit += dt * 0.3;
        const radial = (dist - A.keep) * 0.8, side = Math.sin(s.orbit * 2) * 1.6;
        b.wantVx = ux * radial - uz * side; b.wantVz = uz * radial + ux * side;
        const wl = Math.hypot(b.wantVx, b.wantVz), mx = A.shape.maxSpeed;
        if (wl > mx) { b.wantVx *= mx / wl; b.wantVz *= mx / wl; }
        s.cool -= dt;
        if (s.cool <= 0 && dist > 5 && dist < 20) { s.state = S.TELEGRAPH; s.t = 0; }
        break;
      }
      case S.TELEGRAPH:
        b.wantVx = ux * 0.15; b.wantVz = uz * 0.15;
        if (s.t >= 0.85) { s.state = S.CAST; s.t = 0; }
        break;
      case S.CAST: {
        // A fan of three shards at where the Wraith will be.
        const lead = dist / 16;
        const tx = P.px + P.pvx * lead, tz = P.pz + P.pvz * lead;
        ground.qx = tx; ground.qz = tz; ground.sample();
        for (let k = -1; k <= 1; k++) {
          const ox = -uz * k * 1.1, oz = ux * k * 1.1;
          throwShard(b.hx, b.hy + 0.15, b.hz, tx + ox, ground.h + 0.9, tz + oz, 16, A.shardDamage);
        }
        s.state = S.RECOVER; s.t = 0;
        break;
      }
      case S.RECOVER:
        b.wantVx = 0; b.wantVz = 0;
        if (s.t >= 0.6) { s.state = S.STALK; s.t = 0; s.cool = 2.4 + 1.8 * rnd(); }
        break;
      case S.STAGGER:
        b.wantVx = -ux * 2; b.wantVz = -uz * 2; b.lift = 0;
        if (s.t >= 0.5) { s.state = S.STALK; s.t = 0; s.cool = 1 + rnd(); }
        break;
      case S.FROZEN:
        b.frozen = true; b.wantVx = 0; b.wantVz = 0;
        if (s.t >= s.frozenFor) { s.state = S.STALK; s.t = 0; b.frozen = false; s.cool = 1; }
        break;
    }
  }

  /** Hound: stalk in a ring around the Wraith, telegraph (crouch, glow), lunge, recover. */
  function thinkHound(s, P, dt) {
    const b = s.body;
    const dx = P.px - b.x, dz = P.pz - b.z, dist = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    const ux = dx / dist, uz = dz / dist;
    s.glow += ((s.state === S.TELEGRAPH ? 1 : 0) - s.glow) * (1 - Math.exp(-dt * (s.state === S.TELEGRAPH ? 6 : 3)));
    switch (s.state) {
      case S.RISING:
        b.wantVx = 0; b.wantVz = 0;
        if (s.t >= RISE_TIME) { s.state = S.STALK; s.t = 0; }
        break;
      case S.STALK: {
        // A point on a ring around the Wraith, drifting round (packs spread and circle).
        s.orbit += dt * 0.5;
        const R = 4.5;
        const gx = P.px - Math.sin(s.orbit) * R, gz = P.pz - Math.cos(s.orbit) * R;
        let wx = gx - b.x, wz = gz - b.z;
        const wl = Math.sqrt(wx * wx + wz * wz) || 1;
        const sp = Math.min(5.5, wl * 1.5);
        b.wantVx = wx / wl * sp; b.wantVz = wz / wl * sp;
        b.crouch += (0 - b.crouch) * Math.min(1, dt * 6);
        s.cool -= dt;
        if (s.cool <= 0 && dist < 7 && dist > 2.5 && (P.lungeToken < 0 || P.lungeToken === s.idx)) { s.state = S.TELEGRAPH; s.t = 0; P.lungeToken = s.idx; }
        break;
      }
      case S.TELEGRAPH:
        b.wantVx = ux * 0.3; b.wantVz = uz * 0.3;            // turn to face, nearly still
        b.crouch += (1 - b.crouch) * Math.min(1, dt * 8);
        if (s.t >= 0.55) {
          s.state = S.LUNGE; s.t = 0; s.hitDone = false;
          // Leap at where the Wraith will be.
          const tx = P.px + P.pvx * 0.35 - b.x, tz = P.pz + P.pvz * 0.35 - b.z;
          const tl = Math.sqrt(tx * tx + tz * tz) || 1;
          s.lungeX = tx / tl; s.lungeZ = tz / tl;
        }
        break;
      case S.LUNGE: {
        const T = 0.5, u = Math.min(1, s.t / T);
        b.crouch = 0;
        b.lift = Math.sin(Math.PI * u) * 0.6;
        b.vx = s.lungeX * 10; b.vz = s.lungeZ * 10; b.wantVx = b.vx; b.wantVz = b.vz;
        if (!s.hitDone && dist < 1.1) { s.hitDone = true; P.hits++; P.hitDamage += 12; }
        if (u >= 1) { s.state = S.RECOVER; s.t = 0; b.lift = 0; }
        break;
      }
      case S.RECOVER:
        b.wantVx = 0; b.wantVz = 0;
        if (s.t >= 0.75) { s.state = S.STALK; s.t = 0; s.cool = 1.8 + 1.7 * rnd(); }
        break;
      case S.STAGGER:
        b.wantVx = 0; b.wantVz = 0; b.lift = 0;
        if (s.t >= 0.6) { s.state = S.STALK; s.t = 0; s.cool = 1 + rnd(); }
        break;
      case S.FROZEN:
        b.frozen = true; b.wantVx = 0; b.wantVz = 0;
        if (s.t >= s.frozenFor) { s.state = S.STALK; s.t = 0; b.frozen = false; s.cool = 0.8; }
        break;
    }
  }

  return self;
}
