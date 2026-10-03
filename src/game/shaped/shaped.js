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
export const S = { EMPTY: 0, RISING: 1, STALK: 2, TELEGRAPH: 3, LUNGE: 4, RECOVER: 5, STAGGER: 6, FROZEN: 7, FALLING: 8 };

const RISE_TIME = 1.5, FALL_TIME = 1.1, SINK_TIME = 2.6;

/**
 * @param {{ ts: any, fx: any, ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createShaped(ctx) {
  const { ts, fx, ground } = ctx;
  const rigs = {};
  for (const k in ARCHETYPES) rigs[k] = buildRig(ARCHETYPES[k].shape, Math.min(CHUNKS_PER, ARCHETYPES[k].chunks), 1234 + k.length * 77);
  const slots = [];
  for (let i = 0; i < MAX_SHAPED; i++) slots.push({ arch: null, body: null, rig: null, st: null, state: S.EMPTY, t: 0, hp: 0, glow: 0,
    cool: 0, lungeX: 0, lungeZ: 0, hitDone: false, orbit: 0, fallSink: 0, wet: 0, frozenFor: 0, sweepHit: 0 });
  /** Chunk records for the renderer (MAX_SHAPED × CHUNKS_PER). */
  const chunks = new Float32Array(MAX_SHAPED * CHUNKS_PER * CHUNK_FLOATS);
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
      s.wet = 0; s.frozenFor = 0; s.sweepHit = 0;
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
      if (s.hp <= 0) { die(s); return true; }
      if (stagger && s.state !== S.FROZEN) { s.state = S.STAGGER; s.t = 0; s.body.vx = kx; s.body.vz = kz; s.body.crouch = 0; s.body.lift = 0; }
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
      this.hits = 0; this.hitDamage = 0;
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
        writeAlive(b, s.st, chunks, rec, rise, s.glow + (s.state === S.FROZEN ? 2 : 0));
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
    /** Count of living (or rising) Shaped. */
    get alive() { let n = 0; for (let i = 0; i < MAX_SHAPED; i++) if (slots[i].state !== S.EMPTY && slots[i].state !== S.FALLING) n++; return n; },
  };

  function die(s) {
    s.state = S.FALLING; s.t = 0; s.glow = 0;
    startFall(s.body, s.st, rnd);
  }

  /** Hound: stalk in a ring around the Wraith, telegraph (crouch, glow), lunge, recover. */
  function think(s, P, dt) {
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
        if (s.cool <= 0 && dist < 7 && dist > 2.5) { s.state = S.TELEGRAPH; s.t = 0; }
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
