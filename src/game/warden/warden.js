// The Frost Warden (BRIEF §8.4): a colossal Shaped — a glacier-beast some 35 m long and 12 m to
// the back — holding the Frost Steppe in stillness. The same procedural body and chunk rig as
// the lesser Shaped at colossal scale (its footfalls crush craters into the snow), plus four
// water joints: liquid cores that must be frozen (Crystallize, or a soaking Ribbon) and then
// shattered. Two sit at the front knees (reachable from the ground); two on its back (reachable
// only by climbing it). When the last joint breaks it is released: it settles into the land.
// Allocation-free per frame.

import { ShapedBody } from '../shaped/body.js';
import { buildRig, createRigState, writeAlive, writeHidden, CHUNK_FLOATS, CHUNK } from '../shaped/rig.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { SFX } from '../../audio/sfx.js';

// A glacier-mammoth: a massive, broad body on stumpy pillar legs, a heavy lowered head, a short
// thick tail — the mass reads as land, not as an insect.
export const WARDEN_SHAPE = {
  spine: 6, spacing: 3.6, hip: 7.2,
  legs: [
    { at: 1, side: -1, upper: 3.9, lower: 4.3, reach: 3.6, kneeBack: false, group: 0 },
    { at: 1, side: 1, upper: 3.9, lower: 4.3, reach: 3.6, kneeBack: false, group: 1 },
    { at: 5, side: -1, upper: 3.7, lower: 4.1, reach: 3.4, kneeBack: true, group: 1 },
    { at: 5, side: 1, upper: 3.7, lower: 4.1, reach: 3.4, kneeBack: true, group: 0 },
  ],
  tail: 4, tailSpacing: 2.4, headUp: 0.4,
  stride: 5.5, swing: 1.9, lift: 1.1, maxSpeed: 1.6, accel: 0.6, turnRate: 0.2,
};
export const WARDEN_RIG = { girth: 0.68, leg: 0.48, head: 0.5, shards: 3, upperN: 6, lowerN: 6, legOverlap: 3.4 };
const RIG = WARDEN_RIG;
export const WARDEN_CHUNKS = 380;
/** Water joints: front knees (0, 1) and back (2 over the shoulders, 3 over the hips). */
export const JOINTS = 4;
/** Neighbours per chunk for the renderer's smooth-mass shading (chunk indices; self = unused). */
export const WARDEN_NBR = 16;
export const JOINT = { LIQUID: 0, FROZEN: 1, SHATTERED: 2 };
export const W = { DORMANT: 0, AWAKE: 1, STOMP: 2, KNEEL: 3, RELEASE: 4, RESTED: 5, TAIL: 6, SHED: 7 };
/** The release, in seconds from the last joint breaking. */
function noop() {}
export const RELEASE_T = { rear: 1.6, slam: 2.7, impact: 3.05, rested: 15 };
const SHOCK_SPEED = 24, SHOCK_MAX = 95, SHOCK_RAYS = 64;

/**
 * @param {{ ts: any, fx: any, ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createWarden(ctx) {
  const { ts, fx, ground } = ctx;
  const body = new ShapedBody(WARDEN_SHAPE, ground);
  const rig = buildRig(WARDEN_SHAPE, WARDEN_CHUNKS, 4242, RIG);
  const st = createRigState(rig);
  /** Chunk records: the rig, then the joints. */
  const chunks = new Float32Array((WARDEN_CHUNKS + JOINTS) * CHUNK_FLOATS);
  // Each chunk's nearest overlapping chunks (by surface gap, measured once from the first live
  // pose: the rig's topology never changes), for the shader's blended normal and crevice shade.
  const nbr = new Uint32Array(WARDEN_CHUNKS * WARDEN_NBR);
  const nbrGap = new Float64Array(WARDEN_NBR);
  const joint = new Uint8Array(JOINTS);
  const jointT = new Float64Array(JOINTS);       // seconds frozen
  // Joint world positions (refreshed each frame).
  const openK = new Float64Array(JOINTS);
  const jx = new Float64Array(JOINTS), jy = new Float64Array(JOINTS), jz = new Float64Array(JOINTS);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const self = {
    body, chunks, joint, jx, jy, jz, nbr,
    /** Set when nbr has been (re)computed; the view uploads it and clears the flag. */
    nbrDirty: false, nbrReady: false,
    /** Seconds a frozen joint holds before it thaws (an Echo lengthens it). */
    thawTime: 18,
    active: false, state: W.DORMANT, t: 0.5, glow: 0.5 - 0.5, stompLeg: 0,
    /** Climbed (set by the climb system); while climbed it bucks every few seconds. */
    climbed: false, shaking: false, shakeCool: 0.5, shakeT: 0.5 - 0.5,
    /** 0..1 how far it has settled into the land (release). */
    settle: 0.5 - 0.5,
    /** Player (fields) and outputs: hits on the Wraith, footfall shake strength this frame. */
    px: 0.5, pz: 0.5, dt: 0.5, hits: 0, hitDamage: 0.5 - 0.5, shake: 0.5 - 0.5,
    /** Stilled until released: 0 dormant/stilled … 1 restored (drives the biome's restoration). */
    restore: 0.5 - 0.5,
    /** Release: the exhale's wind gust 0..1 (owner adds it to the wind), and its wave radius. */
    gust: 0.5 - 0.5, wave: -1.5 + 0.5,
    /** The slam's shockwave: centre and radius (−1: none); slam is set on the impact frame. */
    shockX: 0.5, shockZ: 0.5, shockR: -1.5 + 0.5, slam: false, drifts: false,
    /** 0..1 snow cover as it lies down into the land (chunk records carry it in alpha). */
    cover: 0.5 - 0.5,
    /** Struck flash (0..1) and the stomp's ground ring (centre, radius; −1 none). */
    hurt: 0.5 - 0.5, ringX: 0.5, ringZ: 0.5, ringR: -1.5 + 0.5, ringHit: false,
    /** The Wraith is on the ground (the stomp's ring passes under a jump). */
    pgrounded: true,
    /** Owner hook: throw an ice shard from (sx, sy, sz) at (tx, ty, tz) (shaped.js's shard pool). */
    shoot: null, sx: 0.5, sy: 0.5, sz: 0.5, tx: 0.5, ty: 0.5, tz: 0.5,
    /** Seconds until it may attack again; how angry it is (joints broken). */
    cool: 0.5 + 2.5,
    /** Sound (audio/sfx.js), set by the owner; null = silent. */
    sfx: null,
    get rage() { return JOINTS - this.remaining; },
    /** A spell struck its body at (hx, hy, hz) along (hdx, hdz): material chips off, it flinches,
     *  it turns on the Wraith. */
    hx: 0.5, hy: 0.5, hz: 0.5, hdx: 0.5, hdz: 0.5,
    bodyHit() {
      if (!this.active || this.state >= W.RELEASE && this.state <= W.RESTED) return;
      this.hurt = 1;
      for (let q = 0; q < 26; q++) {
        fx.ex = this.hx + (rnd() - 0.5) * 0.8; fx.ey = this.hy + (rnd() - 0.5) * 0.8; fx.ez = this.hz + (rnd() - 0.5) * 0.8;
        fx.evx = -this.hdx * (1 + 3 * rnd()) + (rnd() - 0.5) * 3; fx.evz = -this.hdz * (1 + 3 * rnd()) + (rnd() - 0.5) * 3; fx.evy = 0.5 + 3 * rnd();
        fx.esize = 0.08 + 0.16 * rnd(); fx.emit();
      }
      // Lumps of it land in the snow below.
      ground.qx = this.hx; ground.qz = this.hz; ground.sample();
      ts.bx = this.hx - this.hdx * 1.5; ts.bz = this.hz - this.hdz * 1.5; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 0.4 + 0.3 * rnd(); ts.bd = 0.18; ts.bc = 0;
      ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
      ts.stamp();
      this.flinch = 1;
      if (this.state === W.DORMANT) { this.state = W.AWAKE; this.t = 0; }
      this.cool = Math.min(this.cool, 1.2);
    },
    flinch: 0.5 - 0.5, tailDir: 1, tailDone: false, shed: 0,
    /** Ray out through the mass (fields in: origin rox/roy/roz inside it, unit direction
     *  rdx/rdy/rdz): distance to where it leaves the outermost chunk (the visible surface along
     *  that line), or −1 if it hits nothing. Chunk radii are their crag-mean (rig size × 0.43, the cleaved blocks). */
    rox: 0.5, roy: 0.5, roz: 0.5, rdx: 0.5, rdy: 0.5, rdz: 0.5,
    /** rayOut() window (m along the ray): a chunk counts only if entered before rnear and left before rfar. */
    rnear: 1e9, rfar: 1e9,
    rayOut() {
      const ox = this.rox, oy = this.roy, oz = this.roz, dx = this.rdx, dy = this.rdy, dz = this.rdz;
      let best = -1;
      for (let c = 0; c < WARDEN_CHUNKS; c++) {
        const o = c * CHUNK_FLOATS;
        if (chunks[o + 15] < 0.5 || chunks[o + 13] === CHUNK.ICE) continue;
        const px = ox - chunks[o], py = oy - chunks[o + 1], pz = oz - chunks[o + 2];
        // Cheap reject: the ray's closest approach beyond the chunk's largest radius.
        const big = Math.max(chunks[o + 3], chunks[o + 7], chunks[o + 11]) * 0.6;
        const tc = -(px * dx + py * dy + pz * dz);
        const qx = px + dx * tc, qy = py + dy * tc, qz = pz + dz * tc;
        if (qx * qx + qy * qy + qz * qz > big * big) continue;
        const fx = chunks[o + 4], fy = chunks[o + 5], fz = chunks[o + 6], ux = chunks[o + 8], uy = chunks[o + 9], uz = chunks[o + 10];
        const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
        const sx = chunks[o + 3] * 0.43, sy = chunks[o + 7] * 0.43, sz = chunks[o + 11] * 0.43;
        const a0 = (px * rx + py * ry + pz * rz) / sx, a1 = (px * ux + py * uy + pz * uz) / sy, a2 = (px * fx + py * fy + pz * fz) / sz;
        const b0 = (dx * rx + dy * ry + dz * rz) / sx, b1 = (dx * ux + dy * uy + dz * uz) / sy, b2 = (dx * fx + dy * fy + dz * fz) / sz;
        const A = b0 * b0 + b1 * b1 + b2 * b2, B = a0 * b0 + a1 * b1 + a2 * b2, C = a0 * a0 + a1 * a1 + a2 * a2 - 1;
        const disc = B * B - A * C;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc), tIn = (-B - sq) / A, t = (-B + sq) / A;
        // Only chunks on the surface being climbed: entered near the tube and left within reach
        // (a far chunk along the same ray — another leg, the body — is not this surface).
        if (tIn > this.rnear || t > this.rfar) continue;
        if (t > best) best = t;
      }
      return best;
    },
    /** Camera probe (fields in): is (qx, qy, qz) inside the mass, with a little clearance? */
    qx: 0.5, qy: 0.5, qz: 0.5,
    probe() {
      if (!this.active) return false;
      const x = this.qx, y = this.qy, z = this.qz;
      const bx = x - body.x, bz = z - body.z;
      if (bx * bx + bz * bz > 40 * 40) return false;
      for (let c = 0; c < WARDEN_CHUNKS; c++) {
        const o = c * CHUNK_FLOATS;
        if (chunks[o + 15] < 0.5 || chunks[o + 13] === CHUNK.ICE) continue;
        const dx = x - chunks[o], dy = y - chunks[o + 1], dz = z - chunks[o + 2];
        // Ellipsoid in the chunk frame (r = up × fwd), radii a little past the crags' mean.
        const fx = chunks[o + 4], fy = chunks[o + 5], fz = chunks[o + 6], ux = chunks[o + 8], uy = chunks[o + 9], uz = chunks[o + 10];
        const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
        const sx = chunks[o + 3] * 0.5 + 0.6, sy = chunks[o + 7] * 0.5 + 0.6, sz = chunks[o + 11] * 0.5 + 0.6;
        const qa = (dx * rx + dy * ry + dz * rz) / sx, qb = (dx * ux + dy * uy + dz * uz) / sy, qc = (dx * fx + dy * fy + dz * fz) / sz;
        if (qa * qa + qb * qb + qc * qc < 1) return true;
      }
      return false;
    },

    place(x, z, heading) {
      body.place(x, z, heading);
      body.rise = 1; body.crouch = 0; body.lift = 0; body.frozen = false; body.rear = 0; body.lie = 0;
      this.active = true; this.state = W.DORMANT; this.t = 0; this.settle = 0; this.restore = 0;
      this.cover = 0; this.shockR = -1; this.slam = false; this.gust = 0; this.drifts = false;
      this.hurt = 0; this.ringR = -1; this.cool = 3; this.flinch = 0;
      this.nbrReady = false;
      this.climbed = false; this.shaking = false; this.shakeCool = 4; this.shakeT = 0;
      joint.fill(JOINT.LIQUID); jointT.fill(0); openK.fill(0);
    },
    /** Joints still unbroken. */
    get remaining() { let n = 0; for (let k = 0; k < JOINTS; k++) if (joint[k] !== JOINT.SHATTERED) n++; return n; },
    /**
     * Whether joint k can be worked from the ground. The knees always; the shoulder seam once both
     * knees are broken (the Warden sags onto its forelegs, lowering it to reach); the hip seam once
     * the shoulder is. Climbing reaches any joint at any time.
     */
    exposed(k) { return k < 2 || (k === 2 ? joint[0] === JOINT.SHATTERED && joint[1] === JOINT.SHATTERED : joint[2] === JOINT.SHATTERED); },
    /** Name of joint k for the interface. */
    jointName(k) { return k === 0 ? 'left knee' : k === 1 ? 'right knee' : k === 2 ? 'shoulder seam' : 'hip seam'; },
    /** Freeze joint k (Crystallize, a soaked Ribbon). */
    freezeJoint(k) { if (joint[k] === JOINT.LIQUID) { joint[k] = JOINT.FROZEN; jointT[k] = 0; } },
    /** Strike joint k: a frozen joint shatters; returns true if it broke. */
    strikeJoint(k) {
      if (joint[k] !== JOINT.FROZEN) return false;
      joint[k] = JOINT.SHATTERED;
      for (let q = 0; q < 60; q++) {
        fx.ex = jx[k]; fx.ey = jy[k]; fx.ez = jz[k];
        fx.evx = (rnd() - 0.5) * 9; fx.evy = 1 + rnd() * 7; fx.evz = (rnd() - 0.5) * 9; fx.esize = 0.12 + 0.3 * rnd(); fx.emit();
      }
      if (this.remaining === 0) { this.state = W.RELEASE; this.t = 0; }
      else { this.state = W.KNEEL; this.t = 0; }
      return true;
    },
    /**
     * Load a released Warden (save v2): lying in the land at (x, z) with its heading, snowed over.
     * Its release is stepped silently from the impact to rest — no terrain writes (the saved pages
     * already hold its crater, shockwave and drifts), no spray, no sound.
     */
    rest(x, z, heading) {
      this.place(x, z, heading);
      joint.fill(JOINT.SHATTERED);
      const stamp = ts.stamp, emit = fx.emit, sfx = this.sfx, d = this.dt;
      ts.stamp = noop; fx.emit = noop; this.sfx = null;
      this.state = W.RELEASE; this.t = RELEASE_T.impact + 0.05; this.drifts = true;
      body.rear = 0; body.crouch = 1; body.lie = 0.6;
      this.dt = 1 / 30;
      for (let k = 0; k < 2000 && this.state === W.RELEASE; k++) this.update();
      ts.stamp = stamp; fx.emit = emit; this.sfx = sfx; this.dt = d;
      this.shake = 0; this.slam = false;
    },
    /** Skip the rest of the release: straight to lying in the land, snowed over, restored. */
    finishRelease() {
      if (this.state !== W.RELEASE) return;
      this.t = RELEASE_T.rested - 0.01;
      body.rear = 0; body.crouch = 1; body.lie = 1; this.glow = 0;
      this.shockR = -1; this.gust = 0;
      if (!this.drifts) banks(this);
      const d = this.dt; this.dt = 0.02; this.update(); this.dt = d;
    },
    update() {
      if (!this.active) { writeHidden(chunks, 0, WARDEN_CHUNKS + JOINTS); return; }
      const dt = this.dt;
      this.hits = 0; this.hitDamage = 0; this.shake = 0; this.slam = false;
      // Rested: it lies in the land for good — a snow-covered ridge with its spires standing.
      if (this.state === W.RESTED) { this.restore = 1; this.cover = 1; return; }
      this.t += dt;
      // Frozen joints thaw if not broken in time.
      for (let k = 0; k < JOINTS; k++) if (joint[k] === JOINT.FROZEN && (jointT[k] += dt) > this.thawTime) joint[k] = JOINT.LIQUID;
      // Bucking: when climbed, every few seconds it heaves to throw the Wraith off.
      this.shaking = false;
      if (this.climbed && (this.state === W.AWAKE || this.state === W.DORMANT)) {
        this.shakeCool -= dt;
        if (this.shakeCool <= 0) { this.shakeT = 1.7; this.shakeCool = 6.5 + 3 * rnd(); }
      }
      if (this.shakeT > 0 && this.state !== W.RELEASE) {
        this.shakeT -= dt; this.shaking = true;
        // A slow, heavy heave (a colossus cannot judder: at 2 m and 13 rad/s it read as a glitch).
        body.crouch = 0.2 * Math.sin(this.shakeT * 7.5) * Math.min(1, this.shakeT * 2);
        body.heading += 0.035 * Math.sin(this.shakeT * 5.5) * dt * 8;
        body.wantVx = 0; body.wantVz = 0;
      } else {
        think(this, dt);
        // Climbed: it plants its feet and heaves; it does not chase what is on its own back.
        if (this.climbed && (this.state === W.AWAKE || this.state === W.STOMP)) { body.wantVx = 0; body.wantVz = 0; }
      }
      body.dt = dt; body.update();
      // Footfalls: craters crushed into the snow, powder thrown up, the ground shakes.
      for (let e = 0; e < body.evCount; e++) {
        const o = e * 5, x = body.ev[o], z = body.ev[o + 1];
        ts.bx = x; ts.bz = z; ts.bdx = body.ev[o + 2]; ts.bdz = body.ev[o + 3]; ts.bl = 0.6; ts.bw = 1.25; ts.bd = 0.4; ts.bc = 0.9;
        ts.stamp();
        ground.qx = x; ground.qz = z; ground.sample();
        for (let q = 0; q < 26; q++) {
          const a = rnd() * Math.PI * 2;
          fx.ex = x + Math.cos(a) * 1.2; fx.ez = z + Math.sin(a) * 1.2; fx.ey = ground.h + 0.1;
          fx.evx = Math.cos(a) * (2 + 4 * rnd()); fx.evz = Math.sin(a) * (2 + 4 * rnd()); fx.evy = 1 + 3 * rnd(); fx.esize = 0.15 + 0.25 * rnd();
          fx.emit();
        }
        const d = Math.hypot(this.px - x, this.pz - z);
        this.shake += 0.03 * Math.max(0, 1 - d / 45);
        if (this.sfx) { this.sfx.x = x; this.sfx.y = ground.h; this.sfx.z = z; this.sfx.gain = 0.55; this.sfx.play(SFX.BOOM); }
      }
      this.hurt = Math.max(0, this.hurt - dt * 4);
      if (this.flinch > 0) { this.flinch = Math.max(0, this.flinch - dt * 2.5); body.crouch = Math.max(body.crouch, 0.18 * Math.sin(Math.PI * (1 - this.flinch))); }
      stompRing(this);
      writeAlive(body, st, chunks, 0, 1, this.glow, this.hurt);
      // Snow cover rides in each visible chunk's alpha (1 bare … 0.51 buried; > 0.5 = shown).
      if (this.cover > 0) {
        const a = 1 - 0.49 * this.cover;
        for (let c = 0; c < WARDEN_CHUNKS; c++) { const o = c * CHUNK_FLOATS + 15; if (chunks[o] > 0.5) chunks[o] = a; }
      }
      if (!this.nbrReady) { neighbours(); this.nbrReady = true; this.nbrDirty = true; }
      writeJoints(this);
    },
  };

  /** Nearest chunks by surface gap (centre distance minus mean radii); ice shards are left out
   *  (they stand proud of the mass). Runs once. */
  function neighbours() {
    for (let i = 0; i < WARDEN_CHUNKS; i++) {
      nbrGap.fill(1e9);
      for (let k = 0; k < WARDEN_NBR; k++) nbr[i * WARDEN_NBR + k] = i;
      const oi = i * CHUNK_FLOATS, ri = (chunks[oi + 3] + chunks[oi + 7] + chunks[oi + 11]) / 6;
      for (let j = 0; j < WARDEN_CHUNKS; j++) {
        const oj = j * CHUNK_FLOATS;
        if (j === i || chunks[oj + 13] === CHUNK.ICE) continue;
        const rj = (chunks[oj + 3] + chunks[oj + 7] + chunks[oj + 11]) / 6;
        const g = Math.hypot(chunks[oj] - chunks[oi], chunks[oj + 1] - chunks[oi + 1], chunks[oj + 2] - chunks[oi + 2]) - ri - rj;
        if (g > 1.5) continue;
        // Insert into the sorted short list.
        let k = WARDEN_NBR - 1;
        if (g >= nbrGap[k]) continue;
        while (k > 0 && nbrGap[k - 1] > g) { nbrGap[k] = nbrGap[k - 1]; nbr[i * WARDEN_NBR + k] = nbr[i * WARDEN_NBR + k - 1]; k--; }
        nbrGap[k] = g; nbr[i * WARDEN_NBR + k] = j;
      }
    }
  }

  /** Joint positions from the bones, and their records (liquid glows; frozen is ice; broken gone). */
  function writeJoints(W0) {
    for (let k = 0; k < JOINTS; k++) {
      if (k < 2) {
        // Front knees, a little outboard.
        const l = k, side = l === 0 ? -1 : 1;
        jx[k] = body.kx[l] + Math.cos(body.heading) * side * 0.6; jy[k] = body.ky[l]; jz[k] = body.kz[l] - Math.sin(body.heading) * side * 0.6;
      } else {
        // The back seams sit low on the flanks (shoulder left, hip right) and, once exposed, sink to
        // a height the Wraith can reach from the snow.
        const i = k === 2 ? 1 : 5, side = k === 2 ? -1 : 1, h = body.heading;
        jx[k] = body.sx[i] + Math.cos(h) * side * 5; jz[k] = body.sz[i] - Math.sin(h) * side * 5;
        const nat = body.sy[i] + WARDEN_SHAPE.hip * 0.42 * (1 - 0.75 * W0.settle);
        const want = joint[k] !== JOINT.SHATTERED && W0.exposed(k) ? 1 : 0;
        openK[k] += (want - openK[k]) * Math.min(1, (W0.dt || 0.016) * 0.8);
        ground.qx = jx[k]; ground.qz = jz[k]; ground.sample();
        const lowY = ground.h + 2.6, e = openK[k] * openK[k] * (3 - 2 * openK[k]);
        jy[k] = Math.max(ground.h + 2.2, nat + (Math.min(nat, lowY) - nat) * e);
      }
      const o = (WARDEN_CHUNKS + k) * CHUNK_FLOATS, sz = k < 2 ? 1.3 : 1.7;
      chunks[o] = jx[k]; chunks[o + 1] = jy[k]; chunks[o + 2] = jz[k]; chunks[o + 3] = sz;
      chunks[o + 4] = Math.sin(body.heading); chunks[o + 5] = 0; chunks[o + 6] = Math.cos(body.heading); chunks[o + 7] = sz;
      chunks[o + 8] = 0; chunks[o + 9] = 1; chunks[o + 10] = 0; chunks[o + 11] = sz;
      chunks[o + 12] = 31 + k * 7; chunks[o + 13] = CHUNK.WATER;
      chunks[o + 14] = joint[k] === JOINT.FROZEN ? 2.5 : 0.5 + 0.5 * Math.sin(W0.t * 2.2 + k);
      chunks[o + 15] = joint[k] === JOINT.SHATTERED ? 0 : 1 - W0.settle;
    }
  }

  /** Dormant until the Wraith comes near; then turns to face it, advances slowly, stomps at it
   *  when it is near a front foot. A broken joint drops it to a kneel. */
  function think(W0, dt) {
    const dx = W0.px - body.x, dz = W0.pz - body.z, dist = Math.hypot(dx, dz) || 1e-3;
    switch (W0.state) {
      case W.DORMANT:
        body.wantVx = 0; body.wantVz = 0;
        if (dist < 45) { W0.state = W.AWAKE; W0.t = 0; }
        break;
      case W.AWAKE: {
        // Turn to face, then advance until close; a slow, heavy approach.
        let want = Math.atan2(dx, dz) - body.heading; want -= Math.round(want / (2 * Math.PI)) * 2 * Math.PI;
        const fury = 1 + 0.25 * W0.rage;
        const sp = (Math.abs(want) > 0.5 ? 0.6 : dist > 18 ? WARDEN_SHAPE.maxSpeed : 0) * fury;
        body.wantVx = dx / dist * sp; body.wantVz = dz / dist * sp;
        body.crouch += (0.1 * (JOINTS - W0.remaining) - body.crouch) * Math.min(1, dt);   // it sags as it breaks
        W0.cool -= dt * fury;
        if (W0.cool > 0 || W0.climbed) break;
        // Pick an attack by where the Wraith is: at a front foot → stomp; behind → tail; far → shards.
        for (let l = 0; l < 2; l++) {
          if (Math.hypot(W0.px - body.fx[l], W0.pz - body.fz[l]) < 8) { W0.state = W.STOMP; W0.t = 0; W0.stompLeg = l; return; }
        }
        if (Math.abs(want) > 2.1 && dist < 22) { W0.state = W.TAIL; W0.t = 0; W0.tailDir = want > 0 ? -1 : 1; W0.tailDone = false; return; }
        if (dist > 14 && dist < 45) { W0.state = W.SHED; W0.t = 0; W0.shed = 0; return; }
        break;
      }
      case W.TAIL: {
        // Tail sweep: it shifts its weight (the spires along the back glow), then pivots hard,
        // swinging its tail through where the Wraith stands.
        body.wantVx = 0; body.wantVz = 0;
        W0.glow += ((W0.t < 0.9 ? 0.7 : 0) - W0.glow) * Math.min(1, dt * 4);
        if (W0.t < 0.9) body.heading -= W0.tailDir * 0.12 * dt;              // wind-up
        else if (W0.t < 1.6) {
          if (W0.t - dt < 0.9 && W0.sfx) { const k = WARDEN_SHAPE.tail - 1; W0.sfx.x = body.tx[k]; W0.sfx.y = body.ty[k]; W0.sfx.z = body.tz[k]; W0.sfx.gain = 1.6; W0.sfx.play(SFX.WHOOSH); W0.sfx.play(SFX.RUMBLE); }
          body.heading += W0.tailDir * 1.25 * dt;                             // the swing
          const n = WARDEN_SHAPE.tail - 1;
          for (let k = 1; k <= n; k++) {
            if (!W0.tailDone && Math.hypot(W0.px - body.tx[k], W0.pz - body.tz[k]) < 3.2) {
              W0.tailDone = true; W0.hits++; W0.hitDamage += 28;
            }
          }
          if (rnd() < 0.7) {
            const k = WARDEN_SHAPE.tail - 1; ground.qx = body.tx[k]; ground.qz = body.tz[k]; ground.sample();
            fx.ex = body.tx[k]; fx.ey = ground.h + 0.2; fx.ez = body.tz[k]; fx.evx = (rnd() - 0.5) * 3; fx.evy = 1 + 2 * rnd(); fx.evz = (rnd() - 0.5) * 3; fx.esize = 0.3 + 0.3 * rnd(); fx.emit();
          }
        }
        if (W0.t >= 2.4) { W0.state = W.AWAKE; W0.t = 0; W0.cool = 3.5; W0.glow = 0; }
        break;
      }
      case W.SHED: {
        // Ice shard volley: its spires glow, then it sheds shards that arc down around the Wraith.
        body.wantVx = 0; body.wantVz = 0;
        W0.glow += (0.8 - W0.glow) * Math.min(1, dt * 3);
        body.crouch += (0.15 - body.crouch) * Math.min(1, dt * 3);
        if (W0.t > 1.0 && W0.shed < 5 + W0.rage && W0.t > 1.0 + W0.shed * 0.22) {
          const i = 1 + (W0.shed % 4);
          W0.sx = body.sx[i]; W0.sy = body.sy[i] + WARDEN_SHAPE.hip * 0.8; W0.sz = body.sz[i];
          const a = rnd() * Math.PI * 2, r = W0.shed === 0 ? 0 : 1 + 3 * rnd();
          W0.tx = W0.px + Math.cos(a) * r; W0.tz = W0.pz + Math.sin(a) * r;
          ground.qx = W0.tx; ground.qz = W0.tz; ground.sample(); W0.ty = ground.h + 0.8;
          if (W0.shoot) W0.shoot();
          W0.shed++;
        }
        if (W0.t >= 3.2) { W0.state = W.AWAKE; W0.t = 0; W0.cool = 4; W0.glow = 0; }
        break;
      }
      case W.STOMP: {
        // Rear the front up (glow in the cracks), then crash down: a crater where it lands.
        body.wantVx = 0; body.wantVz = 0;
        W0.glow += (1 - W0.glow) * Math.min(1, dt * 3);
        body.crouch = W0.t < 1.3 ? -0.25 * Math.min(1, W0.t / 0.8) : body.crouch + (0.3 - body.crouch) * Math.min(1, dt * 12);
        if (W0.t >= 1.5 && W0.t - dt < 1.5) {
          const l = W0.stompLeg || 0, x = body.fx[l] + Math.sin(body.heading) * 2, z = body.fz[l] + Math.cos(body.heading) * 2;
          ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 3.2; ts.bd = 0.6; ts.bc = 0.9;
          ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1.2;
          ts.stamp();
          ground.qx = x; ground.qz = z; ground.sample();
          for (let q = 0; q < 80; q++) {
            const a = rnd() * Math.PI * 2, r = rnd() * 3;
            fx.ex = x + Math.cos(a) * r; fx.ez = z + Math.sin(a) * r; fx.ey = ground.h + 0.2;
            fx.evx = Math.cos(a) * (3 + 6 * rnd()); fx.evz = Math.sin(a) * (3 + 6 * rnd()); fx.evy = 2 + 6 * rnd(); fx.esize = 0.2 + 0.4 * rnd();
            fx.emit();
          }
          const d = Math.hypot(W0.px - x, W0.pz - z);
          if (d < 3.5) { W0.hits++; W0.hitDamage += 35; }               // under the foot
          if (W0.sfx) { W0.sfx.x = x; W0.sfx.y = ground.h; W0.sfx.z = z; W0.sfx.gain = 1.5; W0.sfx.play(SFX.BOOM); W0.sfx.play(SFX.RUMBLE); }
          W0.shake += 0.06 * Math.max(0, 1 - d / 60);
          // The shock runs out along the ground as a ring.
          W0.ringX = x; W0.ringZ = z; W0.ringR = 3; W0.ringHit = d < 3.5;
        }
        if (W0.t >= 2.6) { W0.state = W.AWAKE; W0.t = 0; W0.glow = 0; W0.cool = 2.5; }
        break;
      }
      case W.KNEEL:
        // A joint broke: it buckles to its knees, then rises again.
        body.wantVx = 0; body.wantVz = 0; W0.glow += (0 - W0.glow) * Math.min(1, dt * 2);
        body.crouch += (((W0.t < 5.5 ? 0.85 : 0.1 * (JOINTS - W0.remaining))) - body.crouch) * Math.min(1, dt * (W0.t < 5.5 ? 2.5 : 0.8));
        if (W0.t >= 8) { W0.state = W.AWAKE; W0.t = 0; W0.cool = 4.5; }
        break;
      case W.RELEASE: release(W0, dt); break;
    }
  }

  /** The stomp's ground ring: rides out to 16 m; it knocks the Wraith if it passes under its
   *  feet (a jump or a bend-step clears it). */
  function stompRing(W0) {
    if (W0.ringR < 0) return;
    const prev = W0.ringR;
    W0.ringR += 17 * W0.dt;
    if (W0.ringR > 16) { W0.ringR = -1; return; }
    const R = W0.ringR, cx = W0.ringX, cz = W0.ringZ;
    for (let q = 0; q < 10; q++) {
      const a = rnd() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      fx.ex = cx + ca * R; fx.ez = cz + sa * R; ground.qx = fx.ex; ground.qz = fx.ez; ground.sample(); fx.ey = ground.h + 0.05;
      fx.evx = ca * 6; fx.evz = sa * 6; fx.evy = 0.6 + 1.2 * rnd(); fx.esize = 0.25 + 0.3 * rnd(); fx.emit();
    }
    const d = Math.hypot(W0.px - cx, W0.pz - cz);
    if (!W0.ringHit && prev < d && R >= d && W0.pgrounded) { W0.ringHit = true; W0.hits++; W0.hitDamage += 18; }
  }

  // The shockwave's scour rays (fixed angles, so each ray's groove is continuous frame to frame).
  const rayA = new Float64Array(SHOCK_RAYS), rayR = new Float64Array(SHOCK_RAYS);
  for (let k = 0; k < SHOCK_RAYS; k++) rayA[k] = (k + 0.5 * rnd()) / SHOCK_RAYS * Math.PI * 2;
  const SEG = 2.6;   // m: each ray is scoured in end-to-end segments (no overlap ripple)

  /** Release, not death (BRIEF §8.4). The stillness leaves it along its fractures; it rears,
   *  slams down onto its chest — a shockwave tears out across the steppe — then lies down into
   *  the land, snowing over, while the biome is restored around it. It never sinks or vanishes. */
  function release(W0, dt) {
    const t = W0.t, R = RELEASE_T, hip = WARDEN_SHAPE.hip;
    body.wantVx = 0; body.wantVz = 0;
    if (t < R.rear) {
      // Stillness breaking: light floods the fractures; it gathers itself.
      W0.glow = (t / R.rear) * (t / R.rear);
      body.crouch += (0.3 - body.crouch) * Math.min(1, dt * 3);
    } else if (t < R.slam) {
      // Rearing: front up, head high, the spires shedding powder.
      W0.glow = 1;
      body.crouch += (0 - body.crouch) * Math.min(1, dt * 4);
      body.rear += (1 - body.rear) * Math.min(1, dt * 3.2);
      for (let q = 0; q < 3; q++) {
        const i = Math.floor(rnd() * 3);
        fx.ex = body.sx[i] + (rnd() - 0.5) * hip; fx.ey = body.sy[i] + hip * 0.6; fx.ez = body.sz[i] + (rnd() - 0.5) * hip;
        fx.evx = (rnd() - 0.5) * 2; fx.evy = -1.5; fx.evz = (rnd() - 0.5) * 2; fx.esize = 0.05 + 0.07 * rnd(); fx.emit();
      }
    } else if (t < R.impact) {
      // The slam: down onto its chest, accelerating.
      const u = (t - R.slam) / (R.impact - R.slam);
      body.rear = 1 - u * u; body.crouch = u * u; body.lie = 0.6 * u * u;
    } else {
      if (t - dt < R.impact) impact(W0);
      body.rear = 0; body.crouch = 1;
      body.lie += (1 - body.lie) * Math.min(1, dt * 1.2);
      W0.glow = Math.max(0, 1 - (t - R.impact) / 2.2);
      shockwave(W0);
      if (t > 6 && !W0.drifts) banks(W0);
    }
    // Snow over it, and the land restored around it.
    const c = Math.min(1, Math.max(0, (t - 4.5) / 8)); W0.cover = c * c * (3 - 2 * c);
    W0.restore = Math.min(1, Math.max(0, (t - 3.5) / 10));
    W0.settle = W0.restore;
    W0.gust = t < R.impact ? 0 : Math.max(0, 1 - (t - R.impact) / 8) * Math.min(1, (t - R.impact) * 4);
    if (t >= R.rested) { W0.state = W.RESTED; W0.shockR = -1; W0.gust = 0; W0.glow = 0; W0.cover = 1; W0.restore = 1; }
  }

  /** The slam lands: a crater under the chest, a burst of powder, the shockwave begins. */
  function impact(W0) {
    W0.slam = true; W0.shake += 0.14;
    if (W0.sfx) { W0.sfx.x = body.sx[1]; W0.sfx.y = body.sy[1]; W0.sfx.z = body.sz[1]; W0.sfx.gain = 2.2; W0.sfx.play(SFX.BOOM); W0.sfx.play(SFX.BOOM); W0.sfx.play(SFX.RUMBLE); }
    const cx = body.sx[1], cz = body.sz[1], fwx = Math.sin(body.heading), fwz = Math.cos(body.heading);
    W0.shockX = body.sx[2]; W0.shockZ = body.sz[2]; W0.shockR = WARDEN_SHAPE.hip * 1.3;
    ts.bx = cx + fwx * 2; ts.bz = cz + fwz * 2; ts.bdx = fwx; ts.bdz = fwz; ts.bl = 5; ts.bw = 6; ts.bd = 0.7; ts.bc = 0.8;
    ts.stamp();
    for (let q = 0; q < 140; q++) {
      const a = rnd() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), r = WARDEN_SHAPE.hip * (0.6 + 0.6 * rnd());
      fx.ex = cx + ca * r; fx.ez = cz + sa * r;
      ground.qx = fx.ex; ground.qz = fx.ez; ground.sample();
      fx.ey = ground.h + 0.3 + rnd() * 2;
      const v = 6 + 10 * rnd();
      fx.evx = ca * v; fx.evz = sa * v; fx.evy = 2 + 6 * rnd(); fx.esize = 1.2 + 1.8 * rnd();
      fx.emit();
    }
  }

  /** The shockwave front: a wall of powder riding outward, scouring radial grooves near the
   *  Wraith (where the fine terrain state is), past it and out across the steppe. */
  function shockwave(W0) {
    if (W0.shockR < 0) return;
    W0.shockR += SHOCK_SPEED * W0.dt;
    if (W0.shockR > SHOCK_MAX) { W0.shockR = -1; return; }
    const R = W0.shockR, cx = W0.shockX, cz = W0.shockZ;
    const pa = Math.atan2(W0.pz - cz, W0.px - cx);
    for (let q = 0; q < 18; q++) {
      // Half the powder toward the Wraith (where the camera is), half all round.
      const a = q < 9 ? pa + (rnd() - 0.5) * 1.6 : rnd() * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      fx.ex = cx + ca * R; fx.ez = cz + sa * R;
      ground.qx = fx.ex; ground.qz = fx.ez; ground.sample();
      fx.ey = ground.h + 0.1 + rnd() * 1.4;
      const v = 14 + 9 * rnd();
      fx.evx = ca * v; fx.evz = sa * v; fx.evy = 0.6 + 2.4 * rnd(); fx.esize = 1.0 + 1.6 * rnd();
      fx.emit();
    }
    if (W0.t - W0.dt < RELEASE_T.impact) rayR.fill(R);
    let n = 0;
    for (let r = 0; r < SHOCK_RAYS && n < 20; r++) {
      if (R - rayR[r] < SEG) continue;
      const ca = Math.cos(rayA[r]), sa = Math.sin(rayA[r]);
      const m = rayR[r] + SEG * 0.5, x = cx + ca * m, z = cz + sa * m;
      rayR[r] += SEG;
      const dx = x - W0.px, dz = z - W0.pz;
      if (dx * dx + dz * dz > 38 * 38) continue;
      ts.bx = x; ts.bz = z; ts.bdx = ca; ts.bdz = sa; ts.bl = SEG * 0.5 - 0.15; ts.bw = 0.45 + 0.15 * Math.sin(r * 1.7); ts.bd = 0.07; ts.bc = 0.2;
      ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.5;
      ts.stamp(); n++;
    }
  }

  /** Drifts bank up against it as it lies down: one long mound per spine segment, either side. */
  function banks(W0) {
    W0.drifts = true;
    const rx = Math.cos(body.heading), rz = -Math.sin(body.heading), w = WARDEN_SHAPE.hip * 0.62;
    for (let i = 0; i < WARDEN_SHAPE.spine; i++) {
      for (let s = -1; s <= 1; s += 2) {
        ts.bx = body.sx[i] + rx * s * w; ts.bz = body.sz[i] + rz * s * w;
        ts.bdx = Math.sin(body.heading); ts.bdz = Math.cos(body.heading);
        ts.bl = WARDEN_SHAPE.spacing * 1.2; ts.bw = WARDEN_SHAPE.hip * 0.5; ts.bd = 2.3; ts.bc = 0.3;
        ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
      }
    }
  }

  return self;
}
