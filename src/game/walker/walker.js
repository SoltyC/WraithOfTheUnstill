// The Long Walker (Phase 9 D10; docs/gameplay-design.md §5.1 "bring it home"): the Shapers' walker
// that carried a caravanserai across the desert; its stride kept the erg moving. It is not hostile:
// it wants to finish its walk. A ~44 m hull of sandstone and packed sand on six legs (hip → knee
// 14 m, knee → foot 22 m), the ruined court on its back — walls, a well, two glyph pillars, an arcade
// with a stair to its roof and the two mirror-stones there — and a low head on a neck at the front.
//
// The body here is kinematics and chunks only (the director is systems/longWalker.js):
//   • a heading and a speed; the body's height, pitch and roll follow its feet;
//   • the gait is a ripple, one leg lifting every 1.2 s in a fixed order (L-back, R-front, L-mid,
//     R-back, L-front, R-mid). A lifted foot's landing spot is fixed when it lifts (the telegraph:
//     the director raises a dust ring there) and it lands exactly there 2.4 s later;
//   • states: BURIED (to the shoulders in the megadune), WAKING, WALK, STUMBLE → KNEEL → RISE (a
//     leg landed wrong), BALK (it will not walk into the rift: it shakes and turns away), HOME (it
//     kneels at the camp's well), RELEASE → RESTED (it lies down and becomes a dune range);
//   • its back is a moving floor (game/walker/deck.js reads `box*` in the body's own frame, `R`/`T`).
//
// Chunks: one record per chunk (game/shaped/rig.js CHUNK_FLOATS) through the 'shaped' material, the
// dune kinds (sand, sandstone, ruin plates, amber light). Every chunk hangs on a bone — the body, a
// leg's upper or lower segment, a foot, the neck, the head, a mirror, the sand mound, or the world —
// as a fixed local offset. Allocation-free per frame.

import { CHUNK, CHUNK_FLOATS } from '../shaped/rig.js';

export const WK = { BURIED: 0, WAKING: 1, WALK: 2, STUMBLE: 3, KNEEL: 4, RISE: 5, BALK: 6, HOME: 7, RELEASE: 8, RESTED: 9 };
export const WEV = { WOKEN: 1, LAND: 2, KNELT: 4, RISING: 8, RISEN: 16, BALK: 32, HOME: 64, RESTED: 128, RISE_WARN: 256 };
export const MODE = { CIRCUIT: 0, STEER: 1, HOME: 2 };

export const walkerTuning = {
  speed: 5,              // m/s walking
  accel: 1.4,            // m/s²
  turnRate: 0.16,        // rad/s
  swing: 2.4,            // s a lifted foot is in the air
  token: 1.2,            // s between lifts (two feet in the air at once)
  lift: 7,               // m a foot rises
  standH: 22, kneelH: 9, buriedH: -1.3, restH: -1.1,   // deck above the feet's mean ground (m): buried and at rest only the court shows
  kneelRoll: 0.16, kneelPitch: 0.07,
  wakeTime: 9, stumbleTime: 1.6, kneelTime: 13, riseWarn: 2.5, riseTime: 3, balkTime: 3.4, releaseTime: 16,
  steerStep: 0.42,       // rad a glyph pillar turns it
  probe: [20, 28, 36, 44], probeDrop: 9,   // m ahead / a drop steeper than this over 8 m is the rift
  homeR: 110,                              // m from the well: it turns home
  homeRoot: 20, homeGate: 16, homeSlant: 0.95,  // its neck's root this far out along the gate's axis, the gate there; the body slanted off the axis (clear of the pool)
};

// Legs: 0 L-front, 1 L-mid, 2 L-back, 3 R-front, 4 R-mid, 5 R-back.
export const LEGS = 6;
export const SIDE = [-1, -1, -1, 1, 1, 1], HIP_Z = [12, 0, -12, 12, 0, -12];
export const RIPPLE = [2, 3, 1, 5, 0, 4];
export const HIP_X = 11.5, HIP_Y = -4, FOOT_X = 26, FOOT_ZK = 1.2, UPPER = 14, LOWER = 22;
/** The deck: x across ±DECK_X, z along ±DECK_Z, the floor's top at local y 0. */
export const DECK_X = 12, DECK_Z = 18;
/** Where the stair of plates up each hip's flank meets the deck (the side walls open there). */
export const FLANK_TOP_Z = [6.4, -5.6, -6.4];
export const PILLARS = [[-7.5, -1], [7.5, -1]];        // glyph pillars (local x, z)
export const MIRRORS = [[-5, -15.2], [5, -15.2]];      // mirror-stones on the arcade roof
export const ROOF_Y = 4.45, WELL_LOCAL = [0, 2];

// Bones.
const B_BODY = 0, B_UP = 1, B_LO = 7, B_FOOT = 13, B_MOUND = 19, B_NECK = 20, B_HEAD = 21, B_MIR = 22, B_WORLD = 24, B_NECK2 = 25, NB = 26;
// Glow slots and alpha groups.
const G_NONE = 0, G_GLYPH0 = 1, G_GLYPH1 = 2, G_EYES = 3, G_WELLEYE = 4, G_BEAM = 5, G_PLATES = 6, G_BRAKE = 7, NG = 8;
const A_ALL = 0, A_LEGS = 1, A_MOUND = 2, A_BEAM0 = 3, A_BEAM1 = 4, A_BRAKE = 5, NA = 6;
/** The brake stone in its forecourt (mound frame: on the ground ahead of the buried body). */
export const BRAKE_LOCAL = [0, 31];
const BEAM0 = 6, BEAM1 = 10;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const hh = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/** The chunk layout (allocation fine: once). */
function buildChunks(ctx) {
  const list = [];
  let seed = 1;
  const add = (bone, x, y, z, sx, sy, sz, kind, o = {}) => list.push({ bone, x, y, z, sx, sy, sz, kind, f: o.f || [0, 0, 1], u: o.u || [0, 1, 0], glow: o.glow || G_NONE, alpha: o.alpha || A_ALL, seed: seed++ });
  const { SAND, SANDSTONE, RUIN, THORN, POD, GLASS } = CHUNK;
  // Hull: banded sandstone masses under the deck, packed sand at the belly and draped down the flanks.
  for (const z of [-15, -9, -3, 3, 9, 15]) for (const x of [-7, 0, 7]) add(B_BODY, x + (hh(x, z) - 0.5), -3.7, z, 8.6, 7.2, 7.4, SANDSTONE);
  for (const z of [-15, -9, -3, 3, 9, 15]) add(B_BODY, 0, -6.9, z, 15, 3.6, 7.6, SAND);
  for (const z of [-14, -7, 0, 7, 14]) for (const s of [-1, 1]) add(B_BODY, s * 11.9, -3.2, z, 2.6, 6, 7.2, SAND);
  for (const s of [-1, 1]) add(B_BODY, 0, -3.2, s * 18.4, 21, 6, 3, SANDSTONE);
  // The court's floor: carved plates.
  for (let i = 0; i < 8; i++) for (let j = 0; j < 12; j++) add(B_BODY, -10.5 + 3 * i, -0.36, -16.5 + 3 * j, 3.55, 0.72, 3.55, RUIN);
  // Walls: ragged tops; the side walls open where the flank stairs arrive, the front at the gate.
  const gapZ = (z) => Math.abs(z - 6.4) < 1.7 || (z > -7.6 && z < -4.4);
  for (const s of [-1, 1]) for (let k = 0; k < 15; k++) {
    const z = -16.8 + k * 2.4; if (gapZ(z)) continue;
    const h = 2.4 + 0.9 * hh(k, s + 7);
    add(B_BODY, s * 11.55, h / 2, z, 0.95, h, 2.75, RUIN);
  }
  for (const zs of [-1, 1]) for (let k = 0; k < 10; k++) {
    const x = -10.8 + k * 2.4; if (zs > 0 && Math.abs(x) < 2.7) continue;
    const h = 2.4 + 0.9 * hh(k, zs + 11);
    add(B_BODY, x, h / 2, zs * 17.55, 0.95, h, 2.75, RUIN, { f: [1, 0, 0] });
  }
  // Gate piers either side of the front gap.
  for (const s of [-1, 1]) add(B_BODY, s * 3.2, 2.2, 17.55, 1.3, 4.4, 1.3, SANDSTONE);
  // The well on its back: a ring of stones.
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; add(B_BODY, WELL_LOCAL[0] + Math.cos(a) * 1.55, 0.45, WELL_LOCAL[1] + Math.sin(a) * 1.55, 0.55, 0.9, 1.05, RUIN, { f: [-Math.sin(a), 0, Math.cos(a)] }); }
  // The glyph pillars: carved drums whose glyph bands glow when struck; a cap.
  PILLARS.forEach(([x, z], k) => {
    for (let q = 0; q < 3; q++) add(B_BODY, x, 1.05 + q * 2.05, z, 1.45, 2.1, 1.45, RUIN, { glow: k ? G_GLYPH1 : G_GLYPH0 });
    add(B_BODY, x, 6.35, z, 1.9, 0.6, 1.9, SANDSTONE);
    add(B_BODY, x, 6.8, z, 0.55, 0.55, 0.55, POD, { glow: k ? G_GLYPH1 : G_GLYPH0 });
  });
  // The arcade at the back: four piers and a roof of slabs; a stair up to it on the left.
  for (const x of [-9.5, -3.2, 3.2, 9.5]) add(B_BODY, x, 2.1, -13.2, 0.9, 4.2, 0.9, SANDSTONE);
  for (let i = 0; i < 7; i++) for (const z of [-16.4, -14.0]) add(B_BODY, -9 + 3 * i, ROOF_Y - 0.25, z, 3.2, 0.5, 2.6, RUIN);
  for (let k = 0; k < 8; k++) { const top = 0.55 * (k + 1); add(B_BODY, -11 + 0.62 * k, top / 2, -12.2, 0.7, top, 1.2, SANDSTONE); }
  // The mirror-stones: a drum, and a polished glass disc on it that turns (its own bone).
  MIRRORS.forEach(([x, z], k) => {
    add(B_BODY, x, ROOF_Y + 0.4, z, 1.2, 0.8, 1.2, SANDSTONE);
    add(B_MIR + k, 0, 1.75, 0, 2.5, 2.5, 0.3, GLASS);
    add(B_MIR + k, 0, 0.9, -0.2, 0.35, 1.2, 0.35, SANDSTONE);
  });
  // Flank stairs: ruin-stone plates set into the sand from each hip up to the deck (the climb).
  for (let leg = 0; leg < LEGS; leg++) {
    const s = SIDE[leg], dir = leg % 3 === 2 ? 1 : -1;
    for (let i = 0; i < 7; i++) { const top = -3.85 + 0.55 * (i + 1); add(B_BODY, s * 12.9, top - 0.25, HIP_Z[leg] + dir * (0.5 + 0.85 * i), 1.7, 0.5, 1.0, RUIN, { glow: G_PLATES }); }
  }
  // Legs: sandstone cores with packed sand, ruin plates along the top (the climb on a kneeling leg).
  for (let leg = 0; leg < LEGS; leg++) {
    const up = B_UP + leg, lo = B_LO + leg, ft = B_FOOT + leg, al = A_LEGS;
    for (let j = 0; j < 7; j++) {
      const y = 1.0 + j * 2.0;
      add(up, 0, y, 0, 3.6, 3.0, 3.2, SANDSTONE, { alpha: al });
      for (const s of [-1, 1]) add(up, s * 1.3, y + 0.6, -0.8, 2.2, 2.6, 2.0, SAND, { alpha: al });
      add(up, 0, y, 1.75, 1.9, 0.45, 1.7, RUIN, { u: [0, 0, 1], f: [0, 1, 0], glow: G_PLATES, alpha: al });
    }
    add(up, 0, UPPER, 0, 4.4, 4.4, 4.4, SANDSTONE, { alpha: al });
    for (let j = 0; j < 9; j++) {
      const y = 1.4 + j * 2.5, k = 1 - 0.35 * y / LOWER;
      add(lo, 0, y, 0, 3.0 * k, 3.3, 2.8 * k, SANDSTONE, { alpha: al });
      add(lo, (j % 2 ? 1 : -1) * 1.1 * k, y, 0.3, 2.0 * k, 2.8, 1.8 * k, SAND, { alpha: al });
      if (j % 2 === 0) add(lo, 0, y, 1.45 * k, 1.6 * k, 0.4, 1.6, RUIN, { u: [0, 0, 1], f: [0, 1, 0], alpha: al });
    }
    add(ft, 0, 0.6, 0, 5.2, 1.6, 6, SANDSTONE, { alpha: al });
    for (const [x, z] of [[-1.7, 2.8], [0, 3.4], [1.7, 2.8]]) add(ft, x, 0.45, z, 1.3, 1.0, 2.4, THORN, { alpha: al });
    add(ft, 0, 0.5, -2.6, 2.6, 1.2, 2.2, SANDSTONE, { alpha: al });
  }
  // Neck (stretches on release) and head: a long sandstone skull, a carved face plate, amber eyes.
  for (const nb of [B_NECK, B_NECK2]) for (let j = 0; j < 3; j++) { const y = 0.17 + j * 0.33, w = nb === B_NECK ? 3.4 - j * 0.15 : 2.95 - j * 0.15; add(nb, 0, y, 0, w, 3.4, w * 0.9, SANDSTONE); add(nb, 0, y + 0.12, 1.1, 2.0, 2.4, 1.6, SAND); }
  add(B_HEAD, 0, 0, 0, 5, 4, 6.5, SANDSTONE);
  add(B_HEAD, 0, 0.2, 3.1, 4.2, 3.2, 0.8, RUIN, { u: [0, 0, 1], f: [0, 1, 0] });
  for (const s of [-1, 1]) add(B_HEAD, s * 1.25, 0.7, 3.5, 0.75, 0.6, 0.6, POD, { glow: G_EYES });
  for (const s of [-1, 1]) add(B_HEAD, s * 2.0, 1.9, -0.5, 0.9, 2.6, 0.9, THORN, { f: [0, 0.4, -0.9] });
  add(B_HEAD, 0, -1.7, 1.2, 3.6, 1.4, 4.2, SANDSTONE);
  // The brake stone in the forecourt: a carved stele with a glyph band, an amber stone set in its top.
  add(B_MOUND, BRAKE_LOCAL[0], 1.2, BRAKE_LOCAL[1], 1.8, 2.8, 1.2, RUIN, { glow: G_BRAKE, alpha: A_BRAKE });
  add(B_MOUND, BRAKE_LOCAL[0], 2.85, BRAKE_LOCAL[1], 0.7, 0.6, 0.7, POD, { glow: G_BRAKE, alpha: A_BRAKE });
  for (const s of [-1, 1]) add(B_MOUND, BRAKE_LOCAL[0] + s * 1.6, 0.3, BRAKE_LOCAL[1] + 0.4, 1.4, 0.9, 1.6, SANDSTONE, { alpha: A_BRAKE });
  // The light: amber motes along the beam (mirror → mirror, mirror → well), and the well's glass eye.
  for (let k = 0; k < BEAM0 + BEAM1; k++) add(B_WORLD, 0, 0, 0, 0.32, 0.32, 1.6, POD, { glow: G_BEAM, alpha: k < BEAM0 ? A_BEAM0 : A_BEAM1 });
  add(B_WORLD, 0, 0, 0, 1.3, 0.9, 1.3, POD, { glow: G_WELLEYE });
  return list;
}

/**
 * @param {{ ground: { qx: number, qz: number, h: number, sample: () => void, covers?: () => boolean } }} ctx
 */
export function createWalker(ctx) {
  const ground = ctx.ground;
  const T = walkerTuning;
  const list = buildChunks(ctx);
  const N = list.length;
  const chunks = new Float32Array(N * CHUNK_FLOATS);
  const cb = new Uint8Array(N), cg = new Uint8Array(N), ca = new Uint8Array(N);
  const cp = new Float64Array(N * 3), cf = new Float64Array(N * 3), cu = new Float64Array(N * 3), cs = new Float64Array(N * 3), ck = new Float32Array(N), cseed = new Float32Array(N);
  list.forEach((c, i) => {
    cb[i] = c.bone; cg[i] = c.glow; ca[i] = c.alpha; ck[i] = c.kind; cseed[i] = c.seed * 7.13;
    cp[i * 3] = c.x; cp[i * 3 + 1] = c.y; cp[i * 3 + 2] = c.z;
    cs[i * 3] = c.sx; cs[i * 3 + 1] = c.sy; cs[i * 3 + 2] = c.sz;
    const fl = Math.hypot(...c.f), ul = Math.hypot(...c.u);
    for (let q = 0; q < 3; q++) { cf[i * 3 + q] = c.f[q] / fl; cu[i * 3 + q] = c.u[q] / ul; }
  });
  const beamStart = list.findIndex((c) => c.glow === G_BEAM), eyeIdx = list.findIndex((c) => c.glow === G_WELLEYE);
  // Bones: origin and basis (Ex, Ey, Ez), and a stretch along Ey for the neck (local y is a fraction).
  const BO = new Float64Array(NB * 3), BE = new Float64Array(NB * 9), BY = new Float64Array(NB).fill(1);
  const glow = new Float64Array(NG), alpha = new Float64Array(NA).fill(1);

  // Deck boxes in the body's own frame: centre (x, z), half sizes, yaw (cos, sin), bottom and top; on.
  const MAXB = 160;
  const bx = new Float64Array(MAXB), bz = new Float64Array(MAXB), bhx = new Float64Array(MAXB), bhz = new Float64Array(MAXB);
  const bc = new Float64Array(MAXB).fill(1), bsn = new Float64Array(MAXB), by0 = new Float64Array(MAXB), by1 = new Float64Array(MAXB), bon = new Uint8Array(MAXB);
  let nb = 0;
  const box = (x, z, hx, hz, y0, y1, yaw = 0) => { bx[nb] = x; bz[nb] = z; bhx[nb] = hx; bhz[nb] = hz; by0[nb] = y0; by1[nb] = y1; bc[nb] = Math.cos(yaw); bsn[nb] = Math.sin(yaw); bon[nb] = 1; return nb++; };
  box(0, 0, DECK_X, DECK_Z, -7.5, 0);                                     // the floor (and the hull under it)
  // Side walls in runs between the openings, front wall either side of the gate, back wall.
  const runs = [[-18, -7.6], [-4.4, 4.7], [8.1, 18]];
  for (const s of [-1, 1]) for (const [a, b] of runs) box(s * 11.55, (a + b) / 2, 0.5, (b - a) / 2, 0, 2.4);
  for (const s of [-1, 1]) box(s * 7.4, 17.55, 4.6, 0.5, 0, 2.4);
  box(0, -17.55, 12, 0.5, 0, 2.4);
  for (const s of [-1, 1]) box(s * 3.2, 17.55, 0.7, 0.7, 0, 4.4);
  box(WELL_LOCAL[0], WELL_LOCAL[1], 1.95, 1.95, 0, 0.9);
  for (const [x, z] of PILLARS) box(x, z, 0.78, 0.78, 0, 6.6);
  for (const x of [-9.5, -3.2, 3.2, 9.5]) box(x, -13.2, 0.47, 0.47, 0, 4.2);
  box(0, -15.0, 10.6, 2.2, ROOF_Y - 0.5, ROOF_Y);                           // the arcade roof
  for (let k = 0; k < 8; k++) box(-11 + 0.62 * k, -12.2, 0.31, 0.6, 0, 0.55 * (k + 1));
  for (const [x, z] of MIRRORS) box(x, z, 0.62, 0.62, ROOF_Y, ROOF_Y + 0.8);
  for (let leg = 0; leg < LEGS; leg++) {
    const s = SIDE[leg], dir = leg % 3 === 2 ? 1 : -1;
    for (let i = 0; i < 7; i++) box(s * 12.9, HIP_Z[leg] + dir * (0.5 + 0.85 * i), 0.85, 0.5, -7.5, -3.85 + 0.55 * (i + 1));
  }
  // The kneeling leg's ramp: plates along its upper segment (set while it kneels).
  const RAMP = 32, ramp0 = nb;
  for (let k = 0; k < RAMP; k++) { box(0, 0, 0.9, 0.45, -30, -29); bon[nb - 1] = 0; }

  // Legs: feet (planted or swinging), the swing's start and target, the landing events.
  const fx = new Float64Array(LEGS), fy = new Float64Array(LEGS), fz = new Float64Array(LEGS);
  const sx0 = new Float64Array(LEGS), sy0 = new Float64Array(LEGS), sz0 = new Float64Array(LEGS);
  const tx = new Float64Array(LEGS), ty = new Float64Array(LEGS), tz = new Float64Array(LEGS);
  const swing = new Float64Array(LEGS);      // 0 planted, (0, 1) swinging
  const kx = new Float64Array(LEGS), ky = new Float64Array(LEGS), kz = new Float64Array(LEGS);   // knees (world)
  const hx = new Float64Array(LEGS), hy = new Float64Array(LEGS), hz = new Float64Array(LEGS);   // hips (world)
  const landLeg = new Int8Array(8), landX = new Float64Array(8), landY = new Float64Array(8), landZ = new Float64Array(8);
  const R = new Float64Array(9), Rp = new Float64Array(9), Tp = new Float64Array(3);
  const v3 = new Float64Array(3);
  const hp3 = new Float64Array(3);
  // Scratch for calls without doubles as arguments or results (boxed when V8 does not inline them):
  // Q[0..1] ground query x, z → Q[2]; Q[3..5] a body-local point → v3 (world); Q[6..9] neutral() x, z,
  // yaw, lead; Q[10..15] a segment's ends; Q[16] its length; Q[17] the last ground known.
  const Q = new Float64Array(18);
  const covers = typeof ground.covers === 'function';
  function gq() {
    ground.qx = Q[0]; ground.qz = Q[1];
    if (covers && !ground.covers()) { Q[2] = Q[17]; return; }
    ground.sample(); Q[2] = ground.h;
  }

  const self = {
    chunks, count: N, state: WK.BURIED, mode: MODE.CIRCUIT, t: 0, ev: 0, time: 0,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, targetYaw: 0,
    /** World transform of the deck frame: T (x, y, z), R columns (Ex, Ey, Ez); last frame's too (deck carry). */
    R, Rp, Tp, dt: 0,
    fx, fy, fz, tx, ty, tz, swing, kx, ky, kz, hx, hy, hz,
    landLeg, landX, landY, landZ, landN: 0,
    /** The leg it kneels on (-1 none), the side it rolls to. */
    kneelLeg: -1,
    /** Deck boxes (game/walker/deck.js). */
    nBox: nb, bx, bz, bhx, bhz, bc, bsn, by0, by1, bon,
    /** Ground (deck-relative) wanted, and a shake the director asks for (rad amplitude, s). */
    shakeAmp: 0, shakeT: 0,
    /** The director's inputs: glows (glyph pillars, the well eye, the beams), the mirrors' yaws, the light. */
    glyph0: 0, glyph1: 0, wellEye: 0, brake: 0.3, beam0: 0, beam1: 0, mirrorYaw: new Float64Array([2.4, -0.8]),
    wellX: 0, wellY: 0, wellZ: 0,
    /** Mound: 1 risen round the body (buried / at rest), 0 sunk away. */
    mound: 1,
    /** Release progress 0..1 (the head lowers to the well, the body lies down). */
    rel: 0,
    _token: 0, _tokenT: 0, _immune: 0, _probeT: 0, _homeX: 0, _homeZ: 0, _yawRate: 0,
    _H: T.buriedH, _rest: 0, _ground: 0, _wellSet: false, _homeSide: 0, _homeD: 1e9, _homeIn: false,

    /** Lay it down buried, facing yaw, at (x, z) (the megadune). */
    placeBuried(x, z, yaw) { place(x, z, yaw, WK.BURIED); },
    /** Stand it up walking (a loaded save mid-journey). */
    placeWalking(x, z, yaw) { place(x, z, yaw, WK.WALK); },
    /** Lay it at rest (released) at (x, z) facing yaw. */
    placeRested(x, z, yaw) { place(x, z, yaw, WK.RESTED); this.rel = 1; },
    wake() { if (this.state === WK.BURIED) { this.state = WK.WAKING; this.t = 0; } },
    /** Leg k landed wrong: it stumbles and kneels on that side. */
    stumble(k) {
      if (this.state !== WK.WALK || this._immune > 0) return false;
      this.state = WK.STUMBLE; this.t = 0; this.kneelLeg = k; return true;
    },
    /** A glyph pillar struck: dir −1 left, +1 right. */
    steer(dir) {
      if (this.mode === MODE.HOME) return;
      if (this.mode === MODE.CIRCUIT) this.targetYaw = this.yaw;
      this.mode = MODE.STEER;
      this.targetYaw = wrap(this.targetYaw + dir * T.steerStep);
    },
    /** Back to its circuit (the director: nobody has steered it for a while). */
    toCircuit() { if (this.mode === MODE.STEER) this.mode = MODE.CIRCUIT; },
    /** The well's world position (the director sets it once: the camp's dry well, its eye at y). */
    setWell(x, y, z, gateYaw = 0) { this.wellX = x; this.wellY = y; this.wellZ = z; this.gateX = Math.sin(gateYaw); this.gateZ = Math.cos(gateYaw); this._wellSet = true; },
    gateX: 0, gateZ: 1,
    /** Where it kneels at the well: its neck's root out along the gate's axis, the body slanted to `side` (±1) → out = [x, z, yaw]. */
    homePose(side, out) {
      const T2 = walkerTuning, gx = this.gateX, gz = this.gateZ;
      const yaw = Math.atan2(-gx, -gz) + side * T2.homeSlant;
      const rx = this.wellX + gx * T2.homeRoot, rz = this.wellZ + gz * T2.homeRoot;
      out[0] = rx - Math.sin(yaw) * 18; out[1] = rz - Math.cos(yaw) * 18; out[2] = yaw;
      return out;
    },
    release() { if (this.state === WK.HOME) { this.state = WK.RELEASE; this.t = 0; } },
    /** The circuit's next point (the director sets it each frame while mode is CIRCUIT). */
    circuitX: 0, circuitZ: 0,
    // (Methods, not getters: an accessor in this literal would put the object in dictionary mode,
    // and every double stored on it would then be boxed.)
    isKneeling() { return this.state === WK.KNEEL || this.state === WK.STUMBLE; },
    isAwake() { return this.state !== WK.BURIED && this.state !== WK.RESTED; },

    /** Advance by `dt` (the field; an argument is for tests and one-offs). */
    update(dt) {
      if (dt !== undefined) this.dt = dt;
      const d = this.dt;
      this.time += d; this.t += d; this.ev = 0; this.landN = 0;
      for (let q = 0; q < 9; q++) Rp[q] = R[q];
      Tp[0] = this.x; Tp[1] = this.y; Tp[2] = this.z;
      this._immune = Math.max(0, this._immune - d);
      think();
      move();
      gait();
      body();
      legsIK();
      bones();
      write();
    },
  };

  function place(x, z, yaw, state) {
    self.x = x; self.z = z; self.yaw = self.targetYaw = yaw; self.state = state; self.t = 0; self.speed = 0;
    self.mode = MODE.CIRCUIT; self.kneelLeg = -1; self.rel = state === WK.RESTED ? 1 : 0; self._homeSide = 0; self._homeD = 1e9; self._homeIn = false;
    self.mound = state === WK.BURIED || state === WK.RESTED ? 1 : 0;
    Q[0] = x; Q[1] = z; gq(); const g0 = Q[2]; Q[17] = g0;
    for (let k = 0; k < LEGS; k++) { Q[6] = x; Q[7] = z; Q[8] = yaw; Q[9] = 0; neutral(k); fx[k] = v3[0]; fz[k] = v3[2]; Q[0] = fx[k]; Q[1] = fz[k]; gq(); fy[k] = Q[2]; swing[k] = 0; }
    self._ground = g0; self._H = state === WK.BURIED ? T.buriedH : state === WK.RESTED ? T.restH : T.standH;
    self.y = meanFeet() + self._H; self.pitch = 0; self.roll = 0;
    self.update(0);
    for (let q = 0; q < 9; q++) Rp[q] = R[q];
    Tp[0] = self.x; Tp[1] = self.y; Tp[2] = self.z;
  }
  /** Neutral foot place for leg k with the body at (Q[6], Q[7]) facing Q[8], Q[9] m forward → v3. */
  function neutral(k) {
    const yaw = Q[8], c = Math.cos(yaw), s = Math.sin(yaw), lx = SIDE[k] * FOOT_X, lz = HIP_Z[k] * FOOT_ZK + Q[9];
    v3[0] = Q[6] + c * lx + s * lz; v3[1] = 0; v3[2] = Q[7] - s * lx + c * lz;
  }
  function meanFeet() { let m = 0; for (let k = 0; k < LEGS; k++) m += swing[k] > 0 ? ty[k] : fy[k]; return m / LEGS; }

  function think() {
    const s = self, dt = s.dt;
    switch (s.state) {
      case WK.WAKING: if (s.t >= T.wakeTime) { s.state = WK.WALK; s.t = 0; s.ev |= WEV.WOKEN; s.mound = 0; } break;
      case WK.STUMBLE: if (s.t >= T.stumbleTime) { s.state = WK.KNEEL; s.t = 0; s.ev |= WEV.KNELT; } break;
      case WK.KNEEL:
        if (s.t >= T.kneelTime - T.riseWarn && s.t - dt < T.kneelTime - T.riseWarn) s.ev |= WEV.RISE_WARN;
        if (s.t >= T.kneelTime) {
          s.state = WK.RISE; s.t = 0; s.ev |= WEV.RISING;
          // The folded leg swings back under the body.
          const k = s.kneelLeg; Q[6] = s.x; Q[7] = s.z; Q[8] = s.yaw; Q[9] = 0; neutral(k);
          sx0[k] = fx[k]; sy0[k] = fy[k]; sz0[k] = fz[k]; tx[k] = v3[0]; tz[k] = v3[2]; Q[0] = tx[k]; Q[1] = tz[k]; gq(); ty[k] = Q[2]; swing[k] = 1e-3;
        }
        break;
      case WK.RISE: if (s.t >= T.riseTime) { s.state = WK.WALK; s.t = 0; s.kneelLeg = -1; s._immune = 6; s.ev |= WEV.RISEN; } break;
      case WK.BALK: if (s.t >= T.balkTime) { s.state = WK.WALK; s.t = 0; s.mode = MODE.CIRCUIT; } break;
      case WK.RELEASE: s.rel = Math.min(1, s.t / T.releaseTime); s.mound = ease((s.t - 6) / 8); if (s.t >= T.releaseTime) { s.state = WK.RESTED; s.t = 0; s.ev |= WEV.RESTED; } break;
      default: break;
    }
    if (s.state === WK.WALK) {
      // Where it is going: its circuit, the heading it was steered to, or home to the well.
      const wdx = s.wellX - s.x, wdz = s.wellZ - s.z, dw = Math.sqrt(wdx * wdx + wdz * wdz);
      if (s.mode !== MODE.HOME && dw < T.homeR && s._wellSet) s.mode = MODE.HOME;
      if (s.mode === MODE.CIRCUIT) s.targetYaw = Math.atan2(s.circuitX - s.x, s.circuitZ - s.z);
      else if (s.mode === MODE.HOME) {
        // To its kneeling place by the gate (on the side it came from), then round to face it.
        if (s._homeSide === 0) s._homeSide = (s.x - s.wellX) * s.gateZ - (s.z - s.wellZ) * s.gateX >= 0 ? -1 : 1;
        s.homePose(s._homeSide, hp3);
        const hdx = hp3[0] - s.x, hdz = hp3[1] - s.z, dh = Math.sqrt(hdx * hdx + hdz * hdz);
        s._homeD = dh;
        if (dh <= 3) s._homeIn = true;
        s.targetYaw = s._homeIn ? hp3[2] : Math.atan2(hp3[0] - s.x, hp3[1] - s.z);
        if (s._homeIn && Math.abs(wrap(hp3[2] - s.yaw)) < 0.06) { s.state = WK.HOME; s.t = 0; s.ev |= WEV.HOME; }
      }
      // The rift: steered toward a drop it will not take, it balks.
      s._probeT -= dt;
      if (s.mode === MODE.STEER && s.speed > 1 && s._probeT <= 0) {
        s._probeT = 0.5;
        const c = Math.sin(s.yaw), d = Math.cos(s.yaw), P = T.probe;
        Q[0] = s.x + c * P[0]; Q[1] = s.z + d * P[0]; gq();
        let prev = Q[2];
        for (let q = 1; q < P.length; q++) {
          Q[0] = s.x + c * P[q]; Q[1] = s.z + d * P[q]; gq();
          const h = Q[2];
          if (prev - h > T.probeDrop * (P[q] - P[q - 1]) / 8) { s.state = WK.BALK; s.t = 0; s.ev |= WEV.BALK; s.shakeAmp = 0.09; s.shakeT = T.balkTime; break; }
          prev = h;
        }
      }
    }
  }

  function move() {
    const s = self, dt = s.dt;
    const err = wrap(s.targetYaw - s.yaw);
    let want = 0;
    if (s.state === WK.WALK) want = T.speed * clamp(Math.cos(err) * 1.6 - 0.6, 0, 1) * (s.mode === MODE.HOME ? (s._homeIn ? 0 : clamp((s._homeD - 1.5) / 12, 0, 1)) : 1);
    s.speed += clamp(want - s.speed, -T.accel * dt * 1.6, T.accel * dt);
    const turning = s.state === WK.WALK || s.state === WK.BALK && s.t > T.balkTime * 0.5;
    const turn = turning ? clamp(err, -T.turnRate * dt, T.turnRate * dt) : 0;
    s._yawRate = dt > 0 ? turn / dt : 0;
    s.yaw = wrap(s.yaw + turn);
    s.x += Math.sin(s.yaw) * s.speed * dt; s.z += Math.cos(s.yaw) * s.speed * dt;
    if (s.state === WK.BALK && s.t > T.balkTime * 0.5) s.targetYaw = Math.atan2(s.circuitX - s.x, s.circuitZ - s.z);
  }

  function gait() {
    const s = self, dt = s.dt;
    // Lifts come in the ripple's order while it walks or turns; a lift fixes the landing spot.
    const stepping = s.state === WK.WALK || s.state === WK.BALK && s.t > T.balkTime * 0.5;
    if (stepping) {
      s._tokenT += dt;
      if (s._tokenT >= T.token) {
        s._tokenT -= T.token;
        const k = RIPPLE[s._token]; s._token = (s._token + 1) % LEGS;
        if (swing[k] === 0) {
          const ahead = T.swing, yaw = s.yaw + s._yawRate * ahead;
          const px = s.x + Math.sin(s.yaw) * s.speed * ahead, pz = s.z + Math.cos(s.yaw) * s.speed * ahead;
          const lead = s.speed * T.token * 4 * 0.5;
          Q[6] = px; Q[7] = pz; Q[8] = yaw; Q[9] = lead; neutral(k);
          const ddx = v3[0] - fx[k], ddz = v3[2] - fz[k], d = Math.sqrt(ddx * ddx + ddz * ddz);
          if (d > 2) {
            sx0[k] = fx[k]; sy0[k] = fy[k]; sz0[k] = fz[k];
            tx[k] = v3[0]; tz[k] = v3[2]; Q[0] = tx[k]; Q[1] = tz[k]; gq(); ty[k] = Q[2];
            swing[k] = 1e-3;
          }
        }
      }
    }
    for (let k = 0; k < LEGS; k++) {
      if (swing[k] === 0) continue;
      const dur = s.state === WK.RISE && k === s.kneelLeg ? T.riseTime * 0.8 : T.swing;
      swing[k] = Math.min(1, swing[k] + dt / dur);
      const u = swing[k], e = ease(u);
      fx[k] = sx0[k] + (tx[k] - sx0[k]) * e; fz[k] = sz0[k] + (tz[k] - sz0[k]) * e;
      fy[k] = sy0[k] + (ty[k] - sy0[k]) * e + T.lift * Math.sin(Math.PI * u);
      if (u >= 1) {
        swing[k] = 0; fx[k] = tx[k]; fy[k] = ty[k]; fz[k] = tz[k];
        if (s.landN < 8) { landLeg[s.landN] = k; landX[s.landN] = fx[k]; landY[s.landN] = fy[k]; landZ[s.landN] = fz[k]; s.landN++; }
        s.ev |= WEV.LAND;
      }
    }
    // The kneeling leg folds: knee to the ground outward of the hip, the foot folded back along the ground.
    if ((s.state === WK.STUMBLE || s.state === WK.KNEEL) && s.kneelLeg >= 0) {
      const k = s.kneelLeg, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const out = SIDE[k] * (HIP_X + 14.5), lz = HIP_Z[k] - 6;
      const gx = s.x + c * out + sn * lz, gz = s.z - sn * out + c * lz;
      const u = s.state === WK.STUMBLE ? ease(s.t / T.stumbleTime) : 1;
      if (swing[k] > 0) swing[k] = 0;
      fx[k] += (gx - fx[k]) * Math.min(1, u * 0.2 + 0.05); fz[k] += (gz - fz[k]) * Math.min(1, u * 0.2 + 0.05);
      Q[0] = fx[k]; Q[1] = fz[k]; gq(); fy[k] = Q[2];
    }
  }

  function body() {
    const s = self, dt = s.dt, k1 = 1 - Math.exp(-dt * 1.3);
    let H = T.standH, pitch = 0, roll = 0;
    switch (s.state) {
      case WK.BURIED: H = T.buriedH; break;
      case WK.WAKING: { const u = s.t / T.wakeTime; H = T.buriedH + (T.standH - T.buriedH) * ease((u - 0.12) / 0.8); pitch = 0.05 * Math.sin(Math.PI * clamp(u * 1.3, 0, 1)); roll = 0.04 * Math.sin(u * 9) * (1 - u); s.mound = 1 - ease((u - 0.1) / 0.5); break; }
      case WK.STUMBLE: case WK.KNEEL: {
        const u = s.state === WK.STUMBLE ? ease(s.t / T.stumbleTime) : 1, k = s.kneelLeg;
        H = T.standH + (T.kneelH - T.standH) * u;
        roll = -SIDE[k] * T.kneelRoll * u; pitch = (k % 3 === 0 ? -1 : k % 3 === 2 ? 1 : 0) * T.kneelPitch * u;
        if (s.state === WK.KNEEL) H += 0.1 * Math.sin(s.t * 0.9);       // it breathes
        break;
      }
      case WK.RISE: { const u = ease(s.t / T.riseTime), k = s.kneelLeg; H = T.kneelH + (T.standH - T.kneelH) * u; roll = -SIDE[k] * T.kneelRoll * (1 - u); pitch = (k % 3 === 0 ? -1 : k % 3 === 2 ? 1 : 0) * T.kneelPitch * (1 - u); break; }
      case WK.HOME: { const u = ease(s.t / 3); H = T.standH + (T.kneelH - T.standH) * u; pitch = -0.05 * u; if (s.t > 3) H += 0.2 * Math.sin(s.t * 0.7); break; }
      case WK.RELEASE: { const u = ease(clamp((s.t - 5) / 9, 0, 1)); H = T.kneelH + (T.restH - T.kneelH) * u; pitch = -0.05 * (1 - u); break; }
      case WK.RESTED: H = T.restH; break;
      default: break;
    }
    // The feet decide its attitude: the front higher pitches it up, the right higher rolls it.
    if (s.state === WK.WALK || s.state === WK.BALK || s.state === WK.WAKING) {
      const front = (fy[0] + fy[3]) * 0.5, back = (fy[2] + fy[5]) * 0.5;
      const left = (fy[0] + fy[1] + fy[2]) / 3, right = (fy[3] + fy[4] + fy[5]) / 3;
      pitch += clamp(Math.atan2(front - back, 2 * HIP_Z[0] * FOOT_ZK), -0.12, 0.12);
      roll += clamp(Math.atan2(right - left, 2 * FOOT_X), -0.1, 0.1);
      if (s.state === WK.WALK) H += 0.35 * Math.sin(s.time * Math.PI / T.token) * Math.min(1, s.speed / T.speed);
    }
    s._H += (H - s._H) * (s.state === WK.STUMBLE ? 1 - Math.exp(-dt * 5) : s.state === WK.WAKING || s.state === WK.RELEASE ? 1 - Math.exp(-dt * 3) : k1);
    let m = 0, n = 0;
    for (let q = 0; q < LEGS; q++) { if (q === s.kneelLeg) continue; m += swing[q] > 0 ? ty[q] : fy[q]; n++; }
    let g0 = n > 0 ? m / n : s._ground;
    // Buried (and at rest) it lies in the sand at its middle: the court shows above the dune there.
    if (s.state === WK.BURIED || s.state === WK.RESTED || s.state === WK.WAKING && s.t < 1) { Q[0] = s.x; Q[1] = s.z; gq(); g0 = Math.max(g0, Q[2]); }
    s._ground += (g0 - s._ground) * (s.state === WK.BURIED || s.state === WK.RESTED ? 1 : k1);
    Q[17] = s._ground;
    s.y = s._ground + s._H;
    s.pitch += (pitch - s.pitch) * (s.state === WK.STUMBLE ? 1 - Math.exp(-dt * 4) : k1);
    s.roll += (roll - s.roll) * (s.state === WK.STUMBLE ? 1 - Math.exp(-dt * 4) : k1);
    // A shake the director asked for (or a balk): a rocking roll and a little heave.
    let r = s.roll, py = 0;
    if (s.shakeT > 0) { s.shakeT -= dt; const a = s.shakeAmp * Math.min(1, s.shakeT * 2); r += a * Math.sin(s.time * 8.5); py = a * 4 * Math.sin(s.time * 13); }
    // R = yaw · pitch · roll (columns: the body's right, up, forward).
    const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch), cr = Math.cos(r), sr = Math.sin(r);
    // Each column: roll about forward, then pitch about right, then yaw (the unit axes written out).
    R[0] = cr * cy - sr * sp * sy; R[1] = sr * cp; R[2] = -cr * sy - sr * sp * cy;      // right (1, 0, 0)
    R[3] = -sr * cy - cr * sp * sy; R[4] = cr * cp; R[5] = sr * sy - cr * sp * cy;      // up (0, 1, 0)
    R[6] = cp * sy; R[7] = sp; R[8] = cp * cy;                                           // forward (0, 0, 1)
    s.y += py;
  }

  /** World point of body-local (Q[3], Q[4], Q[5]) → v3. */
  function toWorld() {
    const lx = Q[3], ly = Q[4], lz = Q[5];
    v3[0] = self.x + R[0] * lx + R[3] * ly + R[6] * lz;
    v3[1] = self.y + R[1] * lx + R[4] * ly + R[7] * lz;
    v3[2] = self.z + R[2] * lx + R[5] * ly + R[8] * lz;
  }
  /** (Tests and one-offs: the director uses the field queries below.) */
  self.toWorld = (lx, ly, lz, out) => { Q[3] = lx; Q[4] = ly; Q[5] = lz; toWorld(); out[0] = v3[0]; out[1] = v3[1]; out[2] = v3[2]; return out; };
  /** Field queries for per-frame use: io[0..2] in → io[3..5] out (body-local → world, world → body-local). */
  const io = self.io = new Float64Array(6);
  self.toWorldQ = () => { Q[3] = io[0]; Q[4] = io[1]; Q[5] = io[2]; toWorld(); io[3] = v3[0]; io[4] = v3[1]; io[5] = v3[2]; };
  self.toLocalQ = () => {
    const dx = io[0] - self.x, dy = io[1] - self.y, dz = io[2] - self.z;
    io[3] = R[0] * dx + R[1] * dy + R[2] * dz; io[4] = R[3] * dx + R[4] * dy + R[5] * dz; io[5] = R[6] * dx + R[7] * dy + R[8] * dz;
  };
  /** Body-local of world (x, y, z) → out. */
  self.toLocal = (x, y, z, out) => {
    const dx = x - self.x, dy = y - self.y, dz = z - self.z;
    out[0] = R[0] * dx + R[1] * dy + R[2] * dz; out[1] = R[3] * dx + R[4] * dy + R[5] * dz; out[2] = R[6] * dx + R[7] * dy + R[8] * dz;
    return out;
  };

  function legsIK() {
    const s = self;
    for (let k = 0; k < LEGS; k++) {
      Q[3] = SIDE[k] * HIP_X; Q[4] = HIP_Y; Q[5] = HIP_Z[k]; toWorld();
      const Hx = v3[0], Hy = v3[1], Hz = v3[2];
      hx[k] = Hx; hy[k] = Hy; hz[k] = Hz;
      let dx = fx[k] - Hx, dy = fy[k] - Hy, dz = fz[k] - Hz;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      // Pole: up and outward (an insect's knee); at rest the knee lies out low (it has lain down).
      const outx = R[0] * SIDE[k], outz = R[2] * SIDE[k];
      const lie = s.state === WK.RELEASE || s.state === WK.RESTED ? s.rel : 0;
      let px = outx * (0.85 + 0.35 * lie), py = 0.55 - 0.5 * lie, pz = outz * (0.85 + 0.35 * lie);
      const pd = px * ux + py * uy + pz * uz; px -= ux * pd; py -= uy * pd; pz -= uz * pd;
      const pl = Math.sqrt(px * px + py * py + pz * pz) || 1; px /= pl; py /= pl; pz /= pl;
      d = clamp(d, LOWER - UPPER + 0.05, UPPER + LOWER - 0.05);
      const a = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
      kx[k] = Hx + ux * a + px * h; ky[k] = Hy + uy * a + py * h; kz[k] = Hz + uz * a + pz * h;
      // The kneeling leg: its knee on the ground, outward of the hip.
      if (k === s.kneelLeg && (s.state === WK.STUMBLE || s.state === WK.KNEEL)) {
        const u = s.state === WK.STUMBLE ? ease(s.t / T.stumbleTime) : 1;
        const ox = R[0] * SIDE[k], oz = R[2] * SIDE[k], ol = Math.sqrt(ox * ox + oz * oz) || 1;
        Q[0] = Hx + ox / ol * 14; Q[1] = Hz + oz / ol * 14; gq();
        const gdy = Math.max(0.5, Hy - Q[2] - 1.6);
        const reach = Math.sqrt(Math.max(1, UPPER * UPPER - gdy * gdy));
        const gx = Hx + ox / ol * reach, gz = Hz + oz / ol * reach, gy = Hy - gdy;
        kx[k] += (gx - kx[k]) * u; ky[k] += (gy - ky[k]) * u; kz[k] += (gz - kz[k]) * u;
      }
    }
  }

  /** Bone b's origin from v3 (the point last computed). */
  function originV3(b) { BO[b * 3] = v3[0]; BO[b * 3 + 1] = v3[1]; BO[b * 3 + 2] = v3[2]; }
  /** Bone b's basis: the body's (R), turned by Q[3] about its up (cos, sin in Q[3], Q[4]) — 1, 0 for none. */
  function bodyBasis(b) {
    const o = b * 9, c = Q[3], sn = Q[4];
    BE[o] = R[0] * c - R[6] * sn; BE[o + 1] = R[1] * c - R[7] * sn; BE[o + 2] = R[2] * c - R[8] * sn;
    BE[o + 3] = R[3]; BE[o + 4] = R[4]; BE[o + 5] = R[5];
    BE[o + 6] = R[0] * sn + R[6] * c; BE[o + 7] = R[1] * sn + R[7] * c; BE[o + 8] = R[2] * sn + R[8] * c;
  }
  /** Bone b upright on the ground facing the body's yaw (feet, the mound). */
  function yawBasis(b) {
    const o = b * 9, c = Math.cos(self.yaw), sn = Math.sin(self.yaw);
    BE[o] = c; BE[o + 1] = 0; BE[o + 2] = -sn; BE[o + 3] = 0; BE[o + 4] = 1; BE[o + 5] = 0; BE[o + 6] = sn; BE[o + 7] = 0; BE[o + 8] = c;
  }
  /** A segment bone from A (Q[10..12]) to B (Q[13..15]): Ey along it, Ez its top side (toward the sky), Ex across; its length → Q[16]. */
  function segment(b) {
    const ax = Q[10], ay = Q[11], az = Q[12];
    let ex = Q[13] - ax, ey = Q[14] - ay, ez = Q[15] - az; const L = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1; ex /= L; ey /= L; ez /= L;
    let tx2 = -ex * ey, ty2 = 1 - ey * ey, tz2 = -ez * ey; let tl = Math.sqrt(tx2 * tx2 + ty2 * ty2 + tz2 * tz2);
    if (tl < 1e-3) { tx2 = R[6]; ty2 = R[7]; tz2 = R[8]; tl = 1; }
    tx2 /= tl; ty2 /= tl; tz2 /= tl;
    const o = b * 9;
    BO[b * 3] = ax; BO[b * 3 + 1] = ay; BO[b * 3 + 2] = az;
    BE[o] = ey * tz2 - ez * ty2; BE[o + 1] = ez * tx2 - ex * tz2; BE[o + 2] = ex * ty2 - ey * tx2;
    BE[o + 3] = ex; BE[o + 4] = ey; BE[o + 5] = ez; BE[o + 6] = tx2; BE[o + 7] = ty2; BE[o + 8] = tz2;
    Q[16] = L;
  }
  const seg = (b, A, ia, B2, ib) => { Q[10] = A[ia]; Q[11] = A[ia + 1]; Q[12] = A[ia + 2]; Q[13] = B2[ib]; Q[14] = B2[ib + 1]; Q[15] = B2[ib + 2]; segment(b); };
  const P6 = new Float64Array(6);
  const hp = new Float64Array(3), np = new Float64Array(3), mp = new Float64Array(3);
  function bones() {
    const s = self;
    v3[0] = s.x; v3[1] = s.y; v3[2] = s.z; originV3(B_BODY); Q[3] = 1; Q[4] = 0; bodyBasis(B_BODY);
    for (let k = 0; k < LEGS; k++) {
      Q[10] = hx[k]; Q[11] = hy[k]; Q[12] = hz[k]; Q[13] = kx[k]; Q[14] = ky[k]; Q[15] = kz[k]; segment(B_UP + k);
      Q[10] = kx[k]; Q[11] = ky[k]; Q[12] = kz[k]; Q[13] = fx[k]; Q[14] = fy[k]; Q[15] = fz[k]; segment(B_LO + k);
      v3[0] = fx[k]; v3[1] = fy[k]; v3[2] = fz[k]; originV3(B_FOOT + k); yawBasis(B_FOOT + k);
    }
    // Neck root at the front of the hull; the head ahead of it — or, on release, lowered over the well.
    Q[3] = 0; Q[4] = -1.5; Q[5] = 18; toWorld(); np[0] = v3[0]; np[1] = v3[1]; np[2] = v3[2];
    Q[3] = 0; Q[4] = -0.8; Q[5] = 24.5; toWorld(); hp[0] = v3[0]; hp[1] = v3[1]; hp[2] = v3[2];
    let headPitch = 0;
    // The neck's middle: halfway — or, laying its head on the well, low through the gateway.
    mp[0] = (np[0] + hp[0]) * 0.5; mp[1] = (np[1] + hp[1]) * 0.5; mp[2] = (np[2] + hp[2]) * 0.5;
    if (s.state === WK.RELEASE || s.state === WK.RESTED) {
      const e = ease(s.rel * 2.2);
      const wx = s.wellX, wy = s.wellY + 2.2, wz = s.wellZ;
      hp[0] += (wx - hp[0]) * e; hp[2] += (wz - hp[2]) * e; hp[1] += (wy - hp[1]) * e;
      const gx = s.wellX + s.gateX * T.homeGate, gz = s.wellZ + s.gateZ * T.homeGate, gy = s.wellY + 3.4;
      const mx = (np[0] + hp[0]) * 0.5, my = (np[1] + hp[1]) * 0.5, mz = (np[2] + hp[2]) * 0.5;
      mp[0] = mx + (gx - mx) * e; mp[1] = my + (gy - my) * e; mp[2] = mz + (gz - mz) * e;
      headPitch = -0.5 * e;
    } else if (s.state === WK.KNEEL || s.state === WK.HOME) headPitch = -0.25;
    seg(B_NECK, np, 0, mp, 0); BY[B_NECK] = Q[16];
    seg(B_NECK2, mp, 0, hp, 0); BY[B_NECK2] = Q[16];
    // Head frame: the body's, pitched (a nod about its right axis).
    {
      const cp = Math.cos(headPitch), sp = Math.sin(headPitch), o = B_HEAD * 9;
      v3[0] = hp[0]; v3[1] = hp[1]; v3[2] = hp[2]; originV3(B_HEAD);
      BE[o] = R[0]; BE[o + 1] = R[1]; BE[o + 2] = R[2];
      BE[o + 3] = R[3] * cp - R[6] * sp; BE[o + 4] = R[4] * cp - R[7] * sp; BE[o + 5] = R[5] * cp - R[8] * sp;
      BE[o + 6] = R[6] * cp + R[3] * sp; BE[o + 7] = R[7] * cp + R[4] * sp; BE[o + 8] = R[8] * cp + R[5] * sp;
    }
    // Mirrors: on the roof, turned about the body's up by their yaw (Ez, the disc's face, = R·(sin, 0, cos)).
    for (let m = 0; m < 2; m++) {
      Q[3] = MIRRORS[m][0]; Q[4] = ROOF_Y + 0.8; Q[5] = MIRRORS[m][1]; toWorld(); originV3(B_MIR + m);
      const a = s.mirrorYaw[m]; Q[3] = Math.cos(a); Q[4] = Math.sin(a); bodyBasis(B_MIR + m);
    }
    // Mound: on the ground under the body, its own yaw, sinking away by `mound`.
    v3[0] = s.x; v3[1] = s._ground - (1 - s.mound) * 8; v3[2] = s.z; originV3(B_MOUND); yawBasis(B_MOUND);
    { const o = B_WORLD * 9; BO[B_WORLD * 3] = 0; BO[B_WORLD * 3 + 1] = 0; BO[B_WORLD * 3 + 2] = 0; for (let q = 0; q < 9; q++) BE[o + q] = q % 4 === 0 ? 1 : 0; }
    // Glow and alpha.
    glow[G_GLYPH0] = s.glyph0; glow[G_GLYPH1] = s.glyph1;
    glow[G_EYES] = s.state === WK.BURIED ? 0 : s.state === WK.RESTED ? 0.15 : 0.6 + 0.25 * Math.sin(s.time * 1.3);
    glow[G_WELLEYE] = s.wellEye; glow[G_BEAM] = 1.3;
    glow[G_PLATES] = s.state === WK.KNEEL || s.state === WK.STUMBLE ? 0.55 + 0.25 * Math.sin(s.time * 3) : 0;
    alpha[A_LEGS] = s.state === WK.BURIED || s.state === WK.WAKING && s.t < T.wakeTime * 0.18 ? 0 : 1;
    alpha[A_MOUND] = s.mound > 0.02 ? 1 : 0;
    alpha[A_BEAM0] = s.beam0 > 0.5 ? 1 : 0; alpha[A_BEAM1] = s.beam1 > 0.5 ? 1 : 0;
    alpha[A_BRAKE] = s.state === WK.BURIED || s.state === WK.WAKING && s.t < 2.5 ? 1 : 0;
    glow[G_BRAKE] = s.brake;
  }

  // Beam endpoints (world), set by beams().
  const m0 = new Float64Array(3), m1 = new Float64Array(3);
  function write() {
    const s = self;
    // The beam motes: mirror 0 → mirror 1 (BEAM0), mirror 1 → the well's eye (BEAM1), drifting along.
    for (let q = 0; q < 3; q++) { m0[q] = BO[(B_MIR) * 3 + q] + BE[(B_MIR) * 9 + 3 + q] * 1.75; m1[q] = BO[(B_MIR + 1) * 3 + q] + BE[(B_MIR + 1) * 9 + 3 + q] * 1.75; }
    for (let k = 0; k < BEAM0 + BEAM1; k++) {
      const i = beamStart + k, first = k < BEAM0, n = first ? BEAM0 : BEAM1, j = first ? k : k - BEAM0;
      const ax = first ? m0[0] : m1[0], ay = first ? m0[1] : m1[1], az = first ? m0[2] : m1[2];
      const bx2 = first ? m1[0] : s.wellX, by2 = first ? m1[1] : s.wellY, bz2 = first ? m1[2] : s.wellZ;
      const u = ((j + 0.5) / n + s.time * 0.15) % 1;
      cp[i * 3] = ax + (bx2 - ax) * u; cp[i * 3 + 1] = ay + (by2 - ay) * u; cp[i * 3 + 2] = az + (bz2 - az) * u;
      let dx = bx2 - ax, dy = by2 - ay, dz = bz2 - az; const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
      cf[i * 3] = dx; cf[i * 3 + 1] = dy; cf[i * 3 + 2] = dz;
      // Any up not along the beam.
      let ux = -dx * dy, uy = 1 - dy * dy, uz = -dz * dy; const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      cu[i * 3] = ux / ul; cu[i * 3 + 1] = uy / ul; cu[i * 3 + 2] = uz / ul;
      cs[i * 3 + 2] = Math.min(3, l / n * 0.8);
    }
    cp[eyeIdx * 3] = s.wellX; cp[eyeIdx * 3 + 1] = s.wellY; cp[eyeIdx * 3 + 2] = s.wellZ;
    for (let i = 0; i < N; i++) {
      const b = cb[i], bo = b * 3, be = b * 9, o = i * CHUNK_FLOATS, i3 = i * 3;
      const lx = cp[i3], ly = cp[i3 + 1] * BY[b], lz = cp[i3 + 2];
      chunks[o] = BO[bo] + BE[be] * lx + BE[be + 3] * ly + BE[be + 6] * lz;
      chunks[o + 1] = BO[bo + 1] + BE[be + 1] * lx + BE[be + 4] * ly + BE[be + 7] * lz;
      chunks[o + 2] = BO[bo + 2] + BE[be + 2] * lx + BE[be + 5] * ly + BE[be + 8] * lz;
      const f0 = cf[i3], f1 = cf[i3 + 1], f2 = cf[i3 + 2], u0 = cu[i3], u1 = cu[i3 + 1], u2 = cu[i3 + 2];
      chunks[o + 4] = BE[be] * f0 + BE[be + 3] * f1 + BE[be + 6] * f2;
      chunks[o + 5] = BE[be + 1] * f0 + BE[be + 4] * f1 + BE[be + 7] * f2;
      chunks[o + 6] = BE[be + 2] * f0 + BE[be + 5] * f1 + BE[be + 8] * f2;
      chunks[o + 8] = BE[be] * u0 + BE[be + 3] * u1 + BE[be + 6] * u2;
      chunks[o + 9] = BE[be + 1] * u0 + BE[be + 4] * u1 + BE[be + 7] * u2;
      chunks[o + 10] = BE[be + 2] * u0 + BE[be + 5] * u1 + BE[be + 8] * u2;
      chunks[o + 3] = cs[i3]; chunks[o + 7] = cs[i3 + 1]; chunks[o + 11] = cs[i3 + 2];
      chunks[o + 12] = cseed[i]; chunks[o + 13] = ck[i]; chunks[o + 14] = glow[cg[i]]; chunks[o + 15] = alpha[ca[i]];
    }
    // The kneeling leg's ramp: plates along the upper segment's top, from just beyond the knee to the hip.
    for (let q = 0; q < RAMP; q++) bon[ramp0 + q] = 0;
    const k = s.kneelLeg;
    if (k >= 0 && (s.state === WK.KNEEL || s.state === WK.RISE && s.t < 0.8)) rampBoxes(k);
  }

  const lk = new Float64Array(3), lh = new Float64Array(3), lg = new Float64Array(3);
  /** Body-local of world point v3 → out. */
  function localOf(out) {
    const dx = v3[0] - self.x, dy = v3[1] - self.y, dz = v3[2] - self.z;
    out[0] = R[0] * dx + R[1] * dy + R[2] * dz; out[1] = R[3] * dx + R[4] * dy + R[5] * dz; out[2] = R[6] * dx + R[7] * dy + R[8] * dz;
  }
  let rq = 0;
  /** Ramp plates from (P6[0..2]) to (P6[3..5]) (body frame: x, top, z), along the yaw Q[9]. */
  function rampRun() {
    const ax = P6[0], ay = P6[1], az = P6[2], bx2 = P6[3], by2 = P6[4], bz2 = P6[5], c = Math.cos(Q[9]), sn = Math.sin(Q[9]);
    const L = Math.sqrt((bx2 - ax) * (bx2 - ax) + (bz2 - az) * (bz2 - az)), n = Math.max(1, Math.ceil(Math.max(L / 0.8, Math.abs(by2 - ay) / 0.35)));
    for (let i = 1; i <= n && rq < RAMP; i++) {
      const t = i / n, j = ramp0 + rq++;
      bx[j] = ax + (bx2 - ax) * t; bz[j] = az + (bz2 - az) * t; by1[j] = ay + (by2 - ay) * t; by0[j] = by1[j] - 2.5;
      bhx[j] = 0.95; bhz[j] = Math.max(0.42, L / n * 0.55); bc[j] = c; bsn[j] = sn; bon[j] = 1;
    }
  }
  function rampBoxes(k) {
    v3[0] = kx[k]; v3[1] = ky[k]; v3[2] = kz[k]; localOf(lk);
    v3[0] = hx[k]; v3[1] = hy[k]; v3[2] = hz[k]; localOf(lh);
    // The ground just beyond the knee (where the climb starts), in the body's frame.
    const ox = lk[0] - lh[0], oz = lk[2] - lh[2], ol = Math.sqrt(ox * ox + oz * oz) || 1;
    Q[3] = lk[0] + ox / ol * 3.5; Q[4] = 0; Q[5] = lk[2] + oz / ol * 3.5; toWorld();
    Q[0] = v3[0]; Q[1] = v3[2]; gq(); v3[1] = Q[2]; localOf(lg);
    Q[9] = Math.atan2(ox, oz);
    // Polyline: ground beyond the knee (top 0.2) → over the knee (top 2.3) → along the leg to the flank's stair.
    rq = 0;
    P6[0] = lg[0]; P6[1] = lg[1] + 0.2; P6[2] = lg[2]; P6[3] = lk[0]; P6[4] = lk[1] + 2.3; P6[5] = lk[2]; rampRun();
    // (It ends at the flank's stair, just outside the hull, level with the stair's fourth plate.)
    P6[0] = lk[0]; P6[1] = lk[1] + 2.3; P6[2] = lk[2]; P6[3] = SIDE[k] * 12.9; P6[4] = -2.2; P6[5] = lh[2]; rampRun();
  }

  return self;
}
