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
export const W = { DORMANT: 0, AWAKE: 1, STOMP: 2, KNEEL: 3, RELEASE: 4 };

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
  const jx = new Float64Array(JOINTS), jy = new Float64Array(JOINTS), jz = new Float64Array(JOINTS);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const self = {
    body, chunks, joint, jx, jy, jz, nbr,
    /** Set when nbr has been (re)computed; the view uploads it and clears the flag. */
    nbrDirty: false, nbrReady: false,
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
      body.rise = 1; body.crouch = 0; body.lift = 0; body.frozen = false;
      this.active = true; this.state = W.DORMANT; this.t = 0; this.settle = 0; this.restore = 0;
      this.nbrReady = false;
      this.climbed = false; this.shaking = false; this.shakeCool = 4; this.shakeT = 0;
      joint.fill(JOINT.LIQUID); jointT.fill(0);
    },
    /** Joints still unbroken. */
    get remaining() { let n = 0; for (let k = 0; k < JOINTS; k++) if (joint[k] !== JOINT.SHATTERED) n++; return n; },
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
    update() {
      if (!this.active) { writeHidden(chunks, 0, WARDEN_CHUNKS + JOINTS); return; }
      const dt = this.dt;
      this.t += dt; this.hits = 0; this.hitDamage = 0; this.shake = 0;
      // Frozen joints thaw if not broken in time.
      for (let k = 0; k < JOINTS; k++) if (joint[k] === JOINT.FROZEN && (jointT[k] += dt) > 9) joint[k] = JOINT.LIQUID;
      // Bucking: when climbed, every few seconds it heaves to throw the Wraith off.
      this.shaking = false;
      if (this.climbed && (this.state === W.AWAKE || this.state === W.DORMANT)) {
        this.shakeCool -= dt;
        if (this.shakeCool <= 0) { this.shakeT = 1.7; this.shakeCool = 6.5 + 3 * rnd(); }
      }
      if (this.shakeT > 0 && this.state !== W.RELEASE) {
        this.shakeT -= dt; this.shaking = true;
        body.crouch = 0.28 * Math.sin(this.shakeT * 13) * Math.min(1, this.shakeT * 2);
        body.heading += 0.05 * Math.sin(this.shakeT * 9) * dt * 8;
        body.wantVx = 0; body.wantVz = 0;
      } else think(this, dt);
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
      }
      // Release: it sinks into the land.
      if (this.state === W.RELEASE) body.rise = 1 - 0.75 * this.settle;
      writeAlive(body, st, chunks, 0, 1, this.glow);
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
        const i = k === 2 ? 1 : 5;
        jx[k] = body.sx[i]; jy[k] = body.sy[i] + WARDEN_SHAPE.hip * 0.42 * (1 - 0.75 * W0.settle); jz[k] = body.sz[i];
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
        const sp = Math.abs(want) > 0.5 ? 0.6 : dist > 18 ? WARDEN_SHAPE.maxSpeed : 0;
        body.wantVx = dx / dist * sp; body.wantVz = dz / dist * sp;
        body.crouch += (0 - body.crouch) * Math.min(1, dt);
        // Near a front foot? Stomp.
        for (let l = 0; l < 2; l++) {
          if (Math.hypot(W0.px - body.fx[l], W0.pz - body.fz[l]) < 7 && W0.t > 3) { W0.state = W.STOMP; W0.t = 0; W0.stompLeg = l; }
        }
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
          if (d < 6) { W0.hits++; W0.hitDamage += 35 * (1 - d / 8); }
          W0.shake += 0.05 * Math.max(0, 1 - d / 60);
        }
        if (W0.t >= 2.6) { W0.state = W.AWAKE; W0.t = 0; W0.glow = 0; }
        break;
      }
      case W.KNEEL:
        // A joint broke: it buckles to its knees, then rises again.
        body.wantVx = 0; body.wantVz = 0; W0.glow += (0 - W0.glow) * Math.min(1, dt * 2);
        body.crouch += ((W0.t < 4 ? 0.85 : 0) - body.crouch) * Math.min(1, dt * (W0.t < 4 ? 2.5 : 0.8));
        if (W0.t >= 6) { W0.state = W.AWAKE; W0.t = 0; }
        break;
      case W.RELEASE:
        // Released: it lowers itself, then settles into the land over several seconds.
        body.wantVx = 0; body.wantVz = 0;
        body.crouch += (1 - body.crouch) * Math.min(1, dt * 0.6);
        W0.settle = Math.min(1, Math.max(0, (W0.t - 3) / 9));
        W0.restore = Math.min(1, Math.max(0, (W0.t - 4) / 10));
        // The stillness leaves it: light runs along its fractures, brightest as it exhales.
        W0.glow = W0.t < 3 ? (W0.t / 3) * (W0.t / 3) : Math.max(0, 1 - (W0.t - 3) / 2.5);
        // The exhale (t = 3): a wave of wind and powder rolls out across the steppe.
        W0.gust = W0.t < 3 ? 0 : Math.max(0, 1 - (W0.t - 3) / 7) * Math.min(1, (W0.t - 3) * 3);
        if (W0.t >= 3 && W0.t < 6.2) {
          W0.wave = (W0.t - 3) * 16;
          const R = W0.wave + WARDEN_SHAPE.hip * 1.2, cx = body.sx[3], cz = body.sz[3];
          for (let q = 0; q < 8; q++) {
            const a = rnd() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            fx.ex = cx + ca * R * 1.35; fx.ez = cz + sa * R;
            ground.qx = fx.ex; ground.qz = fx.ez; ground.sample();
            // A rolling front: low, ground-hugging, carried out nearly at the wave's speed.
            fx.ey = ground.h + 0.2 + rnd() * 0.8;
            const v = 11 + 6 * rnd();
            fx.evx = ca * v * 1.35; fx.evz = sa * v; fx.evy = 0.4 + 1.6 * rnd();
            fx.esize = 1.0 + 1.4 * rnd();
            fx.emit();
          }
          if (W0.t - dt < 3) W0.shake += 0.08;
        } else if (W0.t >= 6.2) W0.wave = -1;
        if (W0.t >= 3 && W0.t - dt < 3) {
          // The mass it leaves: a long, high drift where it lay down (heals like any snow).
          ts.bx = body.sx[3]; ts.bz = body.sz[3]; ts.bdx = Math.sin(body.heading); ts.bdz = Math.cos(body.heading);
          ts.bl = WARDEN_SHAPE.spacing * 3; ts.bw = WARDEN_SHAPE.hip * 0.7; ts.bd = 2.2; ts.bc = 0.3;
          ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
          ts.stamp();
        }
        if (W0.settle >= 1) { W0.active = false; W0.gust = 0; }
        break;
    }
  }

  return self;
}
