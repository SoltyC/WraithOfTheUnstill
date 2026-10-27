// Chunk rig for the Shaped (BRIEF §8.3 "clustered meshes made of material"): each creature is a
// cluster of material chunks — packed-snow lumps and ice shards — seeded per archetype and hung
// on the body's bones (spine segments, head, tail, upper and lower legs). Every frame it writes
// one record per chunk for the renderer. It also owns the two transitions:
//   rise   — chunks surface out of the snow, lowest-first, staggered, and settle into the body;
//   fall   — on death the chunks drop with their momentum, tumble, settle on the ground and
//            sink into the mound the body leaves (nothing pops out).
// Allocation-free per frame.

import { MAX_LEGS } from './body.js';
import { buildDune } from './rigDune.js';

// Bone kinds.
const SPINE = 0, HEAD = 1, TAIL = 2, UPPER = 3, LOWER = 4;
// Chunk kinds (shader): packed snow, ice shard, glowing core (telegraph light).
// Meadow kinds (4+) ride the same field: plaited sedge, turf sod, drystone, reed, seed-pod core
// (amber), awn (thin spike trailing back), root (thin dark strand hanging down).
export const CHUNK = { SNOW: 0, ICE: 1, CORE: 2, WATER: 3, SEDGE: 4, TURF: 5, STONE: 6, REED: 7, POD: 8, AWN: 9, ROOT: 10,
  /** Dune kinds (D9a, rigDune.js): packed sand, banded sandstone, carved ruin stone, a sandstone thorn. */
  SAND: 11, SANDSTONE: 12, RUIN: 13, THORN: 14 };
/** Floats per chunk record: (pos, sx), (fwd, sy), (up, sz), (seed, kind, glow, alpha). */
export const CHUNK_FLOATS = 16;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Build the chunk layout for an archetype (allocation is fine: once per archetype).
 * @param {import('./body.js').ShapedShape} sh
 * @param {number} count
 * @param {number} seed
 */
export function buildRig(sh, count, seed, opt = {}) {
  if (opt.variant === 'skitter' || opt.variant === 'plate') return buildDune(sh, count, seed, opt);
  if (opt.variant) return buildMeadow(sh, count, seed, opt);
  const r = mulberry(seed);
  // Proportions per archetype: torso girth and leg thickness (fractions of hip height), head
  // size, shards per segment.
  const G = opt.girth ?? 0.44, LW = opt.leg ?? 0.3, HS = opt.head ?? 0.42, SH = opt.shards ?? 1;
  const UN = opt.upperN ?? 3, LN = opt.lowerN ?? 2;
  const bone = new Uint8Array(count), index = new Uint8Array(count), kind = new Uint8Array(count);
  const off = new Float32Array(count * 3), size = new Float32Array(count * 3), cseed = new Float32Array(count), rise = new Float32Array(count);
  let n = 0;
  const add = (b, i, ox, oy, oz, sx, sy, sz, k) => {
    if (n >= count) return;
    bone[n] = b; index[n] = i; kind[n] = k;
    off[n * 3] = ox; off[n * 3 + 1] = oy; off[n * 3 + 2] = oz;
    size[n * 3] = sx; size[n * 3 + 1] = sy; size[n * 3 + 2] = sz;
    cseed[n] = r() * 1000; n++;
  };
  const S = sh.spine;
  // Torso: a few big overlapping lumps per segment (one mass, not gravel), heaviest at the
  // shoulders, a belly lump, a glowing core inside, and ice shards along the back.
  for (let i = 0; i < S - 1; i++) {
    const t = i / (S - 2);
    const girth = sh.hip * (G - 0.12 * G / 0.44 * t);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5 + r() * 0.5;
      add(SPINE, i, Math.cos(a) * girth * 0.32, Math.sin(a) * girth * 0.28 + girth * 0.1, (r() - 0.5) * sh.spacing * 0.4,
        girth * (1.15 + 0.3 * r()), girth * (1.0 + 0.25 * r()), sh.spacing * (1.3 + 0.4 * r()), CHUNK.SNOW);
    }
    add(SPINE, i, 0, -girth * 0.35, 0, girth * 1.05, girth * 0.7, sh.spacing * 1.2, CHUNK.SNOW);   // belly
    add(SPINE, i, 0, girth * 0.1, 0, girth * 0.8, girth * 0.75, sh.spacing * 0.9, CHUNK.CORE);
    for (let q = 0; q < SH; q++) add(SPINE, i, (r() - 0.5) * girth * 0.5, girth * 0.7, (r() - 0.5) * sh.spacing * 0.3, girth * 0.22, girth * (1.1 + 0.9 * r()), girth * 0.22, CHUNK.ICE);
    if (SH > 0 && r() < 0.6) add(SPINE, i, (r() - 0.5) * girth * 0.9, girth * 0.55, (r() - 0.5) * sh.spacing * 0.5, girth * 0.16, girth * (0.7 + 0.6 * r()), girth * 0.16, CHUNK.ICE);
  }
  // Head: a heavy blunt wedge, a jaw, an ice brow and a glowing core (the eye-less face).
  const hs = sh.hip * HS;
  add(HEAD, 0, 0, hs * 0.05, hs * 0.1, hs * 1.15, hs * 0.85, hs * 1.4, CHUNK.SNOW);
  add(HEAD, 0, 0, -hs * 0.3, hs * 0.35, hs * 0.85, hs * 0.5, hs * 1.1, CHUNK.SNOW);
  for (let k = 0; k < 2; k++) add(HEAD, 0, (k ? 1 : -1) * hs * 0.3, hs * 0.25, -hs * 0.2, hs * 0.65, hs * 0.65, hs * 0.8, CHUNK.SNOW);
  add(HEAD, 0, 0, hs * 0.42, hs * 0.25, hs * 0.75, hs * 0.22, hs * 0.85, CHUNK.ICE);
  add(HEAD, 0, 0, 0, hs * 0.45, hs * 0.45, hs * 0.4, hs * 0.45, CHUNK.CORE);
  // Tail: tapering overlapping lumps.
  for (let i = 0; i < sh.tail; i++) {
    const t = 1 - i / sh.tail, s = sh.hip * 0.26 * (0.35 + 0.65 * t);
    add(TAIL, i, 0, 0, 0, s, s * 0.9, sh.tailSpacing * 1.35, CHUNK.SNOW);
  }
  // Legs: thick, overlapping chunks along each segment, an ice claw at the foot.
  for (let l = 0; l < sh.legs.length; l++) {
    const leg = sh.legs[l], w = sh.hip * LW;
    for (let k = 0; k < UN; k++) {
      const f = (k + 0.5) / UN;
      add(UPPER, l, (r() - 0.5) * w * 0.3, (r() - 0.5) * w * 0.3, leg.upper * f, w * (1.15 - 0.3 * f) * (0.9 + 0.3 * r()), w * (1.05 - 0.3 * f) * (0.9 + 0.3 * r()), leg.upper * (opt.legOverlap ?? 2.3) / UN, CHUNK.SNOW);
    }
    for (let k = 0; k < LN; k++) {
      const f = (k + 0.5) / LN;
      add(LOWER, l, (r() - 0.5) * w * 0.25, (r() - 0.5) * w * 0.25, leg.lower * f, w * 0.78 * (0.9 + 0.3 * r()), w * 0.72 * (0.9 + 0.3 * r()), leg.lower * ((opt.legOverlap ?? 2.3) - 0.2) / LN, CHUNK.SNOW);
    }
    add(LOWER, l, 0, 0, leg.lower * 0.98, w * 0.8, w * 0.45, w * 1.3, CHUNK.ICE);
  }
  // Fill any remainder with extra torso lumps.
  while (n < count) {
    const i = Math.floor(r() * (S - 1)), girth = sh.hip * G * 0.86, a = r() * Math.PI * 2;
    add(SPINE, i, Math.cos(a) * girth * 0.45, Math.sin(a) * girth * 0.4, (r() - 0.5) * sh.spacing, girth * (0.55 + 0.3 * r()), girth * (0.5 + 0.3 * r()), girth * (0.6 + 0.3 * r()), CHUNK.SNOW);
  }
  // Rise order: lowest chunks (feet, belly) first, the back and shards last.
  for (let c = 0; c < count; c++) {
    const b = bone[c];
    rise[c] = (b === LOWER ? 0 : b === UPPER ? 0.15 : b === TAIL ? 0.45 : 0.3) + (kind[c] === CHUNK.ICE ? 0.25 : 0) + r() * 0.2;
  }
  return { count, bone, index, kind, off, size, cseed: cseed, rise };
}


/** Rise order shared by the meadow rigs: feet first, then body, tall spikes and slabs last. */
function riseOrder(count, bone, kind, r) {
  const rise = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const b = bone[c], k = kind[c];
    rise[c] = (b === LOWER ? 0 : b === UPPER ? 0.15 : b === TAIL ? 0.45 : 0.3) + (k === CHUNK.AWN || k === CHUNK.STONE ? 0.25 : 0) + r() * 0.2;
  }
  return rise;
}

/**
 * Meadow chunk layouts (opt.variant: 'sedge' | 'turf' | 'reed'), same record as the frost rig.
 * Spine chunks sit mid-segment (oz 0.5 × spacing toward the front joint). `needed` counts what
 * the design wanted; anything past `count` is dropped (tests keep needed ≤ count).
 */
function buildMeadow(sh, count, seed, opt) {
  const r = mulberry(seed);
  const bone = new Uint8Array(count), index = new Uint8Array(count), kind = new Uint8Array(count);
  const off = new Float32Array(count * 3), size = new Float32Array(count * 3), cseed = new Float32Array(count);
  let n = 0, needed = 0;
  const add = (b, i, ox, oy, oz, sx, sy, sz, k) => {
    needed++;
    if (n >= count) return;
    bone[n] = b; index[n] = i; kind[n] = k;
    off[n * 3] = ox; off[n * 3 + 1] = oy; off[n * 3 + 2] = oz;
    size[n * 3] = sx; size[n * 3 + 1] = sy; size[n * 3 + 2] = sz;
    cseed[n] = r() * 1000; n++;
  };
  const S = sh.spine, sp = sh.spacing, hip = sh.hip, v = opt.variant;
  const G = opt.girth ?? 0.3, girth = hip * G, hs = hip * (opt.head ?? 0.3), w = hip * (opt.leg ?? 0.1);
  const neck = Math.hypot(0.9 * sp, sh.headUp);   // the head bone's length
  const J = (a) => (r() - 0.5) * a;
  const legs = (upperKind, lowerKind, un, ln, foot) => {
    for (let l = 0; l < sh.legs.length; l++) {
      const leg = sh.legs[l], lw = w * (opt.legScale?.[leg.at === 0 ? 0 : 1] ?? 1);
      for (let k = 0; k < un; k++) {
        const f = (k + 0.5) / un;
        add(UPPER, l, J(lw * 0.3), J(lw * 0.3), leg.upper * f, lw * (1.2 - 0.3 * f) * (0.9 + 0.2 * r()), lw * (1.05 - 0.3 * f) * (0.9 + 0.2 * r()), leg.upper * 2.2 / un, upperKind);
      }
      for (let k = 0; k < ln; k++) {
        const f = (k + 0.5) / ln;
        add(LOWER, l, J(lw * 0.25), J(lw * 0.25), leg.lower * f, lw * 0.8 * (0.9 + 0.2 * r()), lw * 0.75 * (0.9 + 0.2 * r()), leg.lower * 2.0 / ln, lowerKind);
      }
      foot(l, leg, lw);
    }
  };

  if (v === 'sedge') {
    // Plaited sedge: long thin strands along the body, a ruff of awns at the neck, a pod core.
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5 + r() * 0.4;
        add(SPINE, i, Math.cos(a) * girth * 0.35, Math.sin(a) * girth * 0.3 + girth * 0.1, sp * 0.5 + J(sp * 0.2), girth * (0.7 + 0.2 * r()), girth * (0.6 + 0.2 * r()), sp * (1.9 + 0.4 * r()), CHUNK.SEDGE);
      }
      add(SPINE, i, 0, -girth * 0.35, sp * 0.5, girth * 0.9, girth * 0.5, sp * 1.6, CHUNK.SEDGE);
      add(SPINE, i, 0, girth * 0.05, sp * 0.5, girth * 0.55, girth * 0.55, sp * 0.5, CHUNK.POD);
      add(SPINE, i, J(girth * 0.5), girth * 0.75, sp * 0.5 + J(sp * 0.4), girth * 0.14, girth * (1 + 0.8 * r()), girth * 0.14, CHUNK.SEDGE);   // seed-head
    }
    for (let k = 0; k < 8; k++) {   // the ruff
      const a = (k / 8) * Math.PI * 2 + J(0.3);
      add(SPINE, 0, Math.cos(a) * girth * 0.65, Math.sin(a) * girth * 0.65, sp * 0.85, 0.05, 0.05, sp * (1.0 + 0.3 * r()), CHUNK.AWN);
    }
    add(HEAD, 0, 0, 0, neck * 0.3, girth * 0.65, girth * 0.6, neck * 0.7, CHUNK.SEDGE);
    add(HEAD, 0, 0, 0, neck * 0.75, girth * 0.6, girth * 0.55, neck * 0.7, CHUNK.SEDGE);
    add(HEAD, 0, 0, 0, neck + hs * 0.2, hs * 0.8, hs * 0.7, hs * 1.1, CHUNK.SEDGE);
    add(HEAD, 0, 0, -hs * 0.1, neck + hs * 0.85, hs * 0.5, hs * 0.4, hs * 0.9, CHUNK.SEDGE);
    add(HEAD, 0, 0, hs * 0.2, neck + hs * 0.3, hs * 0.3, hs * 0.3, hs * 0.3, CHUNK.POD);
    for (let k = 0; k < 2; k++) add(HEAD, 0, (k ? 1 : -1) * hs * 0.25, hs * 0.35, neck, 0.04, 0.04, hs * 1.2, CHUNK.AWN);
    for (let i = 0; i < sh.tail; i++) {
      const t = 1 - i / sh.tail, s = hip * 0.11 * (0.4 + 0.6 * t);
      add(TAIL, i, 0, 0, sh.tailSpacing * 0.4, s, s * 0.9, sh.tailSpacing * 1.4, CHUNK.SEDGE);
    }
    for (let k = 0; k < 2; k++) add(TAIL, sh.tail - 1, (k ? 1 : -1) * 0.02, 0.02, 0.05, 0.04, 0.04, 0.26, CHUNK.AWN);
    legs(CHUNK.SEDGE, CHUNK.SEDGE, 2, 2, (l, leg, lw) => add(LOWER, l, 0, 0, leg.lower * 0.98, lw, lw * 0.5, lw * 1.8, CHUNK.SEDGE));
    while (n < count) {
      const i = Math.floor(r() * (S - 1)), a = r() * Math.PI * 2;
      add(SPINE, i, Math.cos(a) * girth * 0.4, Math.sin(a) * girth * 0.35, sp * 0.5 + J(sp * 0.6), girth * (0.4 + 0.2 * r()), girth * (0.35 + 0.2 * r()), sp * (1.4 + 0.5 * r()), CHUNK.SEDGE);
    }
  } else if (v === 'turf') {
    // Turf mound: sods over drystone ribs and roots, a standing stone on the back, root-hands.
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5 + r() * 0.5;
        add(SPINE, i, Math.cos(a) * girth * 0.32, Math.sin(a) * girth * 0.28 + girth * 0.1, sp * 0.5 + J(sp * 0.4), girth * (1.15 + 0.3 * r()), girth * (1.0 + 0.25 * r()), sp * (1.3 + 0.4 * r()), CHUNK.TURF);
      }
      add(SPINE, i, 0, -girth * 0.35, sp * 0.5, girth * 1.05, girth * 0.7, sp * 1.2, CHUNK.TURF);
      add(SPINE, i, 0, girth * 0.1, sp * 0.5, girth * 0.6, girth * 0.55, sp * 0.6, CHUNK.POD);
      for (let q = 0; q < 2; q++) add(SPINE, i, (q ? 1 : -1) * girth * 0.55, -girth * 0.15, sp * 0.5, girth * 0.3, girth * 0.7, sp * 0.4, CHUNK.STONE);   // ribs
      for (let q = 0; q < 2; q++) add(SPINE, i, J(girth * 0.8), -girth * 0.75, sp * 0.5 + J(sp * 0.6), 0.06, 0.55 + 0.4 * r(), 0.06, CHUNK.ROOT);
    }
    add(SPINE, 0, 0, girth * 0.6, sp * 0.5, girth * 1.3, girth * 0.8, sp * 1.3, CHUNK.TURF);   // the hunch
    // The standing stone: a tall slab, buttress stones at its foot, a sod round the base.
    add(SPINE, 1, 0, girth * 1.2, sp * 0.5, girth * 1.0, girth * 1.7, girth * 0.5, CHUNK.STONE);
    for (let q = 0; q < 2; q++) add(SPINE, 1, (q ? 1 : -1) * girth * 0.45, girth * 0.75, sp * 0.5 + J(sp * 0.2), girth * 0.4, girth * 0.6, girth * 0.5, CHUNK.STONE);
    add(SPINE, 1, 0, girth * 0.85, sp * 0.5, girth * 1.3, girth * 0.3, girth * 0.9, CHUNK.TURF);
    add(SPINE, 1, girth * 0.1, girth * 2.0, sp * 0.5, girth * 0.5, girth * 0.3, girth * 0.35, CHUNK.STONE);   // leaning cap
    // Head: low, heavy, brow of root.
    add(HEAD, 0, 0, 0, neck * 0.4, girth * 0.8, girth * 0.7, neck * 0.9, CHUNK.TURF);
    add(HEAD, 0, 0, hs * 0.05, neck + hs * 0.1, hs * 1.3, hs * 1.0, hs * 1.3, CHUNK.TURF);
    add(HEAD, 0, 0, -hs * 0.4, neck + hs * 0.3, hs * 0.8, hs * 0.4, hs * 0.8, CHUNK.STONE);
    add(HEAD, 0, 0, hs * 0.1, neck + hs * 0.55, hs * 0.4, hs * 0.4, hs * 0.4, CHUNK.POD);
    for (let k = 0; k < 2; k++) add(HEAD, 0, (k ? 1 : -1) * hs * 0.45, hs * 0.2, neck + hs * 0.2, 0.07, hs * 0.9, 0.07, CHUNK.ROOT);
    legs(CHUNK.TURF, CHUNK.ROOT, 3, 2, (l, leg, lw) => {
      add(LOWER, l, 0, 0, leg.lower * 0.98, lw * 1.5, lw * 1.0, lw * 1.5, CHUNK.TURF);   // the fist
      const fingers = leg.at === 0 ? 3 : 2;
      for (let q = 0; q < fingers; q++) add(LOWER, l, (q - (fingers - 1) / 2) * lw * 0.55, -lw * 0.5, leg.lower * 1.0, lw * 0.2, lw * 0.9, lw * 0.2, CHUNK.ROOT);
    });
    for (let q = 0; n < count; q++) {   // remainder: sods on the back, hanging roots, rubble
      const i = Math.floor(r() * (S - 1)), a = r() * Math.PI * 2, m = q % 3;
      if (m === 0) add(SPINE, i, Math.cos(a) * girth * 0.45, Math.sin(a) * girth * 0.4 + girth * 0.1, sp * 0.5 + J(sp), girth * (0.5 + 0.3 * r()), girth * (0.45 + 0.3 * r()), girth * (0.6 + 0.3 * r()), CHUNK.TURF);
      else if (m === 1) add(SPINE, i, J(girth * 1.4), -girth * 0.6, sp * 0.5 + J(sp), 0.05, 0.5 + 0.5 * r(), 0.05, CHUNK.ROOT);
      else add(SPINE, i, Math.cos(a) * girth * 0.6, -girth * 0.1 + Math.sin(a) * girth * 0.2, sp * 0.5 + J(sp), girth * 0.3, girth * 0.3, girth * 0.35, CHUNK.STONE);
    }
  } else {
    // Reed: bundled stalks, a long upright neck with pods, a hollow bell-flower head.
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4 + r() * 0.4;
        add(SPINE, i, Math.cos(a) * girth * 0.35, Math.sin(a) * girth * 0.3 + girth * 0.1, sp * 0.5 + J(sp * 0.2), girth * (0.8 + 0.3 * r()), girth * (0.7 + 0.2 * r()), sp * (1.8 + 0.4 * r()), CHUNK.REED);
      }
      add(SPINE, i, 0, -girth * 0.35, sp * 0.5, girth * 0.9, girth * 0.55, sp * 1.5, CHUNK.REED);
      add(SPINE, i, 0, girth * 0.05, sp * 0.5, girth * 0.6, girth * 0.6, sp * 0.5, CHUNK.POD);
    }
    for (let i = 0; i < sh.tail; i++) add(TAIL, i, 0, 0, sh.tailSpacing * 0.5, 0.07, 0.07, 0.5, CHUNK.REED);
    for (let k = 0; k < 4; k++) for (let q = 0; q < 2; q++) {
      add(HEAD, 0, (q ? 1 : -1) * 0.035, 0, neck * (k + 0.5 + 0.25 * q) / 4, 0.13, 0.13, neck * 0.55, CHUNK.REED);
    }
    for (let k = 0; k < 3; k++) add(HEAD, 0, 0, 0.05, neck * (0.3 + 0.25 * k), 0.11, 0.11, 0.11, CHUNK.POD);
    // The bell: a pod at its throat, a narrow ring of petals and a flared one above.
    add(HEAD, 0, 0, 0, neck + 0.1, 0.2, 0.2, 0.2, CHUNK.POD);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      add(HEAD, 0, Math.cos(a) * 0.1, Math.sin(a) * 0.1, neck + 0.08, 0.12, 0.12, 0.34, CHUNK.REED);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      add(HEAD, 0, Math.cos(a) * 0.24, Math.sin(a) * 0.24, neck + 0.3, 0.16, 0.16, 0.3, CHUNK.REED);
    }
    legs(CHUNK.REED, CHUNK.REED, 4, 4, (l, leg, lw) => {
      add(LOWER, l, 0, lw * 1.2, leg.lower * 0.99, lw * 1.0, lw * 4, lw * 0.8, CHUNK.REED);
      for (let q = 0; q < 2; q++) add(LOWER, l, (q ? 1 : -1) * lw * 1.5, lw * 1.2, leg.lower * 0.99, lw * 0.9, lw * 3.5, lw * 0.8, CHUNK.REED);
    });
    while (n < count) {
      const i = Math.floor(r() * (S - 1)), a = r() * Math.PI * 2;
      add(SPINE, i, Math.cos(a) * girth * 0.4, Math.sin(a) * girth * 0.35, sp * 0.5 + J(sp * 0.6), girth * 0.5, girth * 0.45, sp * 1.2, CHUNK.REED);
    }
  }
  return { count, bone, index, kind, off, size, cseed, rise: riseOrder(count, bone, kind, r), needed };
}

/**
 * Per-creature transition state for the chunks (debris after death), plus the writer.
 * @param {ReturnType<typeof buildRig>} rig
 */
export function createRigState(rig) {
  const n = rig.count;
  return {
    rig,
    // Debris (after death): world position, velocity, rest flag.
    dx: new Float64Array(n), dy: new Float64Array(n), dz: new Float64Array(n),
    dvx: new Float64Array(n), dvy: new Float64Array(n), dvz: new Float64Array(n),
    /** Last bone frames written (for handing chunks to the debris simulation). */
    fwd: new Float64Array(n * 3), up: new Float64Array(n * 3),
    /** Dune extras (rigDune.js): the plate has come off (its chunks are the owner's debris), and the seams' fill 0..1 (a Gust blows them clear). */
    plateOff: false, seamK: 1, plateAge: 0,
  };
}

const _f = new Float64Array(3), _u = new Float64Array(3), _o = new Float64Array(3);

/** Bone frame for chunk c of body b → _o (origin), _f (forward, unit), _u (up, unit). */
function boneFrame(b, rig, c) {
  const kind = rig.bone[c], i = rig.index[c], sh = b.shape;
  let ax, ay, az, bx, by, bz;
  if (kind === SPINE) { ax = b.sx[i + 1]; ay = b.sy[i + 1]; az = b.sz[i + 1]; bx = b.sx[i]; by = b.sy[i]; bz = b.sz[i]; }
  else if (kind === HEAD) { ax = b.sx[0]; ay = b.sy[0]; az = b.sz[0]; bx = b.hx; by = b.hy; bz = b.hz; }
  else if (kind === TAIL) {
    bx = i === 0 ? b.sx[sh.spine - 1] : b.tx[i - 1]; by = i === 0 ? b.sy[sh.spine - 1] : b.ty[i - 1]; bz = i === 0 ? b.sz[sh.spine - 1] : b.tz[i - 1];
    ax = b.tx[i]; ay = b.ty[i]; az = b.tz[i];
    // Tail chunks sit at the joint, facing back along the tail.
    const tx = ax; ax = bx; bx = tx; const ty = ay; ay = by; by = ty; const tz = az; az = bz; bz = tz;
  } else if (kind === UPPER) { ax = b.px[i]; ay = b.py[i]; az = b.pz[i]; bx = b.kx[i]; by = b.ky[i]; bz = b.kz[i]; }
  else { ax = b.kx[i]; ay = b.ky[i]; az = b.kz[i]; bx = b.fx[i]; by = b.fy[i]; bz = b.fz[i]; }
  let fx = bx - ax, fy = by - ay, fz = bz - az;
  const len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1e-4;
  fx /= len; fy /= len; fz /= len;
  // Up: world up made perpendicular to the bone (legs: the body's forward instead).
  let ux = 0, uy = 1, uz = 0;
  if (kind === UPPER || kind === LOWER) { ux = Math.sin(b.heading); uy = 0; uz = Math.cos(b.heading); }
  const d = ux * fx + uy * fy + uz * fz; ux -= fx * d; uy -= fy * d; uz -= fz * d;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  _o[0] = ax; _o[1] = ay; _o[2] = az; _f[0] = fx; _f[1] = fy; _f[2] = fz; _u[0] = ux / ul; _u[1] = uy / ul; _u[2] = uz / ul;
}

/**
 * Write the chunk records of a living (or rising) body into out at record offset o.
 * @param {import('./body.js').ShapedBody} b
 * @param {ReturnType<typeof createRigState>} st
 * @param {Float32Array} out
 * @param {number} rec   first record index
 * @param {number} rise  0..1 spawn progress
 * @param {number} glow  0..1 telegraph light
 */
/** Hurt flash (0..1) rides in each record's kind as a fraction (kind + 0.45 × hurt). */
export function writeAlive(b, st, out, rec, rise, glow, hurt = 0) {
  const rig = st.rig;
  const dune = rig.plate1 > 0, sK = st.seamK;
  for (let c = 0; c < rig.count; c++) {
    if (dune && st.plateOff && c >= rig.plate0 && c < rig.plate1) continue;     // the plate is off: its chunks fly on their own (stepPlate)
    boneFrame(b, rig, c);
    const fx = _f[0], fy = _f[1], fz = _f[2], ux = _u[0], uy = _u[1], uz = _u[2];
    const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
    const ox = rig.off[c * 3], oy = rig.off[c * 3 + 1], oz = rig.off[c * 3 + 2];
    let x = _o[0] + rx * ox + ux * oy + fx * oz, y = _o[1] + ry * ox + uy * oy + fy * oz, z = _o[2] + rz * ox + uz * oy + fz * oz;
    // Rising: each chunk surfaces from below the snow along its own delayed curve.
    const k = Math.min(1, Math.max(0, (rise * 1.55 - rig.rise[c]) / 0.55));
    const e = k * k * (3 - 2 * k);
    y -= (1 - e) * 1.1;
    const o = (rec + c) * CHUNK_FLOATS;
    const sc = (0.35 + 0.65 * e) * (dune && c >= rig.seam0 && c < rig.seam1 ? sK : 1);
    out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = rig.size[c * 3] * sc;
    out[o + 4] = fx; out[o + 5] = fy; out[o + 6] = fz; out[o + 7] = rig.size[c * 3 + 1] * sc;
    out[o + 8] = ux; out[o + 9] = uy; out[o + 10] = uz; out[o + 11] = rig.size[c * 3 + 2] * sc;
    out[o + 12] = rig.cseed[c]; out[o + 13] = rig.kind[c] + 0.45 * hurt; out[o + 14] = glow; out[o + 15] = e > 0.01 ? 1 : 0;
    // Remember the frame and position for a death hand-off.
    st.fwd[c * 3] = fx; st.fwd[c * 3 + 1] = fy; st.fwd[c * 3 + 2] = fz;
    st.up[c * 3] = ux; st.up[c * 3 + 1] = uy; st.up[c * 3 + 2] = uz;
    st.dx[c] = x; st.dy[c] = y; st.dz[c] = z;
  }
}

/** Death: hand every chunk to the debris simulation with the body's momentum plus a burst. */
export function startFall(b, st, rnd, burst = 0) {
  const n = st.rig.count;
  for (let c = 0; c < n; c++) {
    st.dvx[c] = b.vx * 0.6 + (rnd() - 0.5) * 1.6;
    st.dvz[c] = b.vz * 0.6 + (rnd() - 0.5) * 1.6;
    st.dvy[c] = 0.4 + rnd() * 1.2;
    if (burst > 0) {
      // Shattered: every chunk blown out from the body's middle.
      const ex = st.dx[c] - b.sx[1], ey = st.dy[c] - b.sy[1], ez = st.dz[c] - b.sz[1], el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
      const v = burst * (0.6 + 0.8 * rnd());
      st.dvx[c] += ex / el * v; st.dvy[c] += Math.max(0, ey / el) * v + burst * 0.4; st.dvz[c] += ez / el * v;
    }
  }
}

/**
 * Debris step and write: chunks fall, bounce once or twice, slide to rest on the ground, then
 * sink into the snow (`sink` 0..1) and fade.
 */
export function writeFall(st, out, rec, dt, sink, ground) {
  const rig = st.rig;
  for (let c = 0; c < rig.count; c++) {
    if (st.plateOff && c >= rig.plate0 && c < rig.plate1) { out[(rec + c) * CHUNK_FLOATS + 15] = 0; continue; }
    st.dvy[c] -= 14 * dt;
    st.dx[c] += st.dvx[c] * dt; st.dy[c] += st.dvy[c] * dt; st.dz[c] += st.dvz[c] * dt;
    ground.qx = st.dx[c]; ground.qz = st.dz[c]; ground.sample();
    const rest = ground.h + rig.size[c * 3 + 1] * 0.35;
    if (st.dy[c] < rest) {
      st.dy[c] = rest;
      st.dvy[c] = st.dvy[c] < -1.5 ? -st.dvy[c] * 0.25 : 0;
      st.dvx[c] *= 0.7; st.dvz[c] *= 0.7;
    }
    const o = (rec + c) * CHUNK_FLOATS;
    const sc = 1 - 0.5 * sink;
    out[o] = st.dx[c]; out[o + 1] = st.dy[c] - sink * rig.size[c * 3 + 1] * 1.2; out[o + 2] = st.dz[c]; out[o + 3] = rig.size[c * 3] * sc;
    out[o + 4] = st.fwd[c * 3]; out[o + 5] = st.fwd[c * 3 + 1]; out[o + 6] = st.fwd[c * 3 + 2]; out[o + 7] = rig.size[c * 3 + 1] * sc;
    out[o + 8] = st.up[c * 3]; out[o + 9] = st.up[c * 3 + 1]; out[o + 10] = st.up[c * 3 + 2]; out[o + 11] = rig.size[c * 3 + 2] * sc;
    out[o + 12] = rig.cseed[c]; out[o + 13] = rig.kind[c]; out[o + 14] = 0; out[o + 15] = 1 - sink;
  }
}

/** Hide records (an empty slot). */
export function writeHidden(out, rec, count) {
  for (let c = 0; c < count; c++) out[(rec + c) * CHUNK_FLOATS + 15] = 0;
}

export { MAX_LEGS };
