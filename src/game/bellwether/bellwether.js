// The Bellwether (PLAN: the village on the hill, M9; docs/village/plan-manor-boss.md): the meadow
// Warden is the manor. Only its NECK and HEAD are a live chunk body here (the rest is the building:
// the hall its ribcage, the chimney stacks its vents, the towers its spine). The neck lies coiled in
// the ruined west wing, rears out of it on waking and answers the fight director's calls. A few
// static chunks along the hall's roof ridge breathe with it so the house reads as a body.
//
// Built of the Shaped meadow materials (turf, drystone, root, amber pod cores for the eyes and the
// valves), 15 neck joints on a procedural spine, a rigid head with a jaw and two curled horns.
// Allocation-free per frame.

import { CHUNK, CHUNK_FLOATS } from '../shaped/rig.js';
import { manorWorld, MANOR, FACING } from '../../world/manor.js';
import { SFX } from '../../audio/sfx.js';

export const B = { DORMANT: 0, WAKE: 1, IDLE: 2, INHALE: 3, EXHALE: 4, SHAKE: 5, ROAR: 6, RELEASE: 7, RESTED: 8 };
/** Seconds each timed state runs (WAKE → IDLE, EXHALE → IDLE, ...; INHALE holds until exhale()). */
export const BELL_T = { wake: 5, inhale: 3, exhale: 2.5, shake: 2, roar: 2.5, releaseExhale: 4.5, releaseLower: 7 };

export const NECK_SEGS = 15;
export const SEG_LEN = 3.6;                 // neck length 54 m
export const NECK_R0 = 6, NECK_R1 = 3;  // radius at the base and under the head
export const VALVES = 3;
export const BELL_NBR = 16;
/** Chunk budget (the view draws every slot). */
export const BELL_MAX = 600;
/** Valve places on the neck: joint-parameter s and angle round it (0 = along the top). */
export const VALVE_S = [2.2, 7.5, 12.8], VALVE_TH = [1.2, -1.2, 1.2];
/** The head is the unit design below at this scale (12 m long, 5 m deep). */
const HS = 1.75;

/** The resting heading (manor frame): the neck lies across the wing's front toward the forecourt, the head on it. */
const REAR_T0 = 0.88, REAR_K1 = 1.5, REAR_K2 = 2.05;
const RESTED_YAW = -0.4;
const NECK_BASE = { u: 44, f: -20 };       // manor frame: the west wing's open end (13 m from tower 4's axis)
const RIDGE_ON = false;
const RIDGE = { u0: -30, u1: 30, f: -26 - 13, y: 30 };   // the hall's roof ridge (manor frame, y above MANOR.y)

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ease = (k) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
/** Neck radius at joint parameter s (0..NECK_SEGS). */
export function neckRadius(s) { return NECK_R0 - (NECK_R0 - NECK_R1) * Math.pow(clamp(s / NECK_SEGS, 0, 1), 0.85); }

// Pose parameters (smoothed toward per-state targets).
const P_REAR = 0, P_DRAW = 1, P_THRUST = 2, P_LIE = 3, P_SINK = 4, P_SWAY = 5, P_MOUTH = 6, P_GLOW = 7, P_ROARUP = 8, P_LOOK = 9, P_SWELL = 10, NP = 11;
const RATE = new Float64Array([1.6, 3, 6, 2, 1.5, 1.5, 5, 3, 3, 3, 3]);

/**
 * @param {{ ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createBellwether(ctx) {
  const ground = ctx.ground;
  const N = NECK_SEGS;
  // Manor frame → world: origin and the world directions of u (right) and f (toward the stair).
  const o0 = manorWorld(0, 0), eu0 = manorWorld(1, 0), ef0 = manorWorld(0, 1);
  const OX = o0[0], OZ = o0[1], EUX = eu0[0] - OX, EUZ = eu0[1] - OZ, EFX = ef0[0] - OX, EFZ = ef0[1] - OZ;
  ground.qx = OX; ground.qz = OZ; ground.sample();
  const FLOOR = Math.max(MANOR.y + 0.25, ground.h + 0.05);

  // ---------------------------------------------------------------- chunk layout
  const rnd = mulberry(9091);
  const kinds = [], seeds = [];
  let count = 0;
  const reg = (kind) => { kinds.push(kind); seeds.push(rnd() * 1000); return count++; };

  // Neck chunks: s (joint parameter), the angle round the neck, ρ (fraction of the radius),
  // sizes (tangent, radial: fractions of the radius; along: metres), hang (roots).
  const nIdx = [], nS = [], nA = [], nRho = [], nSx = [], nSy = [], nSz = [], nHang = [];
  const neck = (s, a, rho, sx, sy, sz, kind, hang = 0) => { nIdx.push(reg(kind)); nS.push(s); nA.push(a); nRho.push(rho); nSx.push(sx); nSy.push(sy); nSz.push(sz); nHang.push(hang); };
  for (let i = 0; i < N; i++) {
    const s = i + 0.5, tw = (i & 1) * 0.5;
    // Overlapping flat scales round the neck: turf over the top half, stone below and on the flanks.
    for (let k = 0; k < 10; k++) {
      const a = ((k + tw + (rnd() - 0.5) * 0.2) / 10) * Math.PI * 2;
      const top = Math.cos(a) > -0.1;
      neck(s + (rnd() - 0.5) * 0.3, a, 0.78, 1.2 + 0.1 * rnd(), 0.55 + 0.05 * rnd(), SEG_LEN * (1.35 + 0.15 * rnd()), top && rnd() < 0.92 ? CHUNK.TURF : CHUNK.STONE);
    }
    neck(s, 0, 0, 1.7, 1.7, SEG_LEN * 1.4, CHUNK.STONE);
    // A mane of turf mats down the back, stone plates along the flanks.
    for (const a of [0, -0.65, 0.65]) neck(s + (a === 0 ? 0.15 : -0.1), a, 0.95, 1.25, 0.4, SEG_LEN * 1.5, CHUNK.TURF);
    for (const sg of [-1, 1]) neck(s + sg * 0.12, sg * (1.5 + 0.1 * rnd()), 0.97, 1.2, 0.38, SEG_LEN * 1.25, CHUNK.STONE);
    for (const sg of [-1, 1]) neck(s + (rnd() - 0.5) * 0.4, sg * (2.3 + 0.5 * rnd()), 0.95, 0.24, 0.5 + 0.3 * rnd(), 0.24, CHUNK.ROOT, 1);
  }
  for (let k = 0; k < 8; k++) neck(0.1, (k / 8) * Math.PI * 2 + 0.3, 0.9, 1.3, 0.9, 4.2, CHUNK.STONE);   // the collar where it leaves the floor
  const nCount = nIdx.length;

  // Head chunks in the head frame (x right, y up, z forward): position, size, local forward and
  // up, whether the jaw carries it, kind, glow mode (0 none, 1 eye).
  const hIdx = [], hP = [], hS = [], hF = [], hU = [], hJaw = [], hGlow = [];
  const head = (kind, px, py, pz, sx, sy, sz, jaw = 0, glow = 0, f = [0, 0, 1], u = [0, 1, 0]) => {
    hIdx.push(reg(kind)); hP.push(px * HS, py * HS, pz * HS); hS.push(sx * HS, sy * HS, sz * HS); hF.push(f[0], f[1], f[2]); hU.push(u[0], u[1], u[2]); hJaw.push(jaw); hGlow.push(glow);
  };
  const S = CHUNK.STONE, T = CHUNK.TURF, R = CHUNK.ROOT;
  head(S, 0, 0.2, 1.2, 3.0, 2.7, 3.2);                 // skull
  head(T, 0, 1.2, 0.9, 3.0, 0.9, 3.4);                // turf crown
  head(T, 0, 1.15, 2.6, 2.5, 0.8, 2.6);                // turf over the brow
  head(T, 0, 0.95, -0.2, 2.6, 0.8, 2.4);               // turf on the nape
  head(S, 0, 0.1, -0.4, 2.2, 2.2, 2.0);                // nape, into the neck
  for (const sd of [-1, 1]) {
    head(S, sd * 1.0, 0.95, 2.0, 1.3, 0.9, 1.6);       // brow ridge
    head(S, sd * 1.25, -0.2, 1.3, 1.3, 1.7, 2.1);      // cheek
    head(R, sd * 1.3, 0.4, 1.85, 0.7, 0.8, 1.1);       // eye socket (a dark recess under the brow)
    head(CHUNK.POD, sd * 1.38, 0.4, 1.9, 0.25, 0.4, 0.7, 0, 1);    // eye: a faint slit of amber in it
    head(S, sd * 1.5, 1.0, 0.3, 0.9, 0.5, 1.4, 0, 0, [0, 0.2, -1], [0, 1, 0.2]);   // ear plate
    head(R, sd * 0.45, 0.1, 6.7, 0.55, 0.3, 0.5);      // nostril (a dark slit)
  }
  head(S, 0, -0.1, 3.3, 2.0, 1.7, 3.0);                // snout
  head(S, 0, -0.2, 4.9, 1.7, 1.4, 2.6);
  head(S, 0, -0.35, 6.1, 1.6, 1.2, 1.8);               // muzzle
  head(T, 0, 0.8, 3.7, 2.0, 0.55, 3.4);                // turf over the nose
  head(T, 0, 0.55, 5.4, 1.7, 0.5, 2.4);
  head(S, 0, -0.85, 4.8, 1.4, 0.35, 3.3);              // upper palate
  head(R, 0, -0.55, 3.4, 1.3, 0.5, 4.3);               // the dark mouth
  head(S, 0, -1.0, 2.7, 1.55, 0.85, 3.8, 1);           // lower jaw
  head(S, 0, -1.0, 4.7, 1.3, 0.75, 3.0, 1);
  head(T, 0, -1.0, 6.0, 1.2, 0.7, 1.4, 1);             // chin
  head(R, 0, -0.65, 3.7, 0.85, 0.4, 3.0, 1);           // tongue
  for (let k = 0; k < 4; k++) head(R, (k - 1.5) * 0.5, -1.25, 2.8 + k * 1.3, 0.4, 0.6 + 0.3 * (k & 1), 0.4, 1);   // short thick roots from the jaw
  // Horns: a curl in a plane (a ram's), stone, tapering.
  for (const sd of [-1, 1]) {
    let e1 = [0.6 * sd, 0.2, -0.75]; let l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
    let e2 = [-0.3 * sd, -1, 0.1]; const d12 = e2[0] * e1[0] + e2[1] * e1[1] + e2[2] * e1[2]; e2 = e2.map((v, q) => v - e1[q] * d12); const l2 = Math.hypot(...e2); e2 = e2.map((v) => v / l2);
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const rho = 1.15, p0 = [sd * 1.2, 1.0, 0.9], HN = 10;
    for (let q = 0; q < HN; q++) {
      const phi = ((q + 0.5) / HN) * Math.PI * 1.5, tw = 1 - 0.65 * (q / HN);
      const pp = [0, 0, 0], tg = [0, 0, 0];
      for (let c = 0; c < 3; c++) { pp[c] = p0[c] + rho * (Math.sin(phi) * e1[c] + (1 - Math.cos(phi)) * e2[c]); tg[c] = Math.cos(phi) * e1[c] + Math.sin(phi) * e2[c]; }
      head(S, pp[0], pp[1], pp[2], 1.35 * tw, 1.25 * tw, rho * (Math.PI * 1.5 / HN) * 1.6, 0, 0, tg, nrm);
    }
  }
  const hCount = hIdx.length;

  // Valves: a pod core and four stone plates on the neck surface.
  const vIdx = [];
  for (let k = 0; k < VALVES; k++) { const row = [reg(CHUNK.POD)]; for (let q = 0; q < 4; q++) row.push(reg(CHUNK.STONE)); vIdx.push(row); }

  // The back: a turf-and-stone spine ridge along the hall roof ridge, breathing.
  const bIdx = [], bU = [], bF = [], bY = [], bS = [];
  // A low broad hump of overlapping turf mats with stone plates on its shoulders.
  // (Dropped: it did not read as a smooth hump from the ground; the loop is kept for when the ridge height is known.)
  if (RIDGE_ON) for (let u = RIDGE.u0; u <= RIDGE.u1 + 0.01; u += 3) {
    const hump = 1.4 * Math.cos((u / 30) * Math.PI * 0.5), j = (rnd() - 0.5) * 0.8;
    bIdx.push(reg(CHUNK.TURF)); bU.push(u); bF.push(RIDGE.f + j); bY.push(RIDGE.y + hump + 0.4); bS.push(6.5, 2.6, 8);
    for (const sg of [-1, 1]) { bIdx.push(reg(CHUNK.STONE)); bU.push(u + 0.8 * sg); bF.push(RIDGE.f + sg * (2.4 + rnd() * 0.6)); bY.push(RIDGE.y + hump * 0.8 - 0.1); bS.push(4.6, 2.2, 4); }
  }
  const bCount = bIdx.length;
  const CH = count;
  if (CH > BELL_MAX) throw new Error('Bellwether over its chunk budget: ' + CH);

  const chunks = new Float32Array(CH * CHUNK_FLOATS);
  const nbr = new Uint32Array(CH * BELL_NBR);
  const nbrGap = new Float64Array(BELL_NBR);

  // ---------------------------------------------------------------- skeleton (world)
  const jx = new Float64Array(N + 1), jy = new Float64Array(N + 1), jz = new Float64Array(N + 1);     // joints
  const tX = new Float64Array(N + 1), tY = new Float64Array(N + 1), tZ = new Float64Array(N + 1);     // tangent (toward the head)
  const uX = new Float64Array(N + 1), uY = new Float64Array(N + 1), uZ = new Float64Array(N + 1);     // up (dorsal)
  const rX = new Float64Array(N + 1), rY = new Float64Array(N + 1), rZ = new Float64Array(N + 1);     // right (up × tangent)
  // Manor-frame scratch.
  const mx_ = new Float64Array(N + 1), my_ = new Float64Array(N + 1), mz_ = new Float64Array(N + 1);
  const dirX = new Float64Array(N), dirY = new Float64Array(N), dirZ = new Float64Array(N), psi = new Float64Array(N + 1);
  const V = new Float64Array(NP), TG = new Float64Array(NP);
  const valveOpenAmt = new Float64Array(VALVES);
  const vSurf = new Float64Array(3);      // scratch for valve surface evals

  const self = {
    chunks, nbr, nbrDirty: false, nbrReady: false,
    count: CH, neckCount: nCount, headCount: hCount, backCount: bCount,
    /** Always true once created (the dormant body is a thing in the world); the view is culled by distance. */
    active: true,
    state: B.DORMANT, t: 0, time: 0, dt: 0.016,
    /** 0..1 thrash of a SHAKE (the climb drains focus by it). */
    shaking: 0,
    /** Set by the climb while the Wraith grips the neck. */
    climbed: false,
    /** Roof creak 0..1 while waking (for audio / dust). */
    creak: 0,
    /** Head centre; mouth tip and its forward direction (horizontal, plus the vertical component). */
    hx: 0.5, hy: 0.5, hz: 0.5, hfx: 0, hfy: 0, hfz: 1,
    mx: 0.5, my: 0.5, mz: 0.5, mdx: 0, mdz: 1, mdy: 0,
    /** Valves on the neck surface (move with the pose). */
    valves: { n: VALVES, x: new Float64Array(VALVES), y: new Float64Array(VALVES), z: new Float64Array(VALVES), open: new Uint8Array(VALVES) },
    /** What the head looks at (the Wraith). */
    targetX: 0.5, targetY: 0.5, targetZ: 0.5,
    /** The exhale sweeps from one world heading to the other (atan2(dx, dz)). */
    exhaleFrom: FACING - 0.7, exhaleTo: FACING + 0.7,
    floorY: FLOOR, base: { x: 0, y: 0, z: 0 },
    /** Neck surface for the climb: neckEval(s, th, bump) fills sp (point), sn (outward normal), st (toward the head), sc (centre). */
    sp: new Float64Array(3), sn: new Float64Array(3), st: new Float64Array(3), sc: new Float64Array(3),
    sfx: null,
    yaw: 0,
    /** Smoothed pose parameters (for tests / debug). */
    pose: V,
    CH,

    wake() { if (this.state === B.DORMANT) { go(B.WAKE); if (this.sfx) sfxAt(SFX.RUMBLE, 1.4); } },
    inhale() { if (awake()) go(B.INHALE); },
    exhale() { if (this.state === B.INHALE || this.state === B.IDLE || this.state === B.ROAR) { go(B.EXHALE); if (this.sfx) sfxAt(SFX.BOOM, 1.0); } },
    shake() { if (awake()) go(B.SHAKE); },
    roar() { if (awake()) { go(B.ROAR); if (this.sfx) sfxAt(SFX.RUMBLE, 1.6); } },
    release() { if (awake() && this.state !== B.RELEASE) { go(B.RELEASE); if (this.sfx) sfxAt(SFX.RUMBLE, 1.6); } },
    /** Back to DORMANT instantly (no easing). */
    reset() {
      this.state = B.DORMANT; this.t = 0; this.shaking = 0; this.climbed = false; this.creak = 0;
      this.valves.open.fill(0); valveOpenAmt.fill(0);
      targets(); V.set(TG); this.yaw = 0; hdt = 0; this.pose = V;
      hfx = 0; hfy = 0; hfz = 1; hInit = false;
      this.update(0, this.time);
    },
    /** Dev/captures: skip the wake and stand idle. */
    forceIdle() {
      this.state = B.IDLE; this.t = 0; targets(); V.set(TG); hInit = false;
      this.update(0, this.time);
    },
    openValve(k) { if (k >= 0 && k < VALVES && !this.valves.open[k]) { this.valves.open[k] = 1; if (this.sfx) sfxAt(SFX.CRUNCH, 1.4); } },
    get valvesOpen() { let n = 0; for (let k = 0; k < VALVES; k++) n += this.valves.open[k]; return n; },
    get awake() { return awake(); },
    /** Whether the INHALE telegraph has run its course. */
    get inhaled() { return this.state === B.INHALE && this.t >= BELL_T.inhale; },

    /** Point (sp), outward normal (sn), tangent toward the head (st) and axis centre (sc) at (s, th) on the neck; bump = metres off the smooth tube. */
    neckEval(s, th, bump) {
      s = clamp(s, 0, N);
      const i = Math.min(N - 1, Math.floor(s)), f = s - i, g = 1 - f;
      const cx = jx[i] * g + jx[i + 1] * f, cy = jy[i] * g + jy[i + 1] * f, cz = jz[i] * g + jz[i + 1] * f;
      const ux = uX[i] * g + uX[i + 1] * f, uy = uY[i] * g + uY[i + 1] * f, uz = uZ[i] * g + uZ[i + 1] * f;
      const rx = rX[i] * g + rX[i + 1] * f, ry = rY[i] * g + rY[i + 1] * f, rz = rZ[i] * g + rZ[i + 1] * f;
      let tx = tX[i] * g + tX[i + 1] * f, ty = tY[i] * g + tY[i + 1] * f, tz = tZ[i] * g + tZ[i + 1] * f;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const ct = Math.cos(th), st = Math.sin(th);
      let nx = ux * ct + rx * st, ny = uy * ct + ry * st, nz = uz * ct + rz * st;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const rr = neckRadius(s) * (1 + 0.1 * V[P_SWELL] * (1 - 0.5 * s / N)) + bump;
      this.sc[0] = cx; this.sc[1] = cy; this.sc[2] = cz;
      this.sn[0] = nx; this.sn[1] = ny; this.sn[2] = nz;
      this.st[0] = tx; this.st[1] = ty; this.st[2] = tz;
      this.sp[0] = cx + nx * rr; this.sp[1] = cy + ny * rr; this.sp[2] = cz + nz * rr;
    },

    // ---- ray / point tests (like the Warden's)
    rox: 0.5, roy: 0.5, roz: 0.5, rdx: 0.5, rdy: 0.5, rdz: 0.5, rnear: 1e9, rfar: 1e9,
    /** Ray out through the mass (origin inside it, unit direction): distance to where it leaves the outermost chunk, or -1. */
    rayOut() {
      const ox = this.rox, oy = this.roy, oz = this.roz, dx = this.rdx, dy = this.rdy, dz = this.rdz;
      let best = -1;
      for (let c = 0; c < CH; c++) {
        const o = c * CHUNK_FLOATS;
        if (chunks[o + 15] < 0.5 || kinds[c] === CHUNK.ROOT) continue;
        const px = ox - chunks[o], py = oy - chunks[o + 1], pz = oz - chunks[o + 2];
        const big = Math.max(chunks[o + 3], chunks[o + 7], chunks[o + 11]) * 0.6;
        const tc = -(px * dx + py * dy + pz * dz);
        const qx = px + dx * tc, qy = py + dy * tc, qz = pz + dz * tc;
        if (qx * qx + qy * qy + qz * qz > big * big) continue;
        const fx = chunks[o + 4], fy = chunks[o + 5], fz = chunks[o + 6], ux = chunks[o + 8], uy = chunks[o + 9], uz = chunks[o + 10];
        const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
        const sx = chunks[o + 3] * 0.43, sy = chunks[o + 7] * 0.43, sz = chunks[o + 11] * 0.43;
        const a0 = (px * rx + py * ry + pz * rz) / sx, a1 = (px * ux + py * uy + pz * uz) / sy, a2 = (px * fx + py * fy + pz * fz) / sz;
        const b0 = (dx * rx + dy * ry + dz * rz) / sx, b1 = (dx * ux + dy * uy + dz * uz) / sy, b2 = (dx * fx + dy * fy + dz * fz) / sz;
        const A = b0 * b0 + b1 * b1 + b2 * b2, Bq = a0 * b0 + a1 * b1 + a2 * b2, C = a0 * a0 + a1 * a1 + a2 * a2 - 1;
        const disc = Bq * Bq - A * C;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc), tIn = (-Bq - sq) / A, t = (-Bq + sq) / A;
        if (tIn > this.rnear || t > this.rfar) continue;
        if (t > best) best = t;
      }
      return best;
    },
    qx: 0.5, qy: 0.5, qz: 0.5,
    /** Camera probe (fields in): is (qx, qy, qz) inside the neck or head, with a little clearance? */
    probe() {
      const x = this.qx, y = this.qy, z = this.qz;
      // Cheap reject: the neck and head fit in a 115 m sphere about the base.
      const bx = x - this.base.x, by = y - this.base.y, bz = z - this.base.z;
      if (bx * bx + by * by + bz * bz > 115 * 115) return false;
      for (let c = 0; c < nCount + hCount; c++) {
        const o = (c < nCount ? nIdx[c] : hIdx[c - nCount]) * CHUNK_FLOATS;
        if (chunks[o + 15] < 0.5 || chunks[o + 13] === CHUNK.ROOT) continue;
        const dx = x - chunks[o], dy = y - chunks[o + 1], dz = z - chunks[o + 2];
        const fx = chunks[o + 4], fy = chunks[o + 5], fz = chunks[o + 6], ux = chunks[o + 8], uy = chunks[o + 9], uz = chunks[o + 10];
        const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
        const sx = chunks[o + 3] * 0.5 + 0.6, sy = chunks[o + 7] * 0.5 + 0.6, sz = chunks[o + 11] * 0.5 + 0.6;
        const qa = (dx * rx + dy * ry + dz * rz) / sx, qb = (dx * ux + dy * uy + dz * uz) / sy, qc = (dx * fx + dy * fy + dz * fz) / sz;
        if (qa * qa + qb * qb + qc * qc < 1) return true;
      }
      return false;
    },

    update(dt, t) {
      this.dt = dt;
      if (dt > 0) this.time += dt;
      this.t += dt;
      step(dt);
      pose();
      writeChunks();
      if (!this.nbrReady) { neighbours(); this.nbrReady = true; this.nbrDirty = true; }
    },
  };

  // Head smoothing state.
  let hfx = 0, hfy = 0, hfz = 1, hInit = false, hdt = 0;
  let mouthAng = 0, headPitch = 0, creakPhase = 0;

  function awake() { return self.state !== B.DORMANT && self.state !== B.WAKE; }
  function go(st) { self.state = st; self.t = 0; }
  function sfxAt(kind, gain) {
    const s = self.sfx; if (!s) return;
    s.x = self.hx; s.y = self.hy; s.z = self.hz; s.gain = gain; s.play(kind);
  }
  /** Manor-frame heading (atan2(u, f)) of a world heading (atan2(x, z)). */
  function toManor(h) { const dx = Math.sin(h), dz = Math.cos(h); return Math.atan2(dx * EUX + dz * EUZ, dx * EFX + dz * EFZ); }

  /** Per-state pose targets into TG. */
  function targets() {
    const st = self.state;
    TG.fill(0);
    switch (st) {
      case B.DORMANT: TG[P_LIE] = 1; TG[P_SINK] = 1; TG[P_SWAY] = 0.04; break;
      case B.WAKE: TG[P_REAR] = 1; TG[P_GLOW] = 0.5; break;
      case B.IDLE: TG[P_REAR] = 1; TG[P_SWAY] = 1; TG[P_GLOW] = 0.55; TG[P_LOOK] = 1; break;
      case B.INHALE: TG[P_REAR] = 1; TG[P_SWAY] = 0.35; TG[P_GLOW] = 0.9; TG[P_LOOK] = 1; TG[P_MOUTH] = 0.15; TG[P_DRAW] = 1; TG[P_SWELL] = 1; break;
      case B.EXHALE: TG[P_REAR] = 0.75; TG[P_THRUST] = 1; TG[P_MOUTH] = 1; TG[P_GLOW] = 1; TG[P_LOOK] = 0.2; break;
      case B.SHAKE: TG[P_REAR] = 1; TG[P_GLOW] = 0.8; TG[P_MOUTH] = 0.3; TG[P_SWAY] = 0.3; break;
      case B.ROAR: TG[P_REAR] = 1; TG[P_DRAW] = 0.5; TG[P_ROARUP] = 1; TG[P_MOUTH] = 1; TG[P_GLOW] = 1; TG[P_SWAY] = 0.4; TG[P_LOOK] = 0.3; break;
      case B.RELEASE: TG[P_REAR] = 0.75; TG[P_THRUST] = 1; TG[P_MOUTH] = 1; TG[P_GLOW] = 0.9; break;   // the long exhale; the lowering below
      case B.RESTED: TG[P_REAR] = 0; TG[P_THRUST] = 0.35; TG[P_SWAY] = 0.12; TG[P_GLOW] = 0.04; break;
    }
  }

  /** Advance the state machine and the pose parameters. */
  function step(dt) {
    const st = self.state, t = self.t;
    targets();
    let yawT = self.yaw, yawRate = 1;
    // The heading from the base to the Wraith (manor frame).
    const hbx = self.targetX - self.base.x, hbz = self.targetZ - self.base.z;
    const toT = Math.atan2(hbx * EUX + hbz * EUZ, hbx * EFX + hbz * EFZ);
    switch (st) {
      case B.DORMANT: yawT = 0; yawRate = 2; break;
      case B.WAKE: yawT = 0; yawRate = 1; break;
      case B.IDLE: case B.ROAR: yawT = clamp(toT, -0.5, 0.5); yawRate = 0.9; break;
      case B.INHALE: yawT = toManor(self.exhaleFrom); yawRate = 2.2; break;
      case B.SHAKE: yawT = self.yaw; break;
      case B.RESTED: yawT = RESTED_YAW; yawRate = 1.2; break;
      default: break;
    }
    // Smooth the parameters toward their targets.
    for (let k = 0; k < NP; k++) V[k] += (TG[k] - V[k]) * (1 - Math.exp(-RATE[k] * dt));
    self.shaking = 0; self.creak = 0;

    if (st === B.WAKE) {
      // Rears up over ~5 s; the roofs creak.
      V[P_REAR] = ease(t / BELL_T.wake);
      V[P_LIE] = 1 - ease(t / 3.5);
      V[P_SINK] = 1 - ease(t / 2.2);
      V[P_SWAY] = ease((t - 3) / 2);
      V[P_GLOW] = 0.55 * ease(t / BELL_T.wake);
      V[P_LOOK] = ease((t - 3.5) / 1.5);
      self.creak = ease(t / 1.2) * (1 - ease((t - 4) / 1)) * (0.7 + 0.3 * Math.sin(t * 7));
      if (t >= BELL_T.wake) go(B.IDLE);
    } else if (st === B.INHALE) {
      V[P_DRAW] = ease(t / BELL_T.inhale); V[P_SWELL] = V[P_DRAW];
      // Held until exhale(); a long unanswered breath lets go.
      if (t > BELL_T.inhale + 6) go(B.IDLE);
    } else if (st === B.EXHALE) {
      const e = ease(t / BELL_T.exhale);
      const a = toManor(self.exhaleFrom), b = toManor(self.exhaleTo);
      self.yaw = a + wrapPi(b - a) * e; yawT = self.yaw;
      V[P_DRAW] *= Math.exp(-dt * 10); V[P_SWELL] *= Math.exp(-dt * 6);
      if (t >= BELL_T.exhale) go(B.IDLE);
    } else if (st === B.SHAKE) {
      const env = clamp(Math.min(t / 0.2, (BELL_T.shake - t) / 0.4), 0, 1);
      self.shaking = env;
      if (t >= BELL_T.shake) go(B.IDLE);
    } else if (st === B.ROAR) {
      if (t >= BELL_T.roar) go(B.IDLE);
    } else if (st === B.RELEASE) {
      if (t < BELL_T.releaseExhale) {
        const e = ease(t / BELL_T.releaseExhale);
        const a = toManor(self.exhaleFrom), b = toManor(self.exhaleTo);
        self.yaw = a + wrapPi(b - a) * e; yawT = self.yaw;
        V[P_DRAW] *= Math.exp(-dt * 8); V[P_SWELL] *= Math.exp(-dt * 4);
      } else {
        // Lowers the head to the forecourt and rests: the neck unspools along the ground.
        const k = ease((t - BELL_T.releaseExhale) / BELL_T.releaseLower);
        V[P_REAR] = 0.75 * (1 - k); V[P_THRUST] = 1 - 0.65 * k; V[P_MOUTH] = 1 - k; V[P_GLOW] = 0.9 - 0.86 * k;
        V[P_SWELL] = 0; V[P_DRAW] = 0; V[P_SWAY] = 0.12 * k;
        yawT = RESTED_YAW; yawRate = 0.8;
        if (t >= BELL_T.releaseExhale + BELL_T.releaseLower) go(B.RESTED);
      }
    }
    if (st !== B.EXHALE && !(st === B.RELEASE && t < BELL_T.releaseExhale)) self.yaw += wrapPi(yawT - self.yaw) * (1 - Math.exp(-yawRate * dt));
  }

  /** Forward kinematics of the neck (manor frame), then frames and the head, in the world. */
  function pose() {
    const time = self.time, rear = V[P_REAR], draw = V[P_DRAW], thrust = V[P_THRUST], lie = V[P_LIE], sink = V[P_SINK], sway = V[P_SWAY], roarUp = V[P_ROARUP];
    const env = self.shaking;
    // Base.
    mx_[0] = NECK_BASE.u; mz_[0] = NECK_BASE.f;
    const fl0 = FLOOR - MANOR.y;       // floor height above MANOR.y
    my_[0] = fl0 + NECK_R0 * (0.3 - 1.5 * sink);
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N;
      // Dormant: back into the wing, then coiling round on itself.
      const dorm = Math.PI + Math.max(0, i - 5) * 0.42;
      let p = self.yaw + lie * dorm + sway * 0.1 * Math.sin(time * 0.55 - i * 0.33) * (0.25 + s);
      // Reared: leans out ~50 deg at the base, bulges upright mid-neck, the head hangs forward (an S).
      let th = rear * (REAR_T0 + REAR_K1 * s - REAR_K2 * s * s) + (1 - rear) * (0.04 - 0.05 * s) + lie * 0.04 * Math.max(0, i - 5)
        + draw * (0.2 + 0.2 * s) - thrust * (0.35 + 0.9 * s) + sway * 0.035 * Math.sin(time * 0.9 - i * 0.3) + roarUp * 0.45 * s * s;
      if (env > 0) { p += env * 0.5 * Math.sin(time * 10.5 - i * 0.55) * (0.2 + 0.8 * s); th += env * 0.22 * Math.sin(time * 9 - i * 0.45 + 1); }
      const c = Math.cos(th);
      const nx = mx_[i] + c * Math.sin(p) * SEG_LEN, nz = mz_[i] + c * Math.cos(p) * SEG_LEN;
      let ny = my_[i] + Math.sin(th) * SEG_LEN;
      const miny = fl0 + neckRadius(i + 1) * (0.55 - 1.15 * sink);
      if (ny < miny) ny = miny;
      mx_[i + 1] = nx; my_[i + 1] = ny; mz_[i + 1] = nz;
    }
    // Segment directions, joint headings.
    for (let i = 0; i < N; i++) {
      let dx = mx_[i + 1] - mx_[i], dy = my_[i + 1] - my_[i], dz = mz_[i + 1] - mz_[i];
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      dirX[i] = dx; dirY[i] = dy; dirZ[i] = dz;
    }
    let lastPsi = self.yaw;
    for (let j = 0; j <= N; j++) {
      // Tangent at the joint: the mean of the two segments.
      const a = j > 0 ? j - 1 : 0, b = j < N ? j : N - 1;
      let tx = dirX[a] + dirX[b], ty = dirY[a] + dirY[b], tz = dirZ[a] + dirZ[b];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (Math.hypot(tx, tz) > 0.02) lastPsi = Math.atan2(tx, tz);
      psi[j] = lastPsi;
      // Up = tangent × horizontal-right-of-heading (manor frame, x = u, z = f); right = up × tangent.
      const rhx = Math.cos(lastPsi), rhz = -Math.sin(lastPsi);
      let ux = ty * rhz, uy = tz * rhx - tx * rhz, uz = -ty * rhx;   // t × (rhx, 0, rhz)
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const rx = uy * tz - uz * ty, ry = uz * tx - ux * tz, rz = ux * ty - uy * tx;
      // To the world.
      const u0 = mx_[j], f0 = mz_[j];
      jx[j] = OX + u0 * EUX + f0 * EFX; jy[j] = MANOR.y + my_[j]; jz[j] = OZ + u0 * EUZ + f0 * EFZ;
      tX[j] = tx * EUX + tz * EFX; tY[j] = ty; tZ[j] = tx * EUZ + tz * EFZ;
      uX[j] = ux * EUX + uz * EFX; uY[j] = uy; uZ[j] = ux * EUZ + uz * EFZ;
      rX[j] = rx * EUX + rz * EFX; rY[j] = ry; rZ[j] = rx * EUZ + rz * EFZ;
    }
    self.base.x = jx[0]; self.base.y = jy[0]; self.base.z = jz[0];
  }

  // Scratch for the head frame.
  let hrx = 1, hry = 0, hrz = 0, hux = 0, huy = 1, huz = 0;
  const rec = (i, x, y, z, sx, fx, fy, fz, sy, ux, uy, uz, sz, kind, glow, alpha) => {
    const o = i * CHUNK_FLOATS;
    chunks[o] = x; chunks[o + 1] = y; chunks[o + 2] = z; chunks[o + 3] = sx;
    chunks[o + 4] = fx; chunks[o + 5] = fy; chunks[o + 6] = fz; chunks[o + 7] = sy;
    chunks[o + 8] = ux; chunks[o + 9] = uy; chunks[o + 10] = uz; chunks[o + 11] = sz;
    chunks[o + 12] = seeds[i]; chunks[o + 13] = kind; chunks[o + 14] = glow; chunks[o + 15] = alpha;
  };

  function writeChunks() {
    const swell = V[P_SWELL], dt = self.dt;
    // ---- neck
    for (let c = 0; c < nCount; c++) {
      const s = clamp(nS[c], 0, N - 1e-6), i = Math.floor(s), f = s - i, g = 1 - f;
      const cx = jx[i] * g + jx[i + 1] * f, cy = jy[i] * g + jy[i + 1] * f, cz = jz[i] * g + jz[i + 1] * f;
      let tx = tX[i] * g + tX[i + 1] * f, ty = tY[i] * g + tY[i + 1] * f, tz = tZ[i] * g + tZ[i + 1] * f;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const ux = uX[i] * g + uX[i + 1] * f, uy = uY[i] * g + uY[i + 1] * f, uz = uZ[i] * g + uZ[i + 1] * f;
      const rx = rX[i] * g + rX[i + 1] * f, ry = rY[i] * g + rY[i + 1] * f, rz = rZ[i] * g + rZ[i + 1] * f;
      const rad = neckRadius(s) * (1 + 0.1 * swell * (1 - 0.5 * s / N));
      const ca = Math.cos(nA[c]), sa = Math.sin(nA[c]);
      // Radial direction (up at a = 0).
      const nx = ux * ca + rx * sa, ny = uy * ca + ry * sa, nz = uz * ca + rz * sa;
      const rho = nRho[c] * rad;
      const kind = kinds[nIdx[c]];
      if (nHang[c]) {
        // A root bundle: hangs down from the surface.
        rec(nIdx[c], cx + nx * rho, cy + ny * rho - nSy[c] * rad * 0.3, cz + nz * rho, nSx[c] * rad, tx, 0, tz, nSy[c] * rad + 0.5, 0, 1, 0, nSz[c] * rad, kind, 0, 1);
        continue;
      }
      // Frame: up = radial, forward = tangent made perpendicular to it.
      let fx = tx, fy = ty, fz = tz;
      const d = fx * nx + fy * ny + fz * nz; fx -= nx * d; fy -= ny * d; fz -= nz * d;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      rec(nIdx[c], cx + nx * rho, cy + ny * rho, cz + nz * rho, nSx[c] * rad, fx, fy, fz, nSy[c] * rad, nx, ny, nz, nSz[c], kind, 0, 1);
    }

    // ---- head frame
    const ex = jx[N], ey = jy[N], ez = jz[N];
    const hcx = ex + hfx * 4, hcy = ey + hfy * 4, hcz = ez + hfz * 4;
    // Where the head wants to point: the neck's own direction, drawn toward the Wraith by LOOK.
    let wx = tX[N], wy = tY[N], wz = tZ[N];
    const look = V[P_LOOK] * 0.8;
    if (look > 0.001) {
      let dx = self.targetX - hcx, dy = self.targetY - hcy, dz = self.targetZ - hcz;
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      wx = wx * (1 - look) + dx * look; wy = wy * (1 - look) + dy * look; wz = wz * (1 - look) + dz * look;
    }
    // Pitch: down in the thrust, up in the roar and the draw.
    const pitchT = -0.35 * V[P_THRUST] + 0.5 * V[P_ROARUP] + 0.3 * V[P_DRAW];
    {
      const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
      // Up for the pitch: world up made perpendicular.
      let px = -wx * wy, py = 1 - wy * wy, pz = -wz * wy; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
      const cp = Math.cos(pitchT), sp = Math.sin(pitchT);
      wx = wx * cp + px * sp; wy = wy * cp + py * sp; wz = wz * cp + pz * sp;
    }
    if (!hInit) { hfx = wx; hfy = wy; hfz = wz; hInit = true; }
    else { const k = Math.min(1, dt * 6); hfx += (wx - hfx) * k; hfy += (wy - hfy) * k; hfz += (wz - hfz) * k; }
    { const hl = Math.hypot(hfx, hfy, hfz) || 1; hfx /= hl; hfy /= hl; hfz /= hl; }
    // Head up (world up perpendicular to the forward), right = up × forward.
    {
      let ux = -hfx * hfy, uy = 1 - hfy * hfy, uz = -hfz * hfy; const ul = Math.hypot(ux, uy, uz);
      if (ul < 0.05) { ux = uX[N]; uy = uY[N]; uz = uZ[N]; } else { ux /= ul; uy /= ul; uz /= ul; }
      hux = ux; huy = uy; huz = uz;
      hrx = uy * hfz - uz * hfy; hry = uz * hfx - ux * hfz; hrz = ux * hfy - uy * hfx;
    }
    // Shake: the head rolls with the thrash.
    // (kept simple: the neck carries the motion)
    const mouthT = V[P_MOUTH] * 0.6;
    mouthAng += (mouthT - mouthAng) * Math.min(1, dt * 12);
    const ca = Math.cos(mouthAng), sa = Math.sin(mouthAng);
    const eye = V[P_GLOW] * (0.75 + 0.25 * Math.sin(self.time * 1.7)) * 0.9;
    self.hx = ex + hfx * 5; self.hy = ey + hfy * 5; self.hz = ez + hfz * 5;
    self.hfx = hfx; self.hfy = hfy; self.hfz = hfz;
    for (let c = 0; c < hCount; c++) {
      let px = hP[c * 3], py = hP[c * 3 + 1], pz = hP[c * 3 + 2];
      let fx = hF[c * 3], fy = hF[c * 3 + 1], fz = hF[c * 3 + 2], ux = hU[c * 3], uy = hU[c * 3 + 1], uz = hU[c * 3 + 2];
      if (hJaw[c]) {
        // Rotate about the hinge (0, -0.5, 1.0): forward points swing down by the opening.
        const hy0 = -0.5 * HS, hz0 = 1.0 * HS, qy = py - hy0, qz = pz - hz0;
        py = hy0 + qy * ca - qz * sa; pz = hz0 + qz * ca + qy * sa;
        let t0 = fy; fy = t0 * ca - fz * sa; fz = fz * ca + t0 * sa;
        t0 = uy; uy = t0 * ca - uz * sa; uz = uz * ca + t0 * sa;
      }
      const wxp = ex + hrx * px + hux * py + hfx * pz, wyp = ey + hry * px + huy * py + hfy * pz, wzp = ez + hrz * px + huz * py + hfz * pz;
      const wfx = hrx * fx + hux * fy + hfx * fz, wfy = hry * fx + huy * fy + hfy * fz, wfz = hrz * fx + huz * fy + hfz * fz;
      const wux = hrx * ux + hux * uy + hfx * uz, wuy = hry * ux + huy * uy + hfy * uz, wuz = hrz * ux + huz * uy + hfz * uz;
      const i = hIdx[c];
      rec(i, wxp, wyp, wzp, hS[c * 3], wfx, wfy, wfz, hS[c * 3 + 1], wux, wuy, wuz, hS[c * 3 + 2], kinds[i], hGlow[c] ? eye : 0, 1);
    }
    // Mouth: the muzzle tip, lowered by the jaw's opening.
    {
      const lx = 0, ly = (-0.6 - Math.sin(mouthAng) * 2.8) * HS, lz = 6.2 * HS;
      self.mx = ex + hrx * lx + hux * ly + hfx * lz; self.my = ey + hry * lx + huy * ly + hfy * lz; self.mz = ez + hrz * lx + huz * ly + hfz * lz;
      const dl = Math.hypot(hfx, hfz) || 1; self.mdx = hfx / dl; self.mdz = hfz / dl; self.mdy = hfy;
    }

    // ---- valves
    const vo = self.valves.open;
    for (let k = 0; k < VALVES; k++) {
      const target = vo[k] ? 1 : 0;
      valveOpenAmt[k] += (target - valveOpenAmt[k]) * Math.min(1, dt * 5);
      if (vo[k] && valveOpenAmt[k] > 0.995) valveOpenAmt[k] = 1;
      const open = valveOpenAmt[k], e = open * open * (3 - 2 * open);
      const s = VALVE_S[k], th = VALVE_TH[k];
      self.neckEval(s, th, 0);
      const px = self.sp[0], py = self.sp[1], pz = self.sp[2], nx = self.sn[0], ny = self.sn[1], nz = self.sn[2];
      self.valves.x[k] = px; self.valves.y[k] = py; self.valves.z[k] = pz;
      const tx = self.st[0], ty = self.st[1], tz = self.st[2];
      // Around-the-neck direction at the valve.
      let ax = ny * tz - nz * ty, ay = nz * tx - nx * tz, az = nx * ty - ny * tx;
      if (th < 0) { ax = -ax; ay = -ay; az = -az; }
      const v = clamp(neckRadius(s) * 0.7, 2, 4.4);
      const row = vIdx[k];
      // The core: faint when shut, a blaze when open.
      const glow = open > 0.5 ? 1.3 : 0.28 + 0.1 * Math.sin(self.time * 2.1 + k * 2);
      const cs = v * (0.9 + 0.5 * e);
      rec(row[0], px + nx * (0.15 * v - 0.35 * v * (1 - e)), py + ny * (0.15 * v - 0.35 * v * (1 - e)), pz + nz * (0.15 * v - 0.35 * v * (1 - e)), cs, tx, ty, tz, 0.55 * v + 0.3 * v * e, nx, ny, nz, cs, CHUNK.POD, glow, 1);
      // Four plates peel back from the centre: ±along, ±around.
      const a = 1.15 * e, ca2 = Math.cos(a), sa2 = Math.sin(a);
      for (let q = 0; q < 4; q++) {
        const sg = (q & 1) ? -1 : 1;
        const dx = q < 2 ? tx * sg : ax * sg, dy = q < 2 ? ty * sg : ay * sg, dz = q < 2 ? tz * sg : az * sg;
        const half = 0.5 * v, ho = 0.05 * v + 0.35 * v * e;
        const cxp = px + nx * 0.12 * v + dx * (ho + half * ca2) + nx * half * sa2;
        const cyp = py + ny * 0.12 * v + dy * (ho + half * ca2) + ny * half * sa2;
        const czp = pz + nz * 0.12 * v + dz * (ho + half * ca2) + nz * half * sa2;
        // Forward along the flap; up leans back toward the centre as it lifts.
        rec(row[1 + q], cxp, cyp, czp, 0.95 * v, dx * ca2 + nx * sa2, dy * ca2 + ny * sa2, dz * ca2 + nz * sa2, 0.28 * v, nx * ca2 - dx * sa2, ny * ca2 - dy * sa2, nz * ca2 - dz * sa2, v, CHUNK.STONE, 0, 1);
      }
    }

    // ---- the back: the ridge breathes
    {
      const per = self.state === B.DORMANT ? 7 : self.state === B.INHALE ? 3 : 5;
      creakPhase += dt * (Math.PI * 2 / per);
      const amp = 0.15 + 0.15 * swell + (self.state === B.EXHALE ? 0.1 : 0);        // half travel: 0.3 .. 0.6 m
      const lift = 0.4 * swell;
      for (let c = 0; c < bCount; c++) {
        const u = bU[c], f = bF[c];
        const y = MANOR.y + bY[c] + amp * Math.sin(creakPhase - u * 0.08) + lift * (1 - Math.abs(u) / 32);
        rec(bIdx[c], OX + u * EUX + f * EFX, y, OZ + u * EUZ + f * EFZ, bS[c * 3], EFX, 0, EFZ, bS[c * 3 + 1], 0, 1, 0, bS[c * 3 + 2], kinds[bIdx[c]], 0, 1);
      }
    }
  }

  /** Nearest chunks by surface gap (once, from the first pose). */
  function neighbours() {
    for (let i = 0; i < CH; i++) {
      nbrGap.fill(1e9);
      for (let k = 0; k < BELL_NBR; k++) nbr[i * BELL_NBR + k] = i;
      const oi = i * CHUNK_FLOATS, ri = (chunks[oi + 3] + chunks[oi + 7] + chunks[oi + 11]) / 6;
      for (let j = 0; j < CH; j++) {
        const oj = j * CHUNK_FLOATS;
        if (j === i) continue;
        const rj = (chunks[oj + 3] + chunks[oj + 7] + chunks[oj + 11]) / 6;
        const g = Math.hypot(chunks[oj] - chunks[oi], chunks[oj + 1] - chunks[oi + 1], chunks[oj + 2] - chunks[oi + 2]) - ri - rj;
        if (g > 3) continue;
        let k = BELL_NBR - 1;
        if (g >= nbrGap[k]) continue;
        while (k > 0 && nbrGap[k - 1] > g) { nbrGap[k] = nbrGap[k - 1]; nbr[i * BELL_NBR + k] = nbr[i * BELL_NBR + k - 1]; k--; }
        nbrGap[k] = g; nbr[i * BELL_NBR + k] = j;
      }
    }
  }

  // Start dormant, at its rest pose.
  self.base.x = OX; self.base.z = OZ; self.targetX = OX + EFX * 40; self.targetZ = OZ + EFZ * 40; self.targetY = MANOR.y + 2;
  // The neighbour table is measured once in the reared pose (the rig's topology never changes), so
  // the smooth-mass shading blends along and round the neck, not across a coil.
  self.state = B.IDLE; targets(); V.set(TG); hInit = false; self.update(0, 0);
  neighbours(); self.nbrReady = true; self.nbrDirty = true;
  self.reset();
  return self;
}
