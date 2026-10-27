// Dune Shaped chunk layouts (D9a): packed sand, banded sandstone and ruin fragments, in the same
// record as the frost and meadow rigs (rig.js dispatches here for variants 'skitter' and 'plate').
// Skitter: a low six-legged scuttler under a shell of sandstone slabs, a thorn tail, an amber core.
// Plate-back: a heavy scarab; a ruin-stone plate (slabs and a broken column) is its shell, and
// the packed-sand seams between the slabs are separate chunks (rig.seam0..seam1) that a Gust
// blows clear and the plate (rig.plate0..plate1) is the range that comes off when it is cracked.

// Bone kinds (as rig.js) and chunk kinds (CHUNK in rig.js; kept literal here to avoid a cycle).
const SPINE = 0, HEAD = 1, TAIL = 2, UPPER = 3, LOWER = 4;
const SAND = 11, SANDSTONE = 12, RUIN = 13, THORN = 14, POD = 8;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Feet first, then the body, slabs and spikes last (they rise out of the sand last). */
function riseOrder(count, bone, kind, r) {
  const rise = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const b = bone[c], k = kind[c];
    rise[c] = (b === LOWER ? 0 : b === UPPER ? 0.15 : b === TAIL ? 0.45 : 0.3) + (k === RUIN || k === THORN ? 0.25 : 0) + r() * 0.2;
  }
  return rise;
}

/** @param {any} sh shape  @param {number} count  @param {number} seed  @param {any} opt */
export function buildDune(sh, count, seed, opt) {
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
  const S = sh.spine, sp = sh.spacing, hip = sh.hip;
  const G = opt.girth ?? 0.4, girth = hip * G, hs = hip * (opt.head ?? 0.4), w = hip * (opt.leg ?? 0.1);
  const neck = Math.hypot(0.9 * sp, sh.headUp);
  const J = (a) => (r() - 0.5) * a;
  let plate0 = 0, plate1 = 0, seam0 = 0, seam1 = 0;
  const legs = (upperKind, lowerKind, un, ln, foot) => {
    for (let l = 0; l < sh.legs.length; l++) {
      const leg = sh.legs[l];
      for (let k = 0; k < un; k++) {
        const f = (k + 0.5) / un;
        add(UPPER, l, J(w * 0.3), J(w * 0.3), leg.upper * f, w * (1.2 - 0.3 * f) * (0.9 + 0.2 * r()), w * (1.05 - 0.3 * f) * (0.9 + 0.2 * r()), leg.upper * 2.2 / un, upperKind);
      }
      for (let k = 0; k < ln; k++) {
        const f = (k + 0.5) / ln;
        add(LOWER, l, J(w * 0.25), J(w * 0.25), leg.lower * f, w * 0.8 * (0.9 + 0.2 * r()), w * 0.75 * (0.9 + 0.2 * r()), leg.lower * 2.0 / ln, lowerKind);
      }
      foot(l, leg);
    }
  };

  if (opt.variant === 'skitter') {
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < 2; k++) add(SPINE, i, (k ? 1 : -1) * girth * 0.42, girth * 0.08, sp * 0.5 + J(sp * 0.2), girth * (0.95 + 0.25 * r()), girth * (0.85 + 0.2 * r()), sp * (1.3 + 0.3 * r()), SAND);
      add(SPINE, i, 0, -girth * 0.3, sp * 0.5, girth * 1.0, girth * 0.6, sp * 1.2, SAND);
      add(SPINE, i, 0, girth * 0.62, sp * 0.5, girth * 1.9, girth * 0.34, sp * 1.45, SANDSTONE);                 // the shell slab
      if (i === 1) add(SPINE, i, 0, girth * 0.05, sp * 0.5, girth * 0.7, girth * 0.6, sp * 0.6, POD);          // amber core
      add(SPINE, i, J(girth * 0.6), girth * 0.95, sp * 0.5 + J(sp * 0.4), girth * 0.2, girth * 0.7, girth * 0.2, THORN);
    }
    add(HEAD, 0, 0, 0, neck * 0.5, girth * 0.9, girth * 0.7, neck * 0.9, SAND);
    add(HEAD, 0, 0, hs * 0.05, neck + hs * 0.1, hs * 1.15, hs * 0.85, hs * 1.2, SAND);
    add(HEAD, 0, 0, hs * 0.55, neck + hs * 0.1, hs * 1.0, hs * 0.22, hs * 1.0, SANDSTONE);                      // brow plate
    for (let k = 0; k < 2; k++) add(HEAD, 0, (k ? 1 : -1) * hs * 0.5, -hs * 0.25, neck + hs * 0.65, hs * 0.2, hs * 0.2, hs * 0.9, SANDSTONE);   // mandibles
    for (let i = 0; i < sh.tail; i++) {
      const t = 1 - i / sh.tail, s = hip * 0.26 * (0.4 + 0.6 * t);
      add(TAIL, i, 0, i * 0.04, sh.tailSpacing * 0.4, s, s * 0.9, sh.tailSpacing * 1.4, SAND);
    }
    add(TAIL, sh.tail - 1, 0, 0.08, sh.tailSpacing * 1.0, 0.07, 0.07, 0.5, THORN);                                 // the stinger
    legs(SAND, SANDSTONE, 2, 2, (l, leg) => add(LOWER, l, 0, 0, leg.lower * 0.98, w * 0.9, w * 0.45, w * 1.6, THORN));
    while (n < count) {
      const i = Math.floor(r() * (S - 1)), a = r() * Math.PI * 2;
      add(SPINE, i, Math.cos(a) * girth * 0.5, Math.sin(a) * girth * 0.4, sp * 0.5 + J(sp * 0.6), girth * (0.5 + 0.2 * r()), girth * (0.45 + 0.2 * r()), girth * (0.6 + 0.2 * r()), SAND);
    }
  } else {
    // Plate-back. The body: heaped sand lumps, a sandstone belly, a core under the shell.
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5 + r() * 0.5;
        add(SPINE, i, Math.cos(a) * girth * 0.5, Math.sin(a) * girth * 0.28 + girth * 0.05, sp * 0.5 + J(sp * 0.3), girth * (1.1 + 0.3 * r()), girth * (0.95 + 0.25 * r()), sp * (1.2 + 0.4 * r()), SAND);
      }
      add(SPINE, i, 0, -girth * 0.4, sp * 0.5, girth * 1.7, girth * 0.7, sp * 1.1, SANDSTONE);
      add(SPINE, i, 0, girth * 0.2, sp * 0.5, girth * 0.9, girth * 0.7, sp * 0.6, POD);
    }
    // The plate: three overlapping ruin slabs (front, middle, rear), flanges either side, a carved
    // lintel across the front and a broken column stub standing on the rear slab.
    plate0 = n;
    for (let i = 0; i < S - 1; i++) {
      add(SPINE, i, 0, girth * 0.82, sp * 0.5, girth * 3.1, girth * 0.42, sp * 1.18, RUIN);
      for (let q = 0; q < 2; q++) add(SPINE, i, (q ? 1 : -1) * girth * 1.38, girth * 0.52, sp * 0.5 + J(sp * 0.1), girth * 0.75, girth * 0.36, sp * 1.05, RUIN);
    }
    add(SPINE, 0, 0, girth * 1.2, sp * 0.62, girth * 2.2, girth * 0.3, girth * 0.7, RUIN);                        // lintel
    add(SPINE, S - 2, girth * 0.25, girth * 1.5, sp * 0.45, girth * 0.7, girth * 1.3, girth * 0.7, RUIN);       // column stub
    add(SPINE, S - 2, -girth * 0.55, girth * 1.18, sp * 0.3, girth * 0.5, girth * 0.5, girth * 0.5, RUIN);      // fallen drum
    plate1 = n;
    // The seams: packed sand in the joins between slabs and round the rim. A Gust blows these clear.
    seam0 = n;
    for (let i = 0; i < S - 1; i++) {
      add(SPINE, i, 0, girth * 1.0, sp * 0.02, girth * 3.0, girth * 0.3, sp * 0.3, SAND);
      for (let q = 0; q < 2; q++) add(SPINE, i, (q ? 1 : -1) * girth * 1.78, girth * 0.58, sp * 0.5, girth * 0.35, girth * 0.4, sp * 1.05, SAND);
    }
    add(SPINE, 0, 0, girth * 1.0, sp * 1.02, girth * 3.0, girth * 0.3, sp * 0.3, SAND);
    seam1 = n;
    add(HEAD, 0, 0, 0, neck * 0.4, girth * 1.0, girth * 0.8, neck * 0.9, SAND);
    add(HEAD, 0, 0, hs * 0.05, neck + hs * 0.1, hs * 1.3, hs * 0.95, hs * 1.3, SAND);
    add(HEAD, 0, 0, hs * 0.65, neck + hs * 0.05, hs * 1.4, hs * 0.3, hs * 1.1, RUIN);                              // brow stone
    for (let k = 0; k < 2; k++) add(HEAD, 0, (k ? 1 : -1) * hs * 0.55, -hs * 0.3, neck + hs * 0.65, hs * 0.28, hs * 0.28, hs * 1.1, SANDSTONE);   // mandibles
    add(HEAD, 0, 0, hs * 0.1, neck + hs * 0.55, hs * 0.4, hs * 0.4, hs * 0.4, POD);
    legs(SANDSTONE, SAND, 3, 2, (l, leg) => add(LOWER, l, 0, 0, leg.lower * 0.98, w * 1.5, w * 0.8, w * 1.7, SANDSTONE));
    while (n < count) {
      const i = Math.floor(r() * (S - 1)), a = r() * Math.PI * 2;
      add(SPINE, i, Math.cos(a) * girth * 0.8, -girth * 0.1 + Math.sin(a) * girth * 0.3, sp * 0.5 + J(sp * 0.6), girth * (0.5 + 0.25 * r()), girth * (0.45 + 0.25 * r()), girth * (0.6 + 0.25 * r()), SAND);
    }
  }
  return { count, bone, index, kind, off, size, cseed, rise: riseOrder(count, bone, kind, r), needed, plate0, plate1, seam0, seam1 };
}
