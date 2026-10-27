// Stone bending (BRIEF §9.2, docs/phase-9/plan.md D4): Shard (tap), Ridge (hold), Bloom (heavy).
// Stone is displaced mass, so every verb writes the terrain state through the shared brush path
// (PRESS, PLOUGH, MOUND and the two Stone programs RIDGE and CRATER) and ALSO records what it wrote in
// the CPU mass field (stoneMass.js), which the ground query adds to the collision height: a Ridge is
// solid and walkable the frame it is stamped, no readback wait. What flies is real chunk geometry
// built from the surface material (the Shaped's chunk path: render/shapedView.js), not a sprite.
//
// Surfaces: snow, grass, rock and water exist; sand, mud and ash are stubbed with explicit rows (the
// brushes work on them; sand's slump is D2's, so `slump` is a zero stub).
//
// Allocation-free per frame: fixed pools, plain fields, typed arrays.

import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { DECAY } from '../../terrain/state/healing.js';
import { SPELL_LIGHTS } from './frost.js';
import { createStoneMass, RIM_RATIO, TRENCH_RATIO } from './stoneMass.js';

/** Surface classes Stone distinguishes (the reaction table's rows; rock reads as `snow` there). */
export const SURF = { SNOW: 0, GRASS: 1, ROCK: 2, WATER: 3, SAND: 4, MUD: 5, ASH: 6 };
/** Per surface: chunk kind (shaders/shaped.wgsl.js: 0 packed snow, 5 turf, 6 stone), how much the ground gives (depth ×),
 *  how hard it heaves (height ×), bake material id for healing, and the sand-slump stub (D2). */
export const SURFACE_INFO = [
  { key: 'snow', kind: 0, give: 1, heave: 1, mat: 0, slump: 0 },
  { key: 'grass', kind: 5, give: 1, heave: 1, mat: 3, slump: 0 },
  { key: 'rock', kind: 6, give: 0.45, heave: 0.55, mat: 5, slump: 0 },
  { key: 'water', kind: 0, give: 0, heave: 0, mat: 7, slump: 0 },
  { key: 'sand', kind: 0, give: 1.2, heave: 1, mat: 1, slump: 0 },   // STUB (D2): a sand ridge will slump; for now it holds
  { key: 'mud', kind: 5, give: 1, heave: 1.1, mat: 2, slump: 0 },    // STUB (Phase 10)
  { key: 'ash', kind: 6, give: 0.8, heave: 0.8, mat: 4, slump: 0 },  // STUB (Phase 11)
];

/** Arguments to the writer helpers, passed through here: a call with double arguments boxes them (the alloc check). */
const A = new Float64Array(24);
const h2 = (a, b) => Math.sqrt(a * a + b * b);
const h3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);
export const shardTuning = {
  scarAhead: 2.3,     // m from the caster: where the plate is torn out
  scarHalf: 0.62,     // m: the scar's half width
  scarDepth: 0.2,     // m
  rise: 0.22,         // s the plate lifts out of the ground
  lift: 1.15,         // m above the ground at the top of the rise
  speed: 27, range: 30, gravity: 3.5,
  size: 0.95,         // m: the plate's width
  hitRadius: 1.05,    // m: against a body
  damage: 18, knock: 1, stagger: true,
  laneSpeed: 20, laneRange: 24, laneHeight: 0.45, laneDepth: 0.12, // Flow 3: skims low, ploughing a lane
  lightRadius: 4, lightIntensity: 1.5,
};
export const ridgeTuning = {
  start: 2.4,         // m ahead of the caster where the wall begins
  speed: 9,           // m/s the head is dragged along the aim path
  turn: 2.4,          // rad/s the head can bend toward the aim
  step: 0.6,          // m per segment
  maxLen: 14,         // m
  halfWidth: 2.95,    // m: brush footprint half-width (the crest is 0.68 of it, see stoneMass.js)
  height: 1.1,        // m crest
  swell: 0.22,        // s after the pass that a segment finishes heaving up
  firstSwell: 0.5,    // the share of the height it has the moment the head passes
  burst: 0.3,         // s between torn pieces thrown off the head
  settle: 1.2,        // s the fx lingers after release
  lightRadius: 4.5, lightIntensity: 1.1,
};
export const bloomTuning = {
  minRange: 3, maxRange: 14,
  radius: 3.1,        // m: footprint radius (the pit is 0.42 of it, the rim peaks at 0.57)
  depth: 0.8,         // m: bowl depth
  curtain: 3.4,       // s the ejecta take to fall back
  mounds: 9,          // fall-back stamps (the curtain landing as state)
  launch: 1.9,        // m the foes are thrown (a visual pop), trap: s they are pinned in the crater
  trap: 1.8, damage: 22, shove: 7, reach: 1.25,   // reach: × radius, the bodies caught
  pieces: 12,         // real chunks thrown up
  lightRadius: 7, lightIntensity: 2.2,
};

const SHARDS = 3, PLATE = 3, DEBRIS = 28, RIDGES = 3, MAXSEG = 34, BLOOMS = 2, PTS = 6;
/** Chunk records for the renderer: shard plates, then debris (16 floats each). */
export const STONE_CHUNKS = SHARDS * PLATE + DEBRIS;
/** Floats in `fx` (the renderer's uniform block, shaders/stoneFx.wgsl.js): vec4 count. */
export const STONE_FX_VEC4 = 37;

/**
 * @param {{ ts: any, ground: any, lights: Float32Array, surfaceAt: (x: number, z: number) => number, frost?: any, mass?: any }} ctx
 *   ts: terrain state, ground: query (with `mass` set by the owner), surfaceAt: Stone's surface class at a point
 */
export function createStoneBending(ctx) {
  const { ts, ground, lights, surfaceAt } = ctx;
  const frost = ctx.frost || null;
  const mass = ctx.mass || createStoneMass();
  const chunks = new Float32Array(STONE_CHUNKS * 16);
  const fx = new Float32Array(STONE_FX_VEC4 * 4);
  fx[34 * 4 + 3] = 99; fx[35 * 4 + 3] = 99;   // no puff, no splash yet
  let serial = 0;
  const seedA = new Uint32Array(1); seedA[0] = 7;   // a typed slot: a context `let` holding a double boxes every write
  function rn() { seedA[0] = Math.imul(seedA[0], 1664525) + 1013904223; A[21] = seedA[0] / 4294967296; }
  function gs() { ground.qx = A[22]; ground.qz = A[23]; ground.sample(); A[22] = ground.h; }
  const rateOf = (surf) => DECAY[SURFACE_INFO[surf].mat * 6 + 1];

  // Shards: per slot flight state.
  const sh = { on: new Uint8Array(SHARDS), phase: new Uint8Array(SHARDS), t: new Float64Array(SHARDS), x: new Float64Array(SHARDS), y: new Float64Array(SHARDS), z: new Float64Array(SHARDS),
    vx: new Float64Array(SHARDS), vy: new Float64Array(SHARDS), vz: new Float64Array(SHARDS), gy: new Float64Array(SHARDS), surf: new Uint8Array(SHARDS), wet: new Uint8Array(SHARDS),
    lane: new Uint8Array(SHARDS), kill: new Uint8Array(SHARDS), run: new Float64Array(SHARDS), spin: new Float64Array(SHARDS), tx: new Float64Array(SHARDS), tz: new Float64Array(SHARDS), tyy: new Float64Array(SHARDS), dmgMul: new Float64Array(SHARDS) };
  // Debris: thrown pieces that land as displaced mass.
  const db = { on: new Uint8Array(DEBRIS), x: new Float64Array(DEBRIS), y: new Float64Array(DEBRIS), z: new Float64Array(DEBRIS), vx: new Float64Array(DEBRIS), vy: new Float64Array(DEBRIS), vz: new Float64Array(DEBRIS),
    size: new Float64Array(DEBRIS), kind: new Uint8Array(DEBRIS), spin: new Float64Array(DEBRIS), t: new Float64Array(DEBRIS), fade: new Float64Array(DEBRIS), surf: new Uint8Array(DEBRIS), next: 0 };
  // Ridges: head state and the segments (CPU mass indices, stamp times, the swell still owed).
  const rd = { on: new Uint8Array(RIDGES), held: new Uint8Array(RIDGES), t: new Float64Array(RIDGES), hx: new Float64Array(RIDGES), hz: new Float64Array(RIDGES), dx: new Float64Array(RIDGES), dz: new Float64Array(RIDGES),
    len: new Float64Array(RIDGES), acc: new Float64Array(RIDGES), n: new Int32Array(RIDGES), str: new Float64Array(RIDGES), surf: new Uint8Array(RIDGES), sc: new Float64Array(RIDGES), burst: new Float64Array(RIDGES),
    px: new Float64Array(RIDGES), pz: new Float64Array(RIDGES),
    mi: new Int32Array(RIDGES * MAXSEG), st: new Float64Array(RIDGES * MAXSEG), sx: new Float64Array(RIDGES * MAXSEG), sz: new Float64Array(RIDGES * MAXSEG),
    sdx: new Float64Array(RIDGES * MAXSEG), sdz: new Float64Array(RIDGES * MAXSEG), sh: new Float64Array(RIDGES * MAXSEG), swelled: new Uint8Array(RIDGES * MAXSEG), age: new Float64Array(RIDGES), cur: -1, next: 0 };
  const bl = { on: new Uint8Array(BLOOMS), t: new Float64Array(BLOOMS), x: new Float64Array(BLOOMS), z: new Float64Array(BLOOMS), y: new Float64Array(BLOOMS), r: new Float64Array(BLOOMS),
    surf: new Uint8Array(BLOOMS), mound: new Int32Array(BLOOMS), next: 0, id: new Uint32Array(BLOOMS) };
  const clampAim = (s, min, max) => {
    const ax = s.tx - s.x, az = s.tz - s.z, d = Math.sqrt(ax * ax + az * az) || 1;
    const k = d > max ? max / d : d < min ? min / d : 1;
    A[18] = s.x + ax * k; A[19] = s.z + az * k;
  };

  const self = {
    lights, fx, chunks, mass,
    /** Inputs (fields): caster position, aim direction (unit, horizontal), aim target on the ground, dt, time;
     *  requests set for one frame by the owner; ridgeHeld held. */
    x: 0.5, y: 0.5, z: 0.5, aimX: 0.5, aimZ: 0.5, tx: 0.5, ty: 0.5, tz: 0.5, dt: 0.5, time: 0.5,
    castShard: false, castBloom: false, ridgeHeld: false,
    /** Flow (game/flow.js): power scales the verbs (1 = none); `flowing` (Flow 3) makes the Shard skim and plough a lane. */
    power: 1.5 - 0.5, flowing: false,
    /** Gesture for the body: 1 right after a cast, decaying; held by the Ridge. */
    gesture: 0.5 - 0.5,
    /** Ridge length dragged this frame (m): combat charges focus for it. */
    ridgeAdvance: 0.5 - 0.5,
    /** Frame events for the owner's sounds and Flow: a plate shattered / a bloom went off / a splash on water. */
    shatterEvent: false, shatterX: 0.5, shatterY: 0.5, shatterZ: 0.5, shatterSurf: 0, bloomEvent: false, splashEvent: false, splashX: 0.5, splashZ: 0.5,
    /** Shards for combat: per slot on, position, direction, id (new per cast), wet (carried through a Ribbon); hit(k) shatters one. */
    shardOn: sh.on, shardPhase: sh.phase, shardX: sh.x, shardY: sh.y, shardZ: sh.z, shardDX: sh.tx, shardDZ: sh.tz, shardId: new Uint32Array(SHARDS), shardWet: sh.wet, shardDmg: sh.dmgMul,
    shardHit(k) { sh.kill[k] = 1; },
    /** Blooms for combat: the one that went off this frame (bloomEvent): centre, footprint radius, id. */
    bloomX: 0.5, bloomZ: 0.5, bloomR: 0.5, bloomId: 0, bloomHot: 0, bloomCX: bl.x, bloomCZ: bl.z, bloomCR: bl.r, bloomAge: bl.t, bloomOn: bl.on,
    /** Casts a cast-side check: the surface a verb would act on at (x, z). */
    surfaceAt,

    update() {
      const dt = this.dt, time = this.time;
      mass.healScale = ts.healScale || 1;
      mass.update(time);
      this.gesture = Math.max(0, this.gesture - dt / 0.45);
      this.shatterEvent = false; this.bloomEvent = false; this.splashEvent = false; this.ridgeAdvance = 0; this.bloomHot = 0;
      if (this.castShard) { this.castShard = false; startShard(this); this.gesture = 1; }
      if (this.castBloom) { this.castBloom = false; startBloom(this); this.gesture = 1; }
      stepRidgeInput(this);
      let li = 0;
      for (let k = 0; k < SHARDS; k++) li = stepShard(this, k, li);
      for (let k = 0; k < RIDGES; k++) li = stepRidge(this, k, li);
      for (let k = 0; k < BLOOMS; k++) li = stepBloom(this, k, li);
      stepDebris();
      if (frost !== null && frost.crystalEvent) frostenRidges(frost.crystalX, frost.crystalZ);
      restamp(this);
      if (rd.cur >= 0 && rd.held[rd.cur]) this.gesture = Math.max(this.gesture, 0.8);
      writeFx(this);
    },

    /** Is the segment a→b (fields ax…bz) blocked by standing mass at the height the line passes it? The shot's cover. Out: `t`. */
    ax: 0.5, ay: 0.5, az: 0.5, bx: 0.5, by: 0.5, bz: 0.5, t: 2.5 - 0.5,
    segBlocked() {
      this.t = 2;
      if (mass.count === 0) return false;
      const dx = this.bx - this.ax, dy = this.by - this.ay, dz = this.bz - this.az, len = Math.sqrt(dx * dx + dz * dz);
      const n = Math.min(48, Math.max(2, Math.ceil(len / 0.5)));
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = this.ax + dx * u, z = this.az + dz * u;
        const off = mass.heightAt(x, z);
        if (off < 0.35) continue;
        if (this.ay + dy * u < (A[22] = x, A[23] = z, gs(), A[22]) + 0.15) { this.t = (i - 1) / n; return true; }   // ground1 already includes the mass
      }
      return false;
    },
    /** Push body position (x, z) out of standing mass (swarmers are blocked by a Ridge) → pushX/pushZ (zero when clear). */
    pushX: 0.5 - 0.5, pushZ: 0.5 - 0.5,
    pushOut(x, z, minOff) {
      this.pushX = 0; this.pushZ = 0;
      if (mass.count === 0) return false;
      const h0 = mass.heightAt(x, z);
      if (h0 < minOff) return false;
      const e = 0.3, gx = mass.heightAt(x + e, z) - mass.heightAt(x - e, z), gz = mass.heightAt(x, z + e) - mass.heightAt(x, z - e);
      const gl = Math.sqrt(gx * gx + gz * gz);
      if (gl < 1e-4) return false;
      const step = Math.min(0.6, (h0 - minOff) / (gl / (2 * e)) + 0.1);
      this.pushX = -gx / gl * step; this.pushZ = -gz / gl * step;
      return true;
    },
    /** Which ridge/crater groups are within r of (x, z): the Frost combination reads mass.k directly. */
    ridgeCount() { let n = 0; for (let i = 0; i < RIDGES; i++) n += rd.on[i]; return n; },
    /** Tests/bot: clear everything in flight (not the terrain). */
    reset() { sh.on.fill(0); db.on.fill(0); rd.on.fill(0); rd.held.fill(0); bl.on.fill(0); rd.cur = -1; chunks.fill(0); },
  };

  // ---- Shard ---------------------------------------------------------------------------------
  function startShard(s) {
    const T = shardTuning;
    let k = 0;
    for (let i = 0; i < SHARDS; i++) if (!sh.on[i]) { k = i; break; } else if (sh.t[i] > sh.t[k]) k = i;
    const px = s.x + s.aimX * T.scarAhead, pz = s.z + s.aimZ * T.scarAhead, gy = (A[22] = px, A[23] = pz, gs(), A[22]);
    const surf = surfaceAt(px, pz), info = SURFACE_INFO[surf];
    if (surf === SURF.WATER) {   // stone on water: it only splashes
      s.splashEvent = true; s.splashX = px; s.splashZ = pz; sh.on[k] = 0;
      return;
    }
    // The scar the plate leaves: a depression with a lip.
    ts.bx = px; ts.bz = pz; ts.bdx = s.aimX; ts.bdz = s.aimZ; ts.bl = 0.5; ts.bw = T.scarHalf; ts.bd = T.scarDepth * info.give; ts.bc = 0.5;
    ts.bk = BRUSH.PRESS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.9;
    ts.stamp();
    sh.on[k] = 1; sh.phase[k] = 0; sh.t[k] = 0; sh.x[k] = px; sh.y[k] = gy; sh.z[k] = pz; sh.gy[k] = gy; sh.surf[k] = surf;
    sh.lane[k] = s.flowing ? 1 : 0; sh.kill[k] = 0; sh.run[k] = 0; sh.wet[k] = 0; sh.spin[k] = (rn(), A[21]) * 6.28;
    const dist = Math.max(4, Math.min(T.range, h2(s.tx - px, s.tz - pz)));
    sh.tx[k] = s.aimX; sh.tz[k] = s.aimZ; sh.tyy[k] = s.ty + 0.9 - gy; sh.vx[k] = dist;   // until the throw: the aim distance
    sh.dmgMul[k] = s.power;
    self.shardId[k] = ++serial;
    sh.vz[k] = 0; sh.vy[k] = 0;
  }

  /** Ribbon nodes near a plate carry it (Shard into a Ribbon): faster, and wet. */
  function ribbonCarry(k) {
    if (frost === null || frost.ribbonStrength < 0.2) return;
    const n = frost.ribbonNodes;
    for (let i = 0; i < n.length; i += 4) {
      if (n[i + 3] <= 0.05) continue;
      const dx = n[i] - sh.x[k], dy = n[i + 1] - sh.y[k], dz = n[i + 2] - sh.z[k];
      if (dx * dx + dy * dy + dz * dz < 0.8 && !sh.wet[k]) { sh.wet[k] = 1; sh.vx[k] *= 1.35; sh.vz[k] *= 1.35; sh.dmgMul[k] *= 1.2; return; }
    }
  }

  function stepShard(s, k, li) {
    const dt = s.dt;
    if (!sh.on[k]) { chunkHide(k * PLATE, PLATE); return li; }
    const T = shardTuning;
    sh.t[k] += dt;
    const lane = sh.lane[k] === 1;
    let nx = 0, ny = 1, nz = 0, fx0 = sh.tx[k], fy0 = 0, fz0 = sh.tz[k];
    if (sh.phase[k] === 0) {
      const u = Math.min(1, sh.t[k] / T.rise), e = u * u * (3 - 2 * u);
      sh.y[k] = sh.gy[k] + (lane ? T.laneHeight : T.lift) * e - 0.25 * (1 - e);
      const tilt = e * 0.5;          // leaning toward the throw
      nx = -fx0 * Math.sin(tilt); nz = -fz0 * Math.sin(tilt); ny = Math.cos(tilt);
      if (u >= 1) {
        sh.phase[k] = 1;
        const dist = sh.vx[k], speed = lane ? T.laneSpeed : T.speed, tt = dist / speed;
        sh.vx[k] = fx0 * speed; sh.vz[k] = fz0 * speed;
        sh.vy[k] = lane ? 0 : Math.max(-6, Math.min(8, sh.tyy[k] / tt + 0.5 * T.gravity * tt - T.lift / tt));
        sh.run[k] = 0;
      }
    } else {
      if (!lane) sh.vy[k] -= T.gravity * dt;
      ribbonCarry(k);
      const ox = sh.x[k], oz = sh.z[k];
      sh.x[k] += sh.vx[k] * dt; sh.y[k] += sh.vy[k] * dt; sh.z[k] += sh.vz[k] * dt;
      sh.run[k] += h2(sh.x[k] - ox, sh.z[k] - oz);
      const g = (A[22] = sh.x[k], A[23] = sh.z[k], gs(), A[22]);
      if (lane) {
        sh.y[k] = g + T.laneHeight;
        // The lane: a plough through the surface behind the plate (Flow 3: surf behind it).
        const sl = h2(sh.x[k] - ox, sh.z[k] - oz);
        ts.bx = (sh.x[k] + ox) * 0.5; ts.bz = (sh.z[k] + oz) * 0.5; ts.bdx = sh.tx[k]; ts.bdz = sh.tz[k]; ts.bl = sl * 0.5 + 0.05;
        ts.bw = 0.7; ts.bd = T.laneDepth; ts.bc = 0.6; ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.9;
        ts.stamp();
      }
      const cliff = lane && g - (A[22] = sh.x[k] + sh.tx[k] * 1.5, A[23] = sh.z[k] + sh.tz[k] * 1.5, gs(), A[22]) > 1.2;
      if (sh.kill[k] === 1 || sh.run[k] > (lane ? T.laneRange : T.range) || (!lane && sh.y[k] <= g + 0.12) || cliff) {
        (A[0] = k, A[1] = sh.x[k], A[2] = Math.max(sh.y[k], g), A[3] = sh.z[k], shatter(s)); sh.on[k] = 0; chunkHide(k * PLATE, PLATE); return li;
      }
      const v = h3(sh.vx[k], sh.vy[k], sh.vz[k]) || 1;
      fx0 = sh.vx[k] / v; fy0 = sh.vy[k] / v; fz0 = sh.vz[k] / v;
      // The plate's normal wobbles round the flight line, a tumbling slab.
      const spin = sh.spin[k] + sh.t[k] * 7;
      nx = -fz0 * Math.sin(spin) * 0.35; nz = fx0 * Math.sin(spin) * 0.35; ny = 1; const nl = h3(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    }
    (A[0] = k, A[1] = T.size, A[2] = nx, A[3] = ny, A[4] = nz, A[5] = fx0, A[6] = fy0, A[7] = fz0, writePlate());
    if (li < SPELL_LIGHTS) li = (A[0] = li, A[1] = sh.x[k], A[2] = sh.y[k] + 0.2, A[3] = sh.z[k], A[4] = T.lightRadius, A[5] = T.lightIntensity * (sh.phase[k] === 0 ? sh.t[k] / T.rise : 1), light());
    return li;
  }

  function writePlate() {
    const k = A[0], size = A[1], nx = A[2], ny = A[3], nz = A[4], fx0 = A[5], fy0 = A[6], fz0 = A[7];
    const T = shardTuning, kind = SURFACE_INFO[sh.surf[k]].kind;
    // Forward in the plate's plane: the flight direction with its normal part removed.
    let fx = fx0, fy = fy0, fz = fz0;
    const dn = fx * nx + fy * ny + fz * nz; fx -= nx * dn; fy -= ny * dn; fz -= nz * dn;
    const fl = h3(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const o = k * PLATE * 16;
    (A[0] = o, A[1] = sh.x[k], A[2] = sh.y[k], A[3] = sh.z[k], A[4] = size, A[5] = fx, A[6] = fy, A[7] = fz, A[8] = T.size * 0.24, A[9] = nx, A[10] = ny, A[11] = nz, A[12] = size * 0.9, A[13] = k * 13.7 + 1, A[14] = kind, A[15] = 0, A[16] = 1, set());
    // Two lumps torn off with it, trailing and tumbling.
    for (let c = 1; c < PLATE; c++) {
      const a = sh.t[k] * (5 + c * 2) + c * 2.1, r = 0.55 + 0.12 * c, back = -0.25 * c;
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      (A[0] = o + c * 16, A[1] = sh.x[k] + ox * (-fz) + fx * back + nx * oz * 0.4, A[2] = sh.y[k] + fy * back + ny * oz * 0.4 + 0.05, A[3] = sh.z[k] + ox * fx + fz * back + nz * oz * 0.4, A[4] = size * 0.34, A[5] = fx, A[6] = fy, A[7] = fz, A[8] = size * 0.26, A[9] = nx, A[10] = ny, A[11] = nz, A[12] = size * 0.3, A[13] = k * 13.7 + 2 * c, A[14] = kind, A[15] = 0, A[16] = sh.phase[k] === 0 && sh.t[k] < 0.05 ? 0 : 1, set());
    }
  }
  function set() {
    const o = A[0], px = A[1], py = A[2], pz = A[3], sx = A[4], fx = A[5], fy = A[6], fz = A[7], sy = A[8], ux = A[9], uy = A[10], uz = A[11], sz = A[12], sd = A[13], kind = A[14], glow = A[15], alpha = A[16];
    // Record: (pos, right extent), (forward, up extent), (up, forward extent), (seed, kind, glow, alpha).
    chunks[o] = px; chunks[o + 1] = py; chunks[o + 2] = pz; chunks[o + 3] = sx;
    chunks[o + 4] = fx; chunks[o + 5] = fy; chunks[o + 6] = fz; chunks[o + 7] = sy;
    chunks[o + 8] = ux; chunks[o + 9] = uy; chunks[o + 10] = uz; chunks[o + 11] = sz;
    chunks[o + 12] = sd; chunks[o + 13] = kind; chunks[o + 14] = glow; chunks[o + 15] = alpha;
  }
  function chunkHide(first, n) { for (let i = 0; i < n; i++) chunks[(first + i) * 16 + 15] = 0; }

  /** A plate breaks: pieces thrown out that land as displaced mass, a mound where it hit, a puff. */
  function shatter(s) {
    const k = A[0], x = A[1], y = A[2], z = A[3];
    const surf = sh.surf[k], info = SURFACE_INFO[surf];
    const hitSurf = surfaceAt(x, z);
    s.shatterEvent = true; s.shatterX = x; s.shatterY = y; s.shatterZ = z; s.shatterSurf = hitSurf;
    if (hitSurf === SURF.WATER) { s.splashEvent = true; s.splashX = x; s.splashZ = z; return; }
    const dvx = sh.vx[k], dvz = sh.vz[k];
    const vl = h2(dvx, dvz) || 1;
    for (let q = 0; q < 9; q++) {
      const a = (rn(), A[21]) * 6.283, sp = 2 + (rn(), A[21]) * 5;
      (A[0] = x, A[1] = y + 0.1, A[2] = z, A[3] = Math.cos(a) * sp + dvx / vl * 3, A[4] = 2.5 + (rn(), A[21]) * 4, A[5] = Math.sin(a) * sp + dvz / vl * 3, A[6] = 0.12 + 0.2 * (rn(), A[21]), A[7] = info.kind, A[8] = surf, spawnDebris());
    }
    ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 0.55; ts.bd = 0.14 * info.heave; ts.bc = 0.3;
    ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
    ts.stamp();
  }

  function spawnDebris() {
    const x = A[0], y = A[1], z = A[2], vx = A[3], vy = A[4], vz = A[5], size = A[6], kind = A[7], surf = A[8];
    const i = db.next; db.next = (db.next + 1) % DEBRIS;
    db.on[i] = 1; db.x[i] = x; db.y[i] = y; db.z[i] = z; db.vx[i] = vx; db.vy[i] = vy; db.vz[i] = vz; db.size[i] = size; db.kind[i] = kind; db.surf[i] = surf;
    db.spin[i] = (rn(), A[21]) * 6.28; db.t[i] = 0; db.fade[i] = 1;
  }
  function stepDebris() {
    const dt = self.dt;
    const base = SHARDS * PLATE;
    for (let i = 0; i < DEBRIS; i++) {
      const o = (base + i) * 16;
      if (!db.on[i]) { chunks[o + 15] = 0; continue; }
      db.t[i] += dt;
      if (db.fade[i] < 1) {   // landed: sunk into the mound over a moment
        db.fade[i] -= dt / 0.5;
        if (db.fade[i] <= 0) { db.on[i] = 0; chunks[o + 15] = 0; continue; }
      } else {
        db.vy[i] -= 16 * dt;
        db.x[i] += db.vx[i] * dt; db.y[i] += db.vy[i] * dt; db.z[i] += db.vz[i] * dt;
        const g = (A[22] = db.x[i], A[23] = db.z[i], gs(), A[22]);
        if (db.y[i] <= g + db.size[i] * 0.3 && db.vy[i] < 0) {
          db.y[i] = g + db.size[i] * 0.3; db.fade[i] = 0.999;
          const info = SURFACE_INFO[db.surf[i]];
          if (info.heave > 0) {   // it lands as displaced mass
            ts.bx = db.x[i]; ts.bz = db.z[i]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = db.size[i] * 1.5; ts.bd = db.size[i] * 0.55 * info.heave; ts.bc = 0;
            ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
            ts.stamp();
          }
        }
      }
      const a = db.spin[i] + db.t[i] * 6, ca = Math.cos(a), sa = Math.sin(a), sz = db.size[i] * (db.fade[i] < 1 ? Math.max(0.2, db.fade[i]) : 1);
      (A[0] = o, A[1] = db.x[i], A[2] = db.y[i], A[3] = db.z[i], A[4] = sz, A[5] = ca, A[6] = 0.3, A[7] = sa, A[8] = sz * 0.6, A[9] = -sa * 0.4, A[10] = 1, A[11] = ca * 0.4, A[12] = sz * 0.9, A[13] = i * 7.3, A[14] = db.kind[i], A[15] = 0, A[16] = 1, set());
    }
  }

  // ---- Ridge ---------------------------------------------------------------------------------
  /** The hold begins and ends the current wall. */
  function stepRidgeInput(s) {
    const held = s.ridgeHeld;
    if (held && (rd.cur < 0 || !rd.held[rd.cur])) startRidge(s);
    if (!held && rd.cur >= 0 && rd.held[rd.cur]) rd.held[rd.cur] = 0;
  }
  function startRidge(s) {
    const T = ridgeTuning;
    const k = rd.next; rd.next = (rd.next + 1) % RIDGES;
    rd.cur = k; rd.on[k] = 1; rd.held[k] = 1; rd.t[k] = 0; rd.age[k] = 0; rd.n[k] = 0; rd.len[k] = 0; rd.acc[k] = 0; rd.burst[k] = 0;
    rd.hx[k] = s.x + s.aimX * T.start; rd.hz[k] = s.z + s.aimZ * T.start; rd.px[k] = rd.hx[k]; rd.pz[k] = rd.hz[k];
    rd.dx[k] = s.aimX; rd.dz[k] = s.aimZ; rd.str[k] = 0; rd.sc[k] = s.power;
    rd.surf[k] = surfaceAt(rd.hx[k], rd.hz[k]);
  }
  function stepRidge(s, k, li) {
    const dt = s.dt;
    if (!rd.on[k]) return li;
    const T = ridgeTuning;
    rd.age[k] += dt;
    const held = rd.held[k] === 1;
    if (held) {
      rd.t[k] += dt;
      const maxLen = T.maxLen * rd.sc[k];
      // Steer toward the aim target and drag the head along it.
      let ex = s.tx - rd.hx[k], ez = s.tz - rd.hz[k];
      const el = Math.sqrt(ex * ex + ez * ez);
      if (rd.len[k] < maxLen) {
        // Bend toward the aim point; once the head is within reach of it, it carries straight on.
        const cur = Math.atan2(rd.dx[k], rd.dz[k]);
        let a = cur;
        if (el > 3) {
          let da = Math.atan2(ex, ez) - cur; da -= Math.round(da / 6.283185307) * 6.283185307;
          a = cur + Math.max(-T.turn * dt, Math.min(T.turn * dt, da));
          rd.dx[k] = Math.sin(a); rd.dz[k] = Math.cos(a);
        }
        const step = T.speed * dt;
        rd.hx[k] += rd.dx[k] * step; rd.hz[k] += rd.dz[k] * step; rd.acc[k] += step; rd.len[k] += step; s.ridgeAdvance += step;
        while (rd.acc[k] >= T.step && rd.n[k] < MAXSEG) { rd.acc[k] -= T.step; emitSegment(s, k); }
        rd.surf[k] = surfaceAt(rd.hx[k], rd.hz[k]);
      }
      rd.str[k] = Math.min(1, rd.str[k] + dt / 0.25);
      if (rd.burst[k] <= 0 && SURFACE_INFO[rd.surf[k]].heave > 0) {
        rd.burst[k] = T.burst;
        const info = SURFACE_INFO[rd.surf[k]], g = (A[22] = rd.hx[k], A[23] = rd.hz[k], gs(), A[22]);
        (A[0] = rd.hx[k], A[1] = g + 0.4, A[2] = rd.hz[k], A[3] = ((rn(), A[21]) - 0.5) * 3, A[4] = 3 + (rn(), A[21]) * 2, A[5] = ((rn(), A[21]) - 0.5) * 3, A[6] = 0.1 + 0.12 * (rn(), A[21]), A[7] = info.kind, A[8] = rd.surf[k], spawnDebris());
      }
      rd.burst[k] -= dt;
    } else rd.str[k] = Math.max(0, rd.str[k] - dt / T.settle);
    // Segments finish heaving up.
    for (let i = 0; i < rd.n[k]; i++) {
      const j = k * MAXSEG + i;
      if (rd.swelled[j] === 0 && rd.age[k] - rd.st[j] >= T.swell) {
        rd.swelled[j] = 1;
        (A[0] = rd.sx[j], A[1] = rd.sz[j], A[2] = rd.sdx[j], A[3] = rd.sdz[j], A[4] = rd.sh[j], A[5] = T.step * 0.5 * 1.1, stampRidge());
        mass.raise(rd.mi[j], rd.sh[j]);
      }
    }
    if (!held && rd.str[k] <= 0) { // wall finished; the terrain carries on without us
      let done = true;
      for (let i = 0; i < rd.n[k]; i++) if (rd.swelled[k * MAXSEG + i] === 0) done = false;
      if (done) rd.on[k] = 0;
    }
    if (li < SPELL_LIGHTS && rd.str[k] > 0.05) li = (A[0] = li, A[1] = rd.hx[k], A[2] = (A[22] = rd.hx[k], A[23] = rd.hz[k], gs(), A[22]) + 0.9, A[3] = rd.hz[k], A[4] = T.lightRadius, A[5] = T.lightIntensity * rd.str[k], light());
    return li;
  }
  function stampRidge() {
    const x = A[0], z = A[1], dx = A[2], dz = A[3], H = A[4], hl = A[5];
    const T = ridgeTuning;
    ts.bx = x; ts.bz = z; ts.bdx = dx; ts.bdz = dz; ts.bl = hl; ts.bw = T.halfWidth; ts.bd = H; ts.bc = 0.4;
    ts.bk = BRUSH.RIDGE; ts.bwet = 0; ts.bbias = 0; ts.bberm = TRENCH_RATIO;
    ts.stamp();
  }
  function emitSegment(s, k) {
    const T = ridgeTuning, info = SURFACE_INFO[rd.surf[k]];
    const mx = (rd.px[k] + rd.hx[k]) * 0.5, mz = (rd.pz[k] + rd.hz[k]) * 0.5;
    let sx = rd.hx[k] - rd.px[k], sz = rd.hz[k] - rd.pz[k]; const sl = Math.sqrt(sx * sx + sz * sz) || 1; sx /= sl; sz /= sl;
    rd.px[k] = rd.hx[k]; rd.pz[k] = rd.hz[k];
    if (info.heave <= 0) { s.splashEvent = true; s.splashX = mx; s.splashZ = mz; return; }   // water: nothing to raise
    const H = T.height * info.heave * (0.8 + 0.2 * rd.sc[k]) * (rd.sc[k] > 1 ? 1.12 : 1);
    const j = k * MAXSEG + rd.n[k]++, hl = sl * 0.5 * 1.1;
    rd.sx[j] = mx; rd.sz[j] = mz; rd.sdx[j] = sx; rd.sdz[j] = sz; rd.sh[j] = H; rd.st[j] = rd.age[k]; rd.swelled[j] = 0;
    rd.mi[j] = mass.addRidge(mx, mz, sx, sz, hl, T.halfWidth, H * T.firstSwell, rateOf(rd.surf[k]));
    (A[0] = mx, A[1] = mz, A[2] = sx, A[3] = sz, A[4] = H * T.firstSwell, A[5] = hl, stampRidge());
  }

  // The Frost combination: a Crystallize cast near a wall freezes it to an ice rampart that keeps its shape.
  const frozenAt = new Float64Array(RIDGES);
  function frostenRidges(fx0, fz0) {
    const R = 9;
    for (let k = 0; k < RIDGES; k++) {
      if (!rd.on[k] && rd.n[k] === 0) continue;
      for (let i = 0; i < rd.n[k]; i++) {
        const j = k * MAXSEG + i;
        if (h2(rd.sx[j] - fx0, rd.sz[j] - fz0) > R || mass.k.frozen[rd.mi[j]]) continue;
        mass.freeze(rd.mi[j]);
        ts.bx = rd.sx[j]; ts.bz = rd.sz[j]; ts.bdx = rd.sdx[j]; ts.bdz = rd.sdz[j]; ts.bl = ridgeTuning.step * 0.55; ts.bw = ridgeTuning.halfWidth * 0.5; ts.bd = 0; ts.bc = 0;
        ts.bk = BRUSH.FREEZE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
        frozenAt[k] = 1;
      }
    }
  }
  /** Frozen walls are re-stamped now and then so the GPU copy keeps the shape the CPU holds. */
  function restamp(s) {
    A[20] += s.dt;                        // (a closure `let` holding a double would box every write)
    if (A[20] < 20) return;
    A[20] = 0;
    for (let k = 0; k < RIDGES; k++) {
      if (!frozenAt[k]) continue;
      for (let i = 0; i < rd.n[k]; i++) { const j = k * MAXSEG + i; if (mass.k.frozen[rd.mi[j]]) (A[0] = rd.sx[j], A[1] = rd.sz[j], A[2] = rd.sdx[j], A[3] = rd.sdz[j], A[4] = rd.sh[j], A[5] = ridgeTuning.step * 0.55, stampRidge()); }
    }
  }

  // ---- Bloom ---------------------------------------------------------------------------------
  function startBloom(s) {
    const T = bloomTuning;
    clampAim(s, T.minRange, T.maxRange);
    const x = A[18], z = A[19], k = bl.next; bl.next = (bl.next + 1) % BLOOMS;
    const surf = surfaceAt(x, z), info = SURFACE_INFO[surf], gy = (A[22] = x, A[23] = z, gs(), A[22]);
    const R = T.radius * s.power;
    bl.on[k] = 1; bl.t[k] = 0; bl.x[k] = x; bl.z[k] = z; bl.y[k] = gy; bl.r[k] = R; bl.surf[k] = surf; bl.mound[k] = 0; bl.id[k] = ++serial;
    s.bloomEvent = true; s.bloomX = x; s.bloomZ = z; s.bloomR = R; s.bloomId = bl.id[k]; s.bloomHot = 1;
    if (info.heave <= 0) { s.splashEvent = true; s.splashX = x; s.splashZ = z; return; }   // water: a column of spray, nothing raised
    const depth = T.depth * info.give * (0.85 + 0.15 * s.power);
    ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = R; ts.bd = depth; ts.bc = 0.6;
    ts.bk = BRUSH.CRATER; ts.bwet = 0; ts.bbias = 0; ts.bberm = RIM_RATIO;
    ts.stamp();
    mass.addCrater(x, z, R, depth, rateOf(surf));
    for (let q = 0; q < T.pieces; q++) {
      const a = (rn(), A[21]) * 6.283, sp = 1 + (rn(), A[21]) * 3.2;
      (A[0] = x + Math.cos(a) * R * 0.3, A[1] = gy + 0.2, A[2] = z + Math.sin(a) * R * 0.3, A[3] = Math.cos(a) * sp, A[4] = 5 + (rn(), A[21]) * 4, A[5] = Math.sin(a) * sp, A[6] = 0.14 + 0.22 * (rn(), A[21]), A[7] = info.kind, A[8] = surf, spawnDebris());
    }
  }
  function stepBloom(s, k, li) {
    const dt = s.dt;
    if (!bl.on[k]) return li;
    const T = bloomTuning;
    bl.t[k] += dt;
    const t = bl.t[k];
    if (t > T.curtain + 0.3) { bl.on[k] = 0; return li; }
    const info = SURFACE_INFO[bl.surf[k]];
    // The curtain landing: mound stamps spread over the fall, each on the rim or in the bowl.
    if (info.heave > 0) {
      const due = Math.min(T.mounds, Math.floor(Math.max(0, t - 0.9) / (T.curtain - 0.9) * T.mounds));
      while (bl.mound[k] < due) {
        bl.mound[k]++;
        const a = (rn(), A[21]) * 6.283, r = bl.r[k] * (0.4 + 0.35 * (rn(), A[21]));   // the curtain lands on the rim
        ts.bx = bl.x[k] + Math.cos(a) * r; ts.bz = bl.z[k] + Math.sin(a) * r; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 0.55 + 0.35 * (rn(), A[21]); ts.bd = 0.07 * info.heave; ts.bc = 0;
        ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
      }
    }
    if (li < SPELL_LIGHTS) li = (A[0] = li, A[1] = bl.x[k], A[2] = bl.y[k] + 1.5, A[3] = bl.z[k], A[4] = T.lightRadius, A[5] = T.lightIntensity * Math.max(0, 1 - t / 1.6), light());
    return li;
  }

  function light() {
    const li = A[0], x = A[1], y = A[2], z = A[3], radius = A[4], intensity = A[5];
    // First free slot (the verbs before us have cleared and filled theirs this frame).
    let i = li;
    while (i < SPELL_LIGHTS && lights[i * 8 + 7] !== 0) i++;
    if (i >= SPELL_LIGHTS) return SPELL_LIGHTS;
    const o = i * 8;
    lights[o] = x; lights[o + 1] = y; lights[o + 2] = z; lights[o + 3] = radius;
    lights[o + 4] = 1.0; lights[o + 5] = 0.7; lights[o + 6] = 0.34; lights[o + 7] = intensity;
    return i + 1;
  }

  /** The renderer's block (STONE_FX_VEC4 vec4), see shaders/stoneFx.wgsl.js:
   *  [0..2] shard k: x, y, z, strength · [3..5] shard k: dir x, dir y, dir z, surface
   *  [6..8] ridge k: head x, ground y, head z, strength · [9..11] ridge k: surface, length, age, -
   *  [12..29] ridge k points 0..5: x, y, z, 1 (3 ridges × 6) · [30..31] bloom k: x, ground y, z, age · [32..33] bloom k: radius, strength, surface, id
   *  [34] shatter puff: x, y, z, age · [35] splash: x, y, z, age · [36] puff surface */
  function writeFx(s) {
    for (let k = 0; k < SHARDS; k++) {
      const o = k * 4, o2 = (3 + k) * 4;
      if (!sh.on[k]) { fx[o + 3] = 0; continue; }
      const v = h3(sh.vx[k], sh.vy[k], sh.vz[k]) || 1;
      fx[o] = sh.x[k]; fx[o + 1] = sh.y[k]; fx[o + 2] = sh.z[k]; fx[o + 3] = sh.phase[k] === 0 ? Math.min(1, sh.t[k] / shardTuning.rise) * 0.4 : 1;
      fx[o2] = sh.vx[k] / v; fx[o2 + 1] = sh.vy[k] / v; fx[o2 + 2] = sh.vz[k] / v; fx[o2 + 3] = sh.surf[k];
    }
    for (let k = 0; k < RIDGES; k++) {
      const o = (6 + k) * 4, o2 = (9 + k) * 4;
      if (!rd.on[k] || rd.str[k] <= 0) { fx[o + 3] = 0; continue; }
      fx[o] = rd.hx[k]; fx[o + 1] = (A[22] = rd.hx[k], A[23] = rd.hz[k], gs(), A[22]); fx[o + 2] = rd.hz[k]; fx[o + 3] = rd.str[k];
      fx[o2] = rd.surf[k]; fx[o2 + 1] = rd.len[k]; fx[o2 + 2] = rd.age[k]; fx[o2 + 3] = 0;
      // Six points along the dragged path (from the segments), for the wall's dust and glitter.
      const n = rd.n[k];
      for (let p = 0; p < PTS; p++) {
        const q = (12 + k * PTS + p) * 4;
        if (n === 0) { fx[q] = rd.hx[k]; fx[q + 1] = fx[o + 1]; fx[q + 2] = rd.hz[k]; fx[q + 3] = 1; continue; }
        const j = k * MAXSEG + Math.min(n - 1, Math.round(p / (PTS - 1) * (n - 1)));
        fx[q] = rd.sx[j]; fx[q + 1] = (A[22] = rd.sx[j], A[23] = rd.sz[j], gs(), A[22]); fx[q + 2] = rd.sz[j]; fx[q + 3] = 1;
      }
    }
    for (let k = 0; k < BLOOMS; k++) {
      const o = (30 + k) * 4, o2 = (32 + k) * 4;
      if (!bl.on[k]) { fx[o + 3] = -1; fx[o2 + 1] = 0; continue; }
      fx[o] = bl.x[k]; fx[o + 1] = bl.y[k]; fx[o + 2] = bl.z[k]; fx[o + 3] = bl.t[k];
      fx[o2] = bl.r[k]; fx[o2 + 1] = 1; fx[o2 + 2] = bl.surf[k]; fx[o2 + 3] = bl.id[k] % 97;
    }
    // The last plate's shatter (a puff) and the last splash, each aged on the GPU (age 99 = none).
    const o = 34 * 4;
    if (s.shatterEvent) { fx[o] = s.shatterX; fx[o + 1] = s.shatterY; fx[o + 2] = s.shatterZ; fx[o + 3] = 0; fx[36 * 4] = s.shatterSurf; }
    else fx[o + 3] = Math.min(99, fx[o + 3] + s.dt);
    if (s.splashEvent) { fx[o + 4] = s.splashX; fx[o + 5] = (A[22] = s.splashX, A[23] = s.splashZ, gs(), A[22]); fx[o + 6] = s.splashZ; fx[o + 7] = 0; }
    else fx[o + 7] = Math.min(99, fx[o + 7] + s.dt);
  }

  return self;
}
