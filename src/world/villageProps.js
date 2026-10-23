// The meadow village's life: the stone arch bridge, the windmill, drystone field walls and the little
// things that make a plot look lived in (back gardens, woodpiles, barrels, crates, baskets of produce,
// carts, hay, washing lines, benches, a trough at the well). Pure geometry on architecture.js's Builder;
// everything is varied from seeds only, so a plot always builds the same.
//
// Frames. A prop builder `(b, facing) => void` works in the PLOT's frame: (s, f) = metres right of / in
// front of the plot centre (front = the street side, the same convention as village.js), y = 0 is the
// site's seat. `plotProps(plot, meta)` returns the builder for one plot (or null) and is appended to the
// kit's own build, so the props share the plot's site (there are few site slots: ARCH_SITES).
//
// Materials. The village has no plant or paint materials: gardens are EARTH beds, bean poles and stakes;
// produce is read from the baskets themselves (THATCH = grain and straw, EARTH = roots, CANVAS = cloth
// and sacks); flower boxes are left out for lack of a plant material.
//
// Collision. Props are non-solid (a Wraith brushes past them) except what is big or fence-like: carts,
// troughs, garden fences, walls, the bridge parapets and the mill tower.

import { MAT, NS, rot, cloth, millSails } from './architecture.js';
import { stick } from './camp.js';
import { layWall } from './masonry.js';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rng(seed) {
  let s = (Math.imul((seed | 0) ^ 0x7f4a7c15, 0x85ebca6b) >>> 0) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  next(); next(); next();
  return next;
}

/** Plot-frame drawing helpers over a Builder. `salt` offsets the material seeds (the shader varies pieces by seed). */
function kit(b, facing, seed0) {
  const P = rot(facing), c = Math.cos(facing), s = Math.sin(facing);
  let sd = seed0;
  const S = () => sd++;
  const k = {
    P, S, facing, yawOf: (y) => facing + y,
    xz: (a, f) => { const p = P(a, 0, f); return [p[0], p[2]]; },
    /** Plain box: centre (a, f), half sizes (ha along s, hf along f), yaw relative to the plot. */
    box(a, f, y0, y1, ha, hf, yaw, mat, o = {}) { const [x, z] = k.xz(a, f); b.box(x, z, y0, y1, ha, hf, facing + yaw, mat, S(), { plain: true, solid: false, ...NS, ...o }); },
    drum(a, f, y0, y1, r0, r1, n, mat, o = {}) { const [x, z] = k.xz(a, f); b.drum(x, z, y0, y1, r0, r1, n, mat, S(), { solid: false, ...o }); },
    cone(a, f, y0, y1, r, n, mat, o = {}) { const [x, z] = k.xz(a, f); b.cone(x, z, y0, y1, r, n, mat, S(), { solid: false, ...o }); },
    stk(p0, p1, ra, rb, n, mat) { stick(b, P(...p0), P(...p1), ra, rb, n, mat, S()); },
    /** A blocker box in the plot frame (yaw relative). */
    block(a, f, ha, hf, y0, y1, yaw = 0) { const [x, z] = k.xz(a, f), y = facing + yaw; b.blockers.push({ site: b.site, kind: 'box', x, z, hx: ha + 0.03, hz: hf + 0.03, cos: Math.cos(y), sin: Math.sin(y), y0, y1 }); },
    ring(a, f, r, y0, y1) { const [x, z] = k.xz(a, f); b.blockers.push({ site: b.site, kind: 'circle', x, z, r, y0, y1 }); },
  };
  void c; void s;
  return k;
}

// ─── small things ────────────────────────────────────────────────────────────────────────────
function crate(k, a, f, size, h, yaw, mat = MAT.WOOD) { k.box(a, f, 0, h, size, size * 0.8, yaw, mat); }
function crateStack(k, a, f, r) {
  const n = 1 + Math.floor(r() * 3), sz = 0.27 + r() * 0.06;
  for (let i = 0; i < n; i++) {
    const row = i === 2 ? 1 : 0, dx = (i === 1 ? 0.62 : 0) * sz * 1.9;
    crate(k, a + dx, f, sz, 0.36 + (row ? 0 : 0), (r() - 0.5) * 0.4);
    if (row) crate(k, a + sz * 0.9, f, sz * 0.9, 0.34, (r() - 0.5) * 0.5);
  }
  if (n === 3) k.box(a + 0.3, f, 0.36, 0.72, 0.24, 0.2, 0.2, MAT.WOOD);
}
function barrel(k, a, f, h = 0.85, solid = true) {
  k.drum(a, f, 0, h, 0.3, 0.3, 8, MAT.WOOD, { solid });
  for (const hy of [0.16, h - 0.17]) k.drum(a, f, hy, hy + 0.05, 0.315, 0.315, 8, MAT.IRON);
}
function sack(k, a, f, r, lean = 0) {
  const h = 0.6 + r() * 0.2;
  k.drum(a, f, 0, h, 0.3 + r() * 0.04, 0.19, 6, MAT.CANVAS);
  k.drum(a, f, h, h + 0.1, 0.19, 0.12, 6, MAT.CANVAS);
  void lean;
}
const PRODUCE = [MAT.THATCH, MAT.EARTH, MAT.CANVAS, MAT.THATCH];
/** A woven basket heaped with produce (grain, roots or cloth). */
function basket(k, a, f, r, mat = PRODUCE[Math.floor(r() * PRODUCE.length)]) {
  const rb = 0.24 + r() * 0.06;
  k.drum(a, f, 0, 0.3, rb, rb + 0.07, 8, MAT.WOOD);
  k.cone(a, f, 0.27, 0.27 + 0.18 + r() * 0.1, rb + 0.02, 8, mat);
}
/** Logs `lie` along the drum's own yaw, so a pile is drawn along the plot's f axis through this wrapper. */
function logs(b, k, a, f, rows, len, yawRel) {
  const r0 = 0.1, [x0, z0] = k.xz(a, f), yaw = k.facing + yawRel, ca = Math.cos(yaw), sa = Math.sin(yaw);
  for (let row = 0; row < rows; row++) for (let i = 0; i < rows - row + 1; i++) {
    const off = (i - (rows - row) / 2) * r0 * 2.05;
    b.drum(x0 + off * ca, z0 - off * sa, row * r0 * 1.8, row * r0 * 1.8 + len, r0 * 0.95, r0, 6, MAT.WOOD, k.S(), { lie: 1, yaw, solid: false });
  }
  b.blockers.push({ site: b.site, kind: 'box', x: x0, z: z0, hx: (rows + 1) * r0, hz: len / 2, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: 0, y1: rows * r0 * 1.8 });
}
function bench(k, a, f, yaw, len = 0.9) {
  k.box(a, f, 0.42, 0.48, len, 0.2, yaw, MAT.PLANK);
  for (const sg of [-1, 1]) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    k.box(a + sg * len * 0.75 * ca, f - sg * len * 0.75 * sa, 0, 0.42, 0.05, 0.17, yaw, MAT.WOOD);
  }
}
function haystack(k, a, f, rad, hgt) {
  k.drum(a, f, 0, hgt * 0.45, rad, rad * 0.97, 10, MAT.THATCH);
  k.cone(a, f, hgt * 0.45, hgt, rad * 1.02, 10, MAT.THATCH);
}
function hayBale(k, a, f, yaw, up = 0) { k.box(a, f, up, up + 0.42, 0.46, 0.34, yaw, MAT.THATCH); }
/** A two-wheeled hand/hay cart standing on its shafts: yaw relative to the plot; hay heap optional. */
function cart(b, k, a, f, yaw, hay, r) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), W = hay ? 0.8 : 0.55, L = hay ? 1.5 : 1.0;
  const at = (u, v) => [a + u * ca + v * sa, f - u * sa + v * ca];
  const bedY = 0.55;
  { const [x, z] = at(0, 0); k.box(x, z, bedY, bedY + 0.07, W, L, yaw, MAT.PLANK); }
  for (const sg of [-1, 1]) { const [x, z] = at(sg * W, 0); k.box(x, z, bedY + 0.07, bedY + 0.55, 0.035, L, yaw, MAT.PLANK); }
  { const [x, z] = at(0, -L); k.box(x, z, bedY + 0.07, bedY + 0.5, W, 0.035, yaw, MAT.PLANK); }
  const wr = hay ? 0.5 : 0.4;
  for (const sg of [-1, 1]) {
    const [x, z] = at(sg * (W + 0.1), 0.1), [wx, wz] = k.xz(x, z);
    b.drum(wx, wz, -0.05, 0.05, wr, wr, 12, MAT.WOOD, k.S(), { lie: 1, yaw: k.yawOf(yaw + PI / 2), solid: false });
    b.drum(wx, wz, -0.04, 0.04, wr * 0.22, wr * 0.22, 6, MAT.IRON, k.S(), { lie: 1, yaw: k.yawOf(yaw + PI / 2), solid: false });
  }
  for (const sg of [-1, 1]) { const p0 = at(sg * (W - 0.15), -0.3), p1 = at(sg * (W - 0.15), L + 1.2); k.stk([p0[0], bedY + 0.02, p0[1]], [p1[0], 0.55 - 0.45, p1[1]], 0.04, 0.035, 5, MAT.WOOD); }
  if (hay) { const [x, z] = at(0, 0); k.drum(x, z, bedY + 0.07, bedY + 0.62, W * 0.95, W * 0.8, 9, MAT.THATCH); k.cone(x, z, bedY + 0.6, bedY + 1.25, W * 0.85, 9, MAT.THATCH); }
  else { const [x, z] = at(0, -0.2); crate(k, x, z, 0.32, 0.4, yaw); basket(k, ...at(0.1, 0.45), r); }
  { const [x, z] = at(0, 0); k.block(x, z, W + 0.1, L, 0, 1.0, yaw); }
}
function trough(k, a, f, yaw, len = 0.95) {
  k.box(a, f, 0.0, 0.62, len, 0.3, yaw, MAT.WOOD, { solid: true });
  k.box(a, f, 0.45, 0.5, len - 0.1, 0.22, yaw, MAT.IRON);
}
/** A wattle hurdle or a post-and-rail fence run from (a0, f0) to (a1, f1); `hurdle` weaves it. */
function fenceRun(b, k, a0, f0, a1, f1, hurdle, r, gap) {
  const len = Math.hypot(a1 - a0, f1 - f0);
  if (len < 0.4) return;
  const yaw = Math.atan2(a1 - a0, f1 - f0), ux = Math.sin(yaw), uf = Math.cos(yaw);
  const pieces = gap ? [[0, gap[0]], [gap[1], len]] : [[0, len]];
  for (const [t0, t1] of pieces) {
    if (t1 - t0 < 0.4) continue;
    const n = Math.max(1, Math.round((t1 - t0) / (hurdle ? 1.1 : 1.7)));
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      k.box(a0 + ux * t, f0 + uf * t, -0.5, hurdle ? 1.15 : 1.2, 0.05, 0.05, yaw, MAT.WOOD);
    }
    const am = a0 + ux * (t0 + t1) / 2, fm = f0 + uf * (t0 + t1) / 2, hl = (t1 - t0) / 2;
    if (hurdle) {
      k.box(am, fm, 0.12, 1.0, 0.025, hl, yaw, MAT.WOOD);                      // the woven panel (one slab)
      for (const y of [0.3, 0.55, 0.8]) k.box(am, fm, y, y + 0.05, 0.045, hl, yaw, MAT.WOOD);          // weave ribs proud of it
    } else {
      for (const y of [0.42, 0.85]) k.box(am, fm, y, y + 0.1, 0.03, hl, yaw, MAT.WOOD);
    }
    const [x, z] = k.xz(am, fm), yy = k.yawOf(yaw);
    b.blockers.push({ site: b.site, kind: 'box', x, z, hx: 0.08, hz: hl, cos: Math.cos(yy), sin: Math.sin(yy), y0: 0, y1: 1.1 });
  }
  void r;
}

// ─── back garden ────────────────────────────────────────────────────────────────────────────
/** The garden behind a plot: a fence (post-and-rail or wattle hurdles), raised EARTH beds with their edging, bean
 *  poles, a water butt, sometimes a washing line, a woodpile or a haystack. `back` = plot f of the building's back
 *  wall; depth g beyond the plot's back edge (plot.garden). */
function garden(b, k, plot, back, r) {
  const g = plot.garden, f0 = -plot.d - g, f1 = back - 0.7, hw = plot.w - 0.3, hurdle = r() < 0.45;
  if (f1 - f0 < 2.2) return;
  // Fence: back and both sides; the side next to a neighbour keeps a gap by the house corner.
  fenceRun(b, k, -hw, f0, hw, f0, hurdle, r, null);
  const gapSide = r() < 0.5 ? -1 : 1;
  for (const sg of [-1, 1]) fenceRun(b, k, sg * hw, f0, sg * hw, f1, hurdle, r, sg === gapSide && f1 - f0 > 3.4 ? [f1 - f0 - 1.9, f1 - f0 - 0.6] : null);
  // Beds.
  const nb = clamp(Math.round((hw * 2 - 1.2) / 1.7), 2, 4), bl = f1 - f0 - 1.5, bedMat = [MAT.EARTH, MAT.EARTH, MAT.THATCH][Math.floor(r() * 3)];
  for (let i = 0; i < nb; i++) {
    const a = -hw + 0.9 + ((hw * 2 - 1.8) * (i + 0.5)) / nb, f = (f0 + 0.6 + f1 - 0.9) / 2 - 0.2 * r();
    if (r() < 0.12) continue;
    const half = bl / 2 * (0.7 + 0.3 * r());
    k.box(a, f, 0, 0.18, 0.4, half, 0, MAT.EARTH);
    for (const sg of [-1, 1]) k.box(a + sg * 0.43, f, 0, 0.26, 0.025, half, 0, MAT.WOOD);
    for (const sg of [-1, 1]) k.box(a, f + sg * (half + 0.02), 0, 0.26, 0.43, 0.025, 0, MAT.WOOD);
    // Rows: low ridges in the bed (the "crop"), and on every other bed a tripod of bean poles.
    for (const o of [-0.17, 0.17]) k.box(a + o, f, 0.18, 0.27, 0.06, half * 0.92, 0, bedMat);
    if (i % 2 === 0 && half > 1.2) {
      const fp = f + (r() - 0.5) * half;
      for (const sg of [-1, 1]) k.stk([a + sg * 0.34, 0.15, fp - 0.28], [a, 1.7, fp], 0.02, 0.012, 4, MAT.WOOD);
      k.stk([a, 0.15, fp + 0.34], [a, 1.7, fp], 0.02, 0.012, 4, MAT.WOOD);
    }
  }
  // Corner things, by seed.
  const corner = (sg) => [sg * (hw - 0.55), f0 + 0.6];
  if (r() < 0.6) { const [a, f] = corner(r() < 0.5 ? -1 : 1); barrel(k, a, f, 0.9, false); }
  if (r() < 0.4) { const sg = r() < 0.5 ? -1 : 1; logs(b, k, sg * (hw - 0.6), f0 + 1.9, 3, 1.0, 0); }
  if (r() < 0.25 && g > 4) haystack(k, (r() < 0.5 ? -1 : 1) * (hw - 1.1), f0 + 1.1, 0.8, 1.7);
  // Washing line: two poles across the garden, strips of CANVAS hung from the line.
  if (r() < 0.35 && f1 - f0 > 3.5) {
    const fl = f1 - 0.9 - r() * 0.8, a0 = -hw + 0.4, a1 = hw - 0.4;
    for (const a of [a0, a1]) { k.stk([a, -0.3, fl], [a, 2.2, fl], 0.045, 0.04, 5, MAT.WOOD); k.ring(a, fl, 0.08, 0, 2.2); }
    k.stk([a0, 2.12, fl], [a1, 2.0, fl], 0.008, 0.008, 3, MAT.CANVAS);
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (r() - 0.5) * 0.4) / n, a = a0 + (a1 - a0) * t, y = 2.12 - 0.12 * t, wd = 0.2 + r() * 0.12, ln = 0.5 + r() * 0.5;
      const p = (aa, yy, ff) => k.P(aa, yy, ff);
      b.quad(p(a + wd, y - ln, fl + 0.01), p(a - wd, y - ln, fl + 0.01), p(a - wd, y, fl), p(a + wd, y, fl), MAT.CANVAS, k.S());
      b.quad(p(a - wd, y - ln, fl - 0.01), p(a + wd, y - ln, fl - 0.01), p(a + wd, y, fl), p(a - wd, y, fl), MAT.CANVAS, k.S());
    }
  }
}

// ─── plots ──────────────────────────────────────────────────────────────────────────────────
/** Front-of-house dressing positions: a door at s = door.a, the building front at f = ff, `room` m of ground in front. */
function frontProps(b, k, plot, meta, r, ff, room, W) {
  const door = meta.door ? meta.door.a : 0, side = door > 0 ? -1 : 1;
  const shop = plot.kind === 'shop';
  const off = clamp(room - 0.25, 0.25, 0.9);
  if (shop && meta.shop) {
    const { a0, a1 } = meta.shop, n = 2 + Math.floor(r() * 3);
    // Produce under the awning, in front of the shop window: baskets, crates and sacks.
    for (let i = 0; i < n; i++) {
      const a = a0 + 0.4 + ((a1 - a0 - 0.8) * (i + r() * 0.5)) / n, f = ff + 0.45 + r() * 0.35;
      if (r() < 0.6) basket(k, a, f, r); else if (r() < 0.5) crateStack(k, a, f, r); else sack(k, a, f, r);
    }
    if (r() < 0.6) { k.box((a0 + a1) / 2, ff + 0.62, 0.55, 0.62, (a1 - a0) / 2 - 0.5, 0.26, 0, MAT.PLANK); for (const sg of [-1, 1]) k.box((a0 + a1) / 2 + sg * ((a1 - a0) / 2 - 0.7), ff + 0.62, 0, 0.55, 0.04, 0.2, 0, MAT.WOOD); }
  } else {
    if (r() < 0.4) bench(k, door + side * (0.95 + r() * 0.5), ff + 0.28, 0, 0.55 + r() * 0.2);
    if (r() < 0.35) barrel(k, door + side * (1.1 + r() * 0.9) * (r() < 0.5 ? 1 : -0.8), ff + 0.4, 0.85, false);
    if (r() < 0.25) { sack(k, door - side * 1.15, ff + 0.4, r); if (r() < 0.6) sack(k, door - side * 1.45, ff + 0.4, r); }
  }
  void off; void W;
}

/**
 * The prop builder for one plot, or null. `meta` is the kit's own meta (W, D, J, ox, oz, door, shop, lean).
 */
export function plotProps(plot, meta) {
  const kind = plot.kind;
  const seed = ((plot.seed | 0) ^ 0x51ed270b) >>> 0;
  const r = rng(seed);
  const build = (b, facing) => {
    const k = kit(b, facing, 7000 + (plot.seed % 2000) * 30);
    const D = meta ? meta.D : 2.5, oz = meta ? meta.oz || 0 : 0, J = meta ? meta.J || 0 : 0;
    const front = oz + D, back = oz - D, room = plot.d - front + 0.3, W = meta ? meta.W : plot.w - 0.5;
    const lived = kind === 'house' || kind === 'house2' || kind === 'shop' || kind === 'workshop';
    if (lived) {
      frontProps(b, k, plot, meta || {}, r, front, room, W);
      if (plot.garden >= 2.5) garden(b, k, plot, back, r);
      if (kind === 'workshop') {
        if (r() < 0.55) cart(b, k, (meta && meta.door && meta.door.a > 0 ? -1 : 1) * (W - 0.4), front + 1.4, (r() - 0.5) * 0.4, false, r);
        if (r() < 0.6) logs(b, k, (r() < 0.5 ? -1 : 1) * (W + 0.45), back + 1.1, 3, 1.0, PI / 2);
      } else if (!(meta && meta.lean) && r() < 0.4) {
        logs(b, k, (r() < 0.5 ? -1 : 1) * (W + 0.5), oz + (r() - 0.5) * D, 3, 1.1, 0);
      }
    } else if (kind === 'barn') {
      const sg = r() < 0.5 ? -1 : 1;
      if (r() < 0.65) haystack(k, sg * (plot.w + 0.4) * 0.8, back + 1.5, 1.2 + r() * 0.5, 2.3 + r());
      if (r() < 0.5) cart(b, k, -sg * (plot.w - 1.5) * 0.7, front + 1.8, (r() - 0.5) * 0.6, true, r);
      if (r() < 0.6) crateStack(k, sg * (W - 0.8), front + 0.5, r);
      for (let i = 0; i < 2; i++) if (r() < 0.6) hayBale(k, -sg * (W - 0.9 + i * 1.0), front + 0.55, (r() - 0.5) * 0.5, i * 0.0);
      if (r() < 0.6) barrel(k, -sg * (W + 0.1), front + 0.5, 0.85, false);
    } else if (kind === 'farm') {
      // The yard's extras: a cart with hay, a second stack, barrels and a woodpile at the house.
      if (r() < 0.8) cart(b, k, -(r() < 0.5 ? -1 : 1) * (plot.w - 1.3) * 0.35, back - 1.8, (r() - 0.5) * 0.5, true, r);
      if (r() < 0.6) barrel(k, (r() < 0.5 ? -1 : 1) * (W + 0.3), front - 0.4, 0.85, false);
      if (r() < 0.6) logs(b, k, (r() < 0.5 ? -1 : 1) * (W + 0.5), oz, 3, 1.1, 0);
      for (let i = 0; i < 3; i++) if (r() < 0.7) hayBale(k, (plot.w - 1.2) * (r() < 0.5 ? -1 : 1) * (0.3 + 0.6 * r()), back - 3 - r() * 2, (r() - 0.5) * 0.8);
    } else if (kind === 'well') {
      trough(k, 1.9, 0.3, PI / 2, 0.9);
      if (r() < 0.7) barrel(k, -1.8, 0.4, 0.85, false);
      sack(k, 1.2, -1.5, r);
    } else if (kind === 'stall') {
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const a = -0.95 + (1.9 * (i + 0.5)) / n + (r() - 0.5) * 0.2, f = plot.d + 0.25 + r() * 0.3;
        const t = r();
        if (t < 0.5) basket(k, a, f, r); else if (t < 0.8) crateStack(k, a, f, r); else sack(k, a, f, r);
      }
      if (r() < 0.6) basket(k, (r() < 0.5 ? -1 : 1) * 1.45, -0.2, r);
      if (r() < 0.5) barrel(k, (r() < 0.5 ? -1 : 1) * 1.6, -plot.d + 0.1, 0.8, false);
    } else if (kind === 'hall') {
      for (const sg of [-1, 1]) if (r() < 0.8) { bench(k, sg * 2.7, front + 0.6, PI / 2 * 0, 0.8); barrel(k, sg * 3.5, front + 0.4, 0.85, false); }
      if (r() < 0.6) crateStack(k, -(meta ? meta.W : 3) + 0.5, front + 0.5, r);
    }
    void J;
  };
  return build;
}

// ─── the stone arch bridge ──────────────────────────────────────────────────────────────────
/** The bridge for a baked `village.bridges` record: { id, at, yaw, len, width, eA, eB, seatY, wet }.
 *  Site-local: f along the bridge from -len/2 (end A) to +len/2 (end B), y = 0 the higher bank (eA, eB the
 *  deck-end heights above/below that). One or two segmental STONE arches (voussoir rings), a COBBLE deck over
 *  stepped platforms (walkable), STONE parapets with copings and end posts. */
export function bridgeSite(br) {
  const L = br.len, Wd = br.width, hw = Wd / 2, eA = br.eA, eB = br.eB;
  const build = (b, facing) => {
    const P = rot(facing), yaw2 = facing + PI / 2;
    let sd = 8000 + Math.round(L * 7);
    const S = () => sd++;
    const hump = clamp(0.055 * L, 0.8, 1.2);
    const dt = (f) => eA + (eB - eA) * (f + L / 2) / L + hump * (1 - (2 * f / L) * (2 * f / L));
    const at = (u, f) => { const p = P(u, 0, f); return [p[0], p[2]]; };
    /** A plain stone box across the whole width at f (half length hf), y0..y1. */
    const slab = (f, hf, y0, y1, hu, mat, o = {}) => { const [x, z] = at(0, f); b.box(x, z, y0, y1, hu, hf, facing, mat, S(), { plain: true, solid: false, ...NS, ...o }); };
    /** A box rolled in the (f, y) plane: centre (u, f, ym), half length hx along the slope, half thickness hy, half width hu. */
    const rolled = (u, f, ym, hx, hy, hu, roll, mat, o = {}) => { const [x, z] = at(u, f); b.box(x, z, ym - hy, ym + hy, hx, hu, yaw2, mat, S(), { plain: true, solid: false, roll, ...NS, ...o }); };
    const abut = L > 14 ? 3.2 : 2.8, nArch = L > 17 ? 2 : 1, pier = nArch === 2 ? 1.6 : 0, tr = 0.62;
    const sa = (L - 2 * abut - pier) / (2 * nArch);
    const arches = [];
    for (let i = 0; i < nArch; i++) {
      const fc = nArch === 1 ? 0 : (i ? 1 : -1) * (pier / 2 + sa), yc = dt(fc) - 0.5 - tr - 0.02;
      const rise = Math.min(sa, clamp(0.36 * 2 * sa, 1.3, 2.4)), R = (sa * sa + rise * rise) / (2 * rise), cy = yc - R;
      arches.push({ fc, yc, rise, R, cy, th: Math.asin(Math.min(1, sa / R)) });
    }
    // Voussoir rings.
    for (const A of arches) {
      const n = Math.max(7, Math.round(A.th * A.R * 2 / 0.62)), rm = A.R + tr / 2;
      for (let k = 0; k < n; k++) {
        const p0 = PI / 2 - A.th + (2 * A.th * k) / n, p1 = PI / 2 - A.th + (2 * A.th * (k + 1)) / n, pm = (p0 + p1) / 2;
        const f = A.fc + rm * Math.cos(pm), y = A.cy + rm * Math.sin(pm), hy = (rm * (p1 - p0)) / 2 * 1.03;
        const [x, z] = at(0, f);
        // Keystone a little taller; each stone its own seed (pale or dressed by the shader).
        b.box(x, z, y - hy, y + hy, tr / 2 + (k === (n >> 1) ? 0.06 : 0), hw + 0.05, yaw2, MAT.STONE, S(), { plain: true, solid: false, roll: PI - pm, ...NS });
      }
    }
    // Body: columns of masonry from the extrados (or deep in the banks) up to the deck's underside.
    const ns = Math.max(4, Math.round(L / 1.0)), ds = L / ns;
    for (let i = 0; i < ns; i++) {
      const f0 = -L / 2 + i * ds, f1 = f0 + ds, fm = (f0 + f1) / 2, top = dt(fm) - 0.5;
      let bot = -4.5 + Math.min(eA, eB);
      for (const A of arches) {
        if (fm > A.fc - sa + 0.001 && fm < A.fc + sa - 0.001) {
          const ex = (f) => A.cy + Math.sqrt(Math.max(0, (A.R + tr) * (A.R + tr) - (f - A.fc) * (f - A.fc)));
          bot = Math.min(ex(f0), ex(f1)) - 0.02;
        }
      }
      if (top - bot < 0.05) continue;
      const mid = bot > -3 && top - bot > 1.1 ? (bot + top) / 2 : null;
      if (mid == null) slab(fm, ds / 2 + 0.01, bot, top, hw, MAT.STONE);
      else { slab(fm, ds / 2 + 0.01, bot, mid, hw, MAT.STONE); slab(fm, ds / 2 + 0.01, mid, top, hw, MAT.STONE); }
    }
    // Cutwaters at the pier.
    if (nArch === 2) {
      const ys = Math.min(arches[0].yc - arches[0].rise, arches[1].yc - arches[1].rise);
      for (const sg of [-1, 1]) { const [x, z] = at(sg * (hw + 0.15), 0); b.box(x, z, ys - 3, ys + 0.5, 0.62, 0.62, facing + PI / 4, MAT.STONE, S(), { plain: true, solid: false, ...NS }); }
    }
    // Deck (COBBLE, rolled with the slope) over the walkable platform steps.
    const nd = Math.max(4, Math.round(L / 1.0)), dd = L / nd;
    for (let i = 0; i < nd; i++) {
      const f0 = -L / 2 + i * dd, f1 = f0 + dd, fm = (f0 + f1) / 2, sl = (dt(f1) - dt(f0)) / dd;
      rolled(0, fm, dt(fm) - 0.25, (dd / 2 + 0.02) * Math.sqrt(1 + sl * sl), 0.25, hw, -Math.atan(sl), MAT.COBBLE);
    }
    const np = Math.round(L / 0.5), dp = L / np;
    for (let i = 0; i < np; i++) {
      const fm = -L / 2 + (i + 0.5) * dp, [x, z] = at(0, fm);
      b.platforms.push({ site: b.site, x, z, hx: hw - 0.3, hz: dp / 2 + 0.03, cos: Math.cos(facing), sin: Math.sin(facing), top: dt(fm) });
    }
    // Parapets: rolled with the deck, a coping on top, an end post at each end; one long blocker each side.
    const np2 = Math.max(3, Math.round(L / 1.8)), dq = L / np2;
    for (const sg of [-1, 1]) {
      const u = sg * (hw - 0.25);
      for (let i = 0; i < np2; i++) {
        const f0 = -L / 2 + i * dq, f1 = f0 + dq, fm = (f0 + f1) / 2, sl = (dt(f1) - dt(f0)) / dq, hx = (dq / 2 + 0.02) * Math.sqrt(1 + sl * sl);
        rolled(u, fm, dt(fm) + 0.5, hx, 0.5, 0.25, -Math.atan(sl), MAT.STONE);
        rolled(u, fm, dt(fm) + 1.05, hx + 0.02, 0.06, 0.33, -Math.atan(sl), MAT.STONE);
      }
      for (const e of [-1, 1]) { const f = e * (L / 2 - 0.4), [x, z] = at(u, f); b.box(x, z, dt(f) - 0.6, dt(f) + 1.4, 0.38, 0.38, facing, MAT.STONE, S(), { plain: true, solid: false, ...NS }); b.box(x, z, dt(f) + 1.4, dt(f) + 1.52, 0.46, 0.46, facing, MAT.STONE, S(), { plain: true, solid: false, ...NS }); }
      const [x, z] = at(u, 0);
      b.blockers.push({ site: b.site, kind: 'box', x, z, hx: 0.3, hz: L / 2, cos: Math.cos(facing), sin: Math.sin(facing), y0: Math.min(eA, eB) - 1, y1: eA + hump + 1.2 });
    }
  };
  return { id: 'vil-' + br.id, at: [br.at[0], br.at[1]], facing: br.yaw, build, footprint: L / 2, seatAt: 'center', seatY: br.seatY, bridge: true };
}

// ─── the windmill ───────────────────────────────────────────────────────────────────────────
const MILLT = { r0: 3.5, r1: 2.6, h: 9.2, axle: 8.0, back: 3.45 };
/** The mill tower: a battered STONE drum, a plank door under a lintel with a step, slit windows, a gallery
 *  ring, a shingled cap, a tailpole to the ground, and sacks, barrels and a millstone at its foot. `facing` is the way the door looks. */
function millTower(b, facing, windYaw) {
  const P = rot(facing);
  let sd = 9000;
  const S = () => sd++;
  const rAt = (y) => MILLT.r0 - (MILLT.r0 - MILLT.r1) * y / MILLT.h;
  b.drum(0, 0, -2.0, MILLT.h, rAt(-2.0), MILLT.r1, 28, MAT.STONE, S(), { solid: false });
  b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: MILLT.r0 + 0.05, y0: -2, y1: MILLT.h });
  // Door: planks, iron straps, a stone lintel, a walkable step.
  { const [x, , z] = P(0, 0, rAt(1.1) + 0.04);
    b.box(x, z, 0, 2.2, 0.62, 0.12, facing, MAT.PLANK, S(), { plain: true, solid: false, ...NS });
    for (const y of [0.5, 1.6]) b.box(x, z, y, y + 0.06, 0.64, 0.15, facing, MAT.IRON, S(), { plain: true, solid: false, ...NS });
    const [lx, , lz] = P(0, 0, rAt(2.3) + 0.05);
    b.box(lx, lz, 2.2, 2.55, 0.95, 0.24, facing, MAT.STONE, S(), { plain: true, solid: false, ...NS });
    for (const sg of [-1, 1]) { const [jx, , jz] = P(sg * 0.74, 0, rAt(1.1) + 0.06); b.box(jx, jz, 0, 2.25, 0.12, 0.14, facing, MAT.STONE, S(), { plain: true, solid: false, ...NS }); }
    const [sx, , sz] = P(0, 0, rAt(0.1) + 0.75);
    b.box(sx, sz, -0.6, 0.16, 1.1, 0.85, facing, MAT.STONE, S(), { plain: true, solid: false, platform: true, ...NS });
    const [px, , pz] = P(1.9, 0, rAt(0.1) + 0.5), r2 = 0.55;
    b.box(px, pz, 0.0, 0.25, r2, r2 * 0.9, facing + 0.4, MAT.STONE, S(), { plain: true, solid: false, ...NS });
  }
  // Slit windows up the tower, a little stone frame each.
  for (const [ang, y] of [[0.9, 2.9], [-0.7, 4.5], [2.5, 3.7], [-2.3, 5.6], [PI - 0.2, 6.9], [1.8, 7.6]]) {
    const r = rAt(y) + 0.015, a = facing + ang;
    b.box(Math.sin(a) * r, Math.cos(a) * r, y, y + 0.85, 0.17, 0.04, a, MAT.IRON, S(), { plain: true, solid: false, ...NS });
    b.box(Math.sin(a) * (r + 0.01), Math.cos(a) * (r + 0.01), y - 0.1, y, 0.24, 0.07, a, MAT.STONE, S(), { plain: true, solid: false, ...NS });
  }
  // Gallery ring at the cap, cap, collar.
  b.drum(0, 0, MILLT.h - 0.14, MILLT.h + 0.06, 3.0, 3.0, 24, MAT.WOOD, S(), { solid: false });
  b.drum(0, 0, MILLT.h + 0.06, MILLT.h + 0.55, 2.8, 2.55, 20, MAT.SHINGLE, S(), { solid: false });
  b.cone(0, 0, MILLT.h + 0.5, MILLT.h + 3.1, 2.65, 20, MAT.SHINGLE, S(), { solid: false });
  b.drum(0, 0, MILLT.h + 3.05, MILLT.h + 3.25, 0.12, 0.05, 6, MAT.IRON, S(), { solid: false });
  // Tailpole: from the cap down to the ground, downwind of the sails (the sails face the way the wind comes from).
  { const wx = Math.sin(windYaw), wz = Math.cos(windYaw);
    stick(b, [wx * 2.2, MILLT.h - 0.4, wz * 2.2], [wx * 8.4, 0.55, wz * 8.4], 0.1, 0.085, 6, MAT.WOOD, S());
    stick(b, [wx * 8.4 - wz * 0.5, 0.5, wz * 8.4 + wx * 0.5], [wx * 8.4 + wz * 0.5, 0.5, wz * 8.4 - wx * 0.5], 0.07, 0.07, 5, MAT.WOOD, S());
    for (const sg of [-1, 1]) stick(b, [wx * 8.4 + wz * 0.45 * sg, 0, wz * 8.4 - wx * 0.45 * sg], [wx * 8.4 + wz * 0.45 * sg, 0.9, wz * 8.4 - wx * 0.45 * sg], 0.055, 0.05, 5, MAT.WOOD, S());
    b.blockers.push({ site: b.site, kind: 'circle', x: wx * 8.4, z: wz * 8.4, r: 0.15, y0: 0, y1: 0.9 }); }
  // Goods at the foot: sacks, a barrel, crates.
  const r = rng(77);
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.52 + 1.2, [x, , z] = P(a, 0, rAt(0.2) + 1.0 + (i % 2) * 0.3);
    b.drum(x, z, 0, 0.62 + 0.1 * r(), 0.3, 0.19, 6, MAT.CANVAS, S(), { solid: false });
  }
  { const [x, , z] = P(-1.6, 0, rAt(0.2) + 1.0); b.drum(x, z, 0, 0.85, 0.3, 0.3, 8, MAT.WOOD, S(), { solid: true }); }
  { const [x, , z] = P(-2.5, 0, rAt(0.2) + 0.7); b.box(x, z, 0, 0.4, 0.32, 0.26, facing + 0.3, MAT.WOOD, S(), { plain: true, solid: false, ...NS }); }
  // Lantern at the door.
  { const [x, , z] = P(1.35, 0, rAt(2.0) + 0.3);
    b.box(x, z, 1.9, 2.05, 0.07, 0.07, facing, MAT.IRON, S(), { plain: true, solid: false, ...NS });
    b.box(x, z, 1.93, 2.12, 0.045, 0.045, facing, MAT.EMBER, S(), { plain: true, solid: false, ...NS });
    b.light(x, 2.0, z, 7, 1.0, 0.6, 0.28, 1.0, 'lamp'); }
}

/** The windmill's two sites for a baked mill plot { at, facing, yt }: the tower (door toward the road) and the sails
 *  (`lift`/`spin` like the old hub's: rotate the site about `spin` through its origin to turn them). Both are seated at
 *  the plot's baked top so the axle meets the tower. `toward` = [x, z] the sails face (the market square). */
export function millSites(plot, toward) {
  const wy = toward ? Math.atan2(plot.at[0] - toward[0], plot.at[1] - toward[1]) : 1.71; // the wind blows from the square to the mill
  const sf = Math.sin(wy), cf = Math.cos(wy), seatY = plot.yt;
  return [
    { id: 'vil-mill', at: [plot.at[0], plot.at[1]], facing: plot.facing, build: (b, f) => millTower(b, f, wy), footprint: 3.4, seatAt: 'top', seatY, mill: true, plot },
    { id: 'vil-mill-sails', at: [plot.at[0] - sf * MILLT.back, plot.at[1] - cf * MILLT.back], facing: wy, build: millSails, footprint: 1, seatAt: 'center', seatY, lift: MILLT.axle, spin: [sf, 0, cf] },
  ];
}

// ─── drystone field walls ───────────────────────────────────────────────────────────────────
/** One site per farm's `village.walls` record { id, at, seatY, runs: [[[x, z, y]]] }, y baked above `seatY`. Each wall
 *  step is a laid STONE slab 0.55 m thick, 1.0 m above the ground, solid. */
export function wallSite(w) {
  const build = (b) => {
    let sd = 10000 + (w.id.length * 31);
    for (const run of w.runs) for (let i = 0; i + 1 < run.length; i++) {
      const [ax, az, ay] = run[i], [bx, bz, by] = run[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      const yaw = Math.atan2(dx, dz);
      const x = (ax + bx) / 2 - w.at[0], z = (az + bz) / 2 - w.at[1], yTop = (ay + by) / 2 + 1.0, yLow = Math.min(ay, by) - 0.5;
      b.box(x, z, yLow, yLow + 0.5, 0.3, len / 2 + 0.1, yaw, MAT.STONE, sd++, { plain: true, solid: false, ...NS });                       // footing, hidden in the ground
      layWall(b, x, z, yLow + 0.5, yTop, 0.27, len / 2 + 0.1, yaw, MAT.STONE, sd++, { course: 1.6, blockLen: 2.2, cap: false });
      b.box(x, z, yTop, yTop + 0.1, 0.33, len / 2 + 0.12, yaw, MAT.STONE, sd++, { plain: true, solid: false, ...NS });                      // coping
      b.blockers.push({ site: b.site, kind: 'box', x, z, hx: 0.3, hz: len / 2 + 0.1, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: yLow, y1: yTop + 0.1 });
    }
  };
  return { id: 'vil-' + w.id, at: [w.at[0], w.at[1]], facing: 0, build, footprint: 1, seatAt: 'center', seatY: w.seatY };
}

void TAU; void cloth;
