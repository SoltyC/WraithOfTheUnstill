// The meadow village's building kits (docs/village/brief.md §6, materials §10): procedural, no meshes.
// Each kit is KITS[kind](plot) → (b, facing, R) => void, a site builder like architecture.js's `house`:
// site-local metres, y = 0 is the seat, the front (street side) looks along +f of rot(facing).
// plot = { kind, w, d (half extents, m), seed, district }. Everything varied by seed (dimensions,
// roof material and pitch, window layout, door side, framing pattern) is drawn from the plot seed
// alone — the builder's own R is ignored — so a kit builds identically every time.
//
// FRAMING. Timber is never painted on: a wall is a PLASTER (or PLANK / stone) infill box, and the
// frame is real WOOD geometry standing 3 cm proud of it (posts 5 cm): sill and wall-plate rails, a
// mid rail, studs (panels ~0.85 m, close studding ~0.42 m, or braced ~1.3 m + diagonal panel
// braces), and diagonal angle braces at every corner. Studs/rails are cheap three-face boxes
// (`Frame.tb`), diagonals are rolled plain boxes. Openings cut the wall into pieces (doors, shop
// fronts, stone-wall windows) or are dressed on it (windows: GLASS pane + frame + sill + shutters).
//
// FRAMES. `Frame` is a local wall/roof frame: a runs along the wall (or across a roof), c is out of
// it (or along the ridge), y up; `sub()` nests them, so walls, dormers, lean-tos and porches are all
// the same few calls.
//
// COLLISION. Walls are solid boxes; door gaps are 1.2 m wide and 2.15 m tall (floor 0.25 to 2.4)
// with no blocker across them; a PLANK/FLAG floor platform fills the interior (top 0.25); roofs are
// `solid: false` plus one camera-only blocker (`cam: true`) like the hub house. The door leaf stands
// ajar, non-solid.

import { MAT, NS, rot, stall as marketStall, cloth, lampPost } from './architecture.js';
import { stick } from './camp.js';

export { Builder, NS, rot, lampPost, stall, cloth } from './architecture.js';

const PI = Math.PI;
const FT = 1, FB = 2, FK = 4, FF = 8, FL = 16, FR = 32, FALL = 63;
const FLOOR = 0.25;                      // interior floor top (m above the seat)
const DOOR_H = 2.4;                      // door opening top (m above the seat): 2.15 m clear above the floor
const WALL_T = 0.32;                     // timber-and-plaster wall thickness
const STONE_T = 0.45;                    // stone wall thickness

function rng(seed) {
  let s = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  next(); next(); next();
  return next;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A local frame: origin (ox, oz) in the kit's (s right, f forward) plane, rotated by `al`. a runs
 *  along the wall, c is the outward normal (wall faces +c), y is up. */
class Frame {
  constructor(b, facing, ox, oz, al) {
    this.b = b; this.facing = facing; this.ox = ox; this.oz = oz; this.al = al;
    this.ca = Math.cos(al); this.sa = Math.sin(al); this.P = rot(facing);
  }
  sub(a, c, dal = 0) { return new Frame(this.b, this.facing, this.ox + a * this.ca + c * this.sa, this.oz - a * this.sa + c * this.ca, this.al + dal); }
  pt(a, y, c) { return this.P(this.ox + a * this.ca + c * this.sa, y, this.oz - a * this.sa + c * this.ca); }
  xz(a, c) { const p = this.pt(a, 0, c); return [p[0], p[2]]; }
  get yaw() { return this.facing + this.al; }
  /** A plain (24 vertex) box; `o` passes Builder.box options (solid, platform, roll, tilt, ...). */
  box(a0, a1, y0, y1, c0, c1, mat, seed, o = {}) {
    const [x, z] = this.xz((a0 + a1) / 2, (c0 + c1) / 2);
    this.b.box(x, z, y0, y1, (a1 - a0) / 2, (c1 - c0) / 2, this.yaw, mat, seed, { plain: true, solid: false, ...NS, ...o });
  }
  /** A timber box with only the faces in `faces` (FT top, FB bottom, FK back, FF front (+c), FL (-a), FR (+a)). */
  tb(a0, a1, y0, y1, c0, c1, mat, seed, faces = FALL) {
    const p = (a, y, c) => this.pt(a, y, c), q = (...v) => this.b.quad(...v, mat, seed);
    const k = [p(a0, y0, c0), p(a1, y0, c0), p(a1, y0, c1), p(a0, y0, c1), p(a0, y1, c0), p(a1, y1, c0), p(a1, y1, c1), p(a0, y1, c1)];
    if (faces & FT) q(k[4], k[5], k[6], k[7]);
    if (faces & FB) q(k[0], k[3], k[2], k[1]);
    if (faces & FK) q(k[0], k[1], k[5], k[4]);
    if (faces & FF) q(k[2], k[3], k[7], k[6]);
    if (faces & FL) q(k[3], k[0], k[4], k[7]);
    if (faces & FR) q(k[1], k[2], k[6], k[5]);
  }
  /** One flat quad facing +c at c, a0..a1 × y0..y1 (uv in metres along a, then up). */
  face(a0, a1, y0, y1, c, mat, seed, carve = 0) { this.b.quad(this.pt(a1, y0, c), this.pt(a0, y0, c), this.pt(a0, y1, c), this.pt(a1, y1, c), mat, seed, carve); }
  /** A blocker box (collision only). */
  block(a0, a1, y0, y1, c0, c1, extra = {}) {
    const [x, z] = this.xz((a0 + a1) / 2, (c0 + c1) / 2), yw = this.yaw;
    this.b.blockers.push({ site: this.b.site, kind: 'box', x, z, hx: (a1 - a0) / 2 + 0.03, hz: (c1 - c0) / 2 + 0.03, cos: Math.cos(yw), sin: Math.sin(yw), y0, y1, ...extra });
  }
  stk(p0, p1, ra, rb, n, mat, seed) { stick(this.b, this.pt(...p0), this.pt(...p1), ra, rb, n, mat, seed); }
  /** A rolled box in the (a, y) plane from (a0, y0) to (a1, y1): a brace or rafter, thickness `t`, depth c0..c1. */
  diag(a0, y0, a1, y1, t, c0, c1, mat, seed) {
    const am = (a0 + a1) / 2, ym = (y0 + y1) / 2, len = Math.hypot(a1 - a0, y1 - y0);
    const [x, z] = this.xz(am, (c0 + c1) / 2);
    this.b.box(x, z, ym - t / 2, ym + t / 2, len / 2, (c1 - c0) / 2, this.yaw, mat, seed, { plain: true, solid: false, roll: Math.atan2(y1 - y0, a1 - a0), ...NS });
  }
}

/** Free intervals of [lo, hi] (along a) not covered by openings overlapping y0..y1. */
function freeA(ops, lo, hi, y0, y1, pad = 0.04) {
  let iv = [[lo, hi]];
  for (const w of ops) {
    if (!(w.y0 < y1 && w.y1 > y0)) continue;
    const n = [];
    for (const [s, e] of iv) {
      if (w.a1 + pad <= s || w.a0 - pad >= e) { n.push([s, e]); continue; }
      if (w.a0 - pad > s) n.push([s, w.a0 - pad]);
      if (w.a1 + pad < e) n.push([w.a1 + pad, e]);
    }
    iv = n;
  }
  return iv.filter(([s, e]) => e - s > 0.1);
}
/** Free y intervals of [lo, hi] at position a (openings covering a removed). */
function freeY(ops, a, lo, hi, pad = 0.05) {
  let iv = [[lo, hi]];
  for (const w of ops) {
    if (a < w.a0 - pad || a > w.a1 + pad) continue;
    const n = [];
    for (const [s, e] of iv) {
      if (w.y1 <= s || w.y0 >= e) { n.push([s, e]); continue; }
      if (w.y0 > s) n.push([s, w.y0]);
      if (w.y1 < e) n.push([w.y1, e]);
    }
    iv = n;
  }
  return iv.filter(([s, e]) => e - s > 0.2);
}
/** Cut a wall span into pieces round the `cut` openings: emit(a0, a1, y0, y1). */
function cutPieces(A0, A1, yb, yt, ops, emit) {
  const cuts = ops.filter((o) => o.cut && o.y0 < yt).sort((p, q) => p.a0 - q.a0);
  let a = A0;
  for (const o of cuts) {
    if (o.a0 > a + 0.02) emit(a, o.a0, yb, yt);
    if (o.y0 > yb + 0.02) emit(o.a0, o.a1, yb, o.y0);
    if (o.y1 < yt - 0.02) emit(o.a0, o.a1, o.y1, yt);
    a = Math.max(a, o.a1);
  }
  if (A1 > a + 0.02) emit(a, A1, yb, yt);
}

/** A wall run: infill + the real timber frame. fr: wall frame (a along, c out, outer face at c = 0).
 *  o: { mat, ops, pattern 0 panels / 1 close studding / 2 braced / 3 battens, S (seed counter),
 *       stone, th, rails [y], gable {span, tan}, margin, noBraces }. */
function wallRun(fr, A0, A1, yb, yt, o) {
  const { ops = [], S, pattern = 0 } = o, mat = o.mat;
  const th = o.th || (o.stone ? STONE_T : WALL_T);
  if (o.stone) {
    cutPieces(A0, A1, yb, yt, ops.map((x) => ({ ...x, cut: true })), (a0, a1, y0, y1) => {
      // Below the seat the footing is one plain block (the shader draws its courses, carve 5); above it the wall is laid.
      const lay = (ya, yb2) => fr.box(a0, a1, ya, yb2, -th, 0, MAT.STONE, S(), { solid: true, plain: a1 - a0 < 0.6 || yb2 - ya < 0.5, course: o.course || 0.85 });
      if (y0 < -0.05) {
        const t = Math.min(y1, 0);
        fr.box(a0, a1, y0, t, -th, 0, MAT.STONE, S(), { solid: true, plain: true, carve: 5 });
        if (y1 - t > 0.05) lay(t, y1);
      } else lay(y0, y1);
    });
  } else {
    cutPieces(A0, A1, yb, yt, ops, (a0, a1, y0, y1) => fr.box(a0, a1, y0, y1, -th, 0, mat, S(), { solid: true }));
  }
  if (!o.stone) {
    const ST = 0.03, W = MAT.WOOD, hseg = (y0, y1, faces = FF | FT | FB) => { for (const [s, e] of freeA(ops, A0, A1, y0, y1)) fr.tb(s, e, y0, y1, 0, ST + 0.01, W, S(), faces); };
    hseg(yb, yb + 0.15, FF | FT);
    hseg(yt - 0.17, yt);
    for (const ry of o.rails || []) hseg(ry, ry + 0.12);
    const m = o.margin == null ? 0.22 : o.margin, len = (A1 - m) - (A0 + m);
    const sp = [0.85, 0.42, 1.3, 1.1][pattern], n = Math.max(1, Math.round(len / sp)), hw = pattern === 1 ? 0.045 : pattern === 3 ? 0.05 : 0.055;
    const studs = [];
    for (let k = 1; k < n; k++) studs.push(A0 + m + (k / n) * len);
    for (const a of studs) for (const [y0, y1] of freeY(ops, a, yb + 0.15, yt - 0.17)) fr.tb(a - hw, a + hw, y0, y1, 0, ST, W, S(), FF | FL | FR);
    if (pattern !== 3 && !o.noBraces) {
      // Angle braces from the corner posts down and inward; pattern 2 adds panel braces.
      const bh = Math.min(0.95, (yt - yb) * 0.4), t = 0.09;
      const clear = (a0, a1, y0, y1) => !ops.some((w) => w.a0 < a1 + 0.05 && w.a1 > a0 - 0.05 && w.y0 < y1 && w.y1 > y0);
      const top = yt - 0.17;
      for (const sg of [-1, 1]) {
        const ae = sg < 0 ? A0 + 0.1 : A1 - 0.1, ai = ae - sg * bh;
        if (clear(Math.min(ae, ai), Math.max(ae, ai), top - bh, top)) fr.diag(ae, top, ai, top - bh, t, -0.02, 0.03, W, S());
      }
      if (pattern === 2) {
        const pts = [A0 + m, ...studs, A1 - m];
        for (let i = 1; i < pts.length - 2; i++) {
          if (i % 2) continue;
          const a0 = pts[i] + 0.06, a1 = pts[i + 1] - 0.06, y0 = yb + 0.15, y1 = yt - 0.17;
          if (a1 - a0 > 0.5 && clear(a0, a1, y0, y1)) fr.diag(a0, i % 4 ? y1 : y0, a1, i % 4 ? y0 : y1, t, -0.02, 0.03, W, S());
        }
      }
    }
  }
  const g = o.gable;
  if (g) {
    const apex = yt + g.span * g.tan, gm = o.stone ? MAT.STONE : mat;
    fr.b.tri(fr.pt(-g.span, yt - 0.02, -0.02), fr.pt(g.span, yt - 0.02, -0.02), fr.pt(0, apex, -0.02), gm, S());
    if (!o.stone) {
      const W = MAT.WOOD, sp = o.pattern === 1 ? 0.45 : 0.85, n = Math.max(2, Math.round(2 * g.span / sp));
      for (let k = 1; k < n; k++) {
        const a = -g.span + (2 * g.span * k) / n, hgt = (g.span - Math.abs(a)) * g.tan - 0.12;
        if (hgt < 0.25) continue;
        for (const [y0, y1] of freeY(ops, a, yt, yt + hgt)) fr.tb(a - 0.05, a + 0.05, y0, y1, 0, 0.03, W, S(), FF | FL | FR);
      }
      const hc = g.span * g.tan * 0.45;       // collar
      fr.tb(-(g.span - hc / g.tan), g.span - hc / g.tan, yt + hc, yt + hc + 0.11, 0, 0.04, W, S(), FF | FT | FB);
    }
  }
}

/** A window dressed on a wall: GLASS panes (0.7 × 1.2 m each; the shader draws the quarry lattice),
 *  frame, sill board, PLANK shutters. w: { a (centre), y0 (frame bottom), np (panes wide), nv (panes high), shutters, rec (glass c) }. */
function dressWindow(fr, w, S) {
  const ww = w.np * 0.7, nv = w.nv || 1, hh = nv * 1.2, a0 = w.a - ww / 2 - 0.08, a1 = w.a + ww / 2 + 0.08, gy0 = w.y0 + 0.08, gy1 = gy0 + hh, rec = w.rec == null ? 0.012 : w.rec;
  for (let i = 0; i < w.np; i++) for (let j = 0; j < nv; j++) fr.face(w.a - ww / 2 + 0.7 * i, w.a - ww / 2 + 0.7 * (i + 1), gy0 + 1.2 * j, gy0 + 1.2 * (j + 1), rec, MAT.GLASS, S());
  const c0 = rec - 0.03, c1 = rec + 0.045;
  fr.tb(a0, a0 + 0.08, w.y0, gy1 + 0.08, c0, c1, MAT.WOOD, S(), FALL & ~FB & ~FK);
  fr.tb(a1 - 0.08, a1, w.y0, gy1 + 0.08, c0, c1, MAT.WOOD, S(), FALL & ~FB & ~FK);
  fr.tb(a0, a1, gy1, gy1 + 0.08, c0, c1, MAT.WOOD, S(), FF | FT | FB);
  fr.tb(a0 - 0.05, a1 + 0.05, w.y0 - 0.02, w.y0 + 0.08, c0, c1 + 0.08, MAT.WOOD, S(), FALL & ~FK);
  if (w.np > 1) fr.tb(w.a - 0.02, w.a + 0.02, gy0, gy1, rec - 0.01, rec + 0.03, MAT.WOOD, S(), FF);
  if (nv > 1) fr.tb(a0, a1, gy0 + 1.2 - 0.02, gy0 + 1.2 + 0.02, rec - 0.01, rec + 0.03, MAT.WOOD, S(), FF);
  if (w.shutters) {
    for (const sg of [-1, 1]) {
      const e = sg < 0 ? a0 - 0.02 : a1 + 0.02, f = e + sg * 0.36;
      fr.tb(Math.min(e, f), Math.max(e, f), w.y0 + 0.02, gy1 + 0.06, 0, 0.04, MAT.PLANK, S(), FF | FL | FR | FT);
    }
  }
}
/** The opening record of a window (for the wall run's studs and rails). */
function winOpen(w) {
  const ww = w.np * 0.7, nv = w.nv || 1;
  return { a0: w.a - ww / 2 - 0.1 - (w.shutters ? 0.38 : 0), a1: w.a + ww / 2 + 0.1 + (w.shutters ? 0.38 : 0), y0: w.y0 - 0.02, y1: w.y0 + 0.16 + nv * 1.2 + 0.08, win: w, cut: !!w.cut };
}

/** A hinged leaf of planks with iron strap hinges. hinge (ha, hc), dir the unit direction hinge → free end in (a, c). */
function leaf(fr, ha, hc, dA, dC, w, y0, y1, S) {
  const ang = Math.atan2(dC, dA), [x, z] = fr.xz(ha + dA * w / 2, hc + dC * w / 2), yaw = fr.yaw - ang;
  fr.b.box(x, z, y0, y1, w / 2, 0.04, yaw, MAT.PLANK, S(), { plain: true, solid: false, ...NS });
  for (const fy of [0.2, 0.78]) {
    const yy = y0 + (y1 - y0) * fy, [hx, hz] = fr.xz(ha + dA * w * 0.22, hc + dC * w * 0.22);
    fr.b.box(hx, hz, yy - 0.05, yy + 0.05, w * 0.22, 0.05, yaw, MAT.IRON, S(), { plain: true, solid: false, ...NS });
  }
  const [kx, kz] = fr.xz(ha + dA * w * 0.86, hc + dC * w * 0.86);
  fr.b.box(kx, kz, (y0 + y1) / 2 - 0.05, (y0 + y1) / 2 + 0.05, 0.04, 0.06, yaw, MAT.IRON, S(), { plain: true, solid: false, ...NS });
}

/** A lantern on an iron arm out from the wall (IRON cage, EMBER core) with its lamp light. */
function lantern(fr, a, y, S, withLight = true) {
  const I = MAT.IRON, c = 0.34;
  fr.tb(a - 0.015, a + 0.015, y + 0.2, y + 0.24, 0, c + 0.02, I, S(), FALL & ~FK);
  fr.tb(a - 0.07, a + 0.07, y - 0.11, y - 0.08, c - 0.07, c + 0.07, I, S());
  fr.tb(a - 0.08, a + 0.08, y + 0.13, y + 0.17, c - 0.08, c + 0.08, I, S());
  for (const [sa, sc] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fr.tb(a + sa * 0.065 - 0.008, a + sa * 0.065 + 0.008, y - 0.08, y + 0.13, c + sc * 0.065 - 0.008, c + sc * 0.065 + 0.008, I, S(), FF | FL | FR);
  fr.tb(a - 0.012, a + 0.012, y + 0.17, y + 0.2, c - 0.012, c + 0.012, I, S(), FF | FL | FR);
  fr.tb(a - 0.045, a + 0.045, y - 0.07, y + 0.12, c - 0.045, c + 0.045, MAT.EMBER, S());
  if (withLight) { const p = fr.pt(a, y + 0.02, c); fr.b.light(p[0], p[1], p[2], 7, 1.0, 0.6, 0.28, 0.7, 'lamp'); }
}

/** Door dressing: timber jambs and lintel beam, the stone step (walkable), the leaf (or two) left ajar,
 *  an optional lantern. g: the cut opening { a0, a1, y0, y1 }. */
function dressDoor(fr, g, S, o = {}) {
  const t = o.th || WALL_T, W = MAT.WOOD;
  if (!o.stone) {
    fr.tb(g.a0 - 0.12, g.a0 + 0.02, g.y0, g.y1 - 0.03, -t - 0.02, 0.06, W, S(), FALL & ~FB);
    fr.tb(g.a1 - 0.02, g.a1 + 0.12, g.y0, g.y1 - 0.03, -t - 0.02, 0.06, W, S(), FALL & ~FB);
  }
  if (!o.noLintel) fr.tb(g.a0 - 0.14, g.a1 + 0.14, g.y1 - 0.03, g.y1 + 0.17, -t - 0.02, 0.07, W, S());
  fr.box(g.a0 - 0.2, g.a1 + 0.2, -0.6, 0.14, 0.0, o.step || 0.85, MAT.STONE, S(), { platform: true });
  const w = g.a1 - g.a0, y0 = g.y0 + 0.02, y1 = g.y1 - 0.02;
  if (o.double) {
    const phi = o.open == null ? 1.25 : o.open;
    leaf(fr, g.a0, 0.05, Math.cos(phi), Math.sin(phi), w / 2 - 0.02, y0, y1, S);
    leaf(fr, g.a1, 0.05, -Math.cos(phi), Math.sin(phi), w / 2 - 0.02, y0, y1, S);
  } else {
    const phi = o.open == null ? 1.35 : o.open;
    leaf(fr, g.a1 - 0.02, -t + 0.04, -Math.cos(phi), -Math.sin(phi), w - 0.06, y0, y1, S);
  }
  if (o.lantern != null) lantern(fr, o.lantern, g.y1 - 0.35, S);
}

// ─── roofs ───────────────────────────────────────────────────────────────────────────────────
const ROOF = {
  [MAT.THATCH]: { th: 0.34, ove: 0.5, ovg: 0.35 },
  [MAT.SLATE]: { th: 0.09, ove: 0.4, ovg: 0.25 },
  [MAT.TILE]: { th: 0.11, ove: 0.4, ovg: 0.25 },
  [MAT.SHINGLE]: { th: 0.1, ove: 0.45, ovg: 0.28 },
};

/** A gabled roof on frame fr (a across the ridge, c along it): two slabs of `mat` over a wall plate at `y`
 *  (half span L at the wall line, c0..c1 the wall line along the ridge), rounded eaves and a rolled ridge
 *  (thatch), a ridge cap and barge boards (slate / tile / shingle), tie beams, a camera-only blocker. */
function roofGable(fr, o) {
  const { L, c0, c1, y, pitch, mat, S } = o;
  const rp = ROOF[mat], th = o.th || rp.th, ove = o.ove == null ? rp.ove : o.ove, ovg = o.ovg == null ? rp.ovg : o.ovg;
  const tn = Math.tan(pitch), cs = Math.cos(pitch), sn = Math.sin(pitch), hh = th / 2, E = L + ove, tc = th / cs;
  const yTip = y + tc - ove * tn, yRidge = y + tc + L * tn, run = Math.hypot(E, yRidge - yTip), cm = (c0 + c1) / 2;
  const thatch = mat === MAT.THATCH;
  for (const sg of [-1, 1]) {
    const am = sg * E / 2, ym = (yTip + yRidge) / 2, ca = am - sg * sn * hh, cy = ym - cs * hh;
    const [x, z] = fr.xz(ca, cm);
    fr.b.box(x, z, cy - hh, cy + hh, run / 2 + 0.04, (c1 - c0) / 2 + ovg, fr.yaw, mat, S(), { plain: true, roll: -sg * pitch, solid: false, ...NS });
    const yAt0 = yRidge - hh / cs, aTip = sg * (E - sn * hh), yTipC = yTip - cs * hh;
    for (const ce of [c0 - ovg, c1 + ovg]) {
      if (thatch) fr.stk([aTip, yTipC, ce], [0, yAt0, ce], hh * 0.95, hh * 0.9, 6, mat, S());
      else {
        const [bx, bz] = fr.xz(ca, ce);
        fr.b.box(bx, bz, cy - hh - 0.06, cy + hh + 0.06, run / 2 + 0.04, 0.025, fr.yaw, MAT.WOOD, S(), { plain: true, roll: -sg * pitch, solid: false, ...NS });
      }
    }
    if (thatch) fr.stk([aTip, yTipC + 0.02, c0 - ovg], [aTip, yTipC + 0.02, c1 + ovg], hh * 1.05, hh * 1.05, 7, mat, S());
  }
  if (thatch) fr.stk([0, yRidge + 0.05, c0 - ovg - 0.05], [0, yRidge + 0.05, c1 + ovg + 0.05], 0.2, 0.2, 7, mat, S());
  else fr.stk([0, yRidge + 0.03, c0 - ovg], [0, yRidge + 0.03, c1 + ovg], 0.1, 0.1, 6, mat, S());
  // Tie beams under the roof.
  const nb = Math.max(2, Math.round((c1 - c0) / 1.7));
  for (let k = 0; k <= nb; k++) { const c = c0 + 0.1 + (k / nb) * (c1 - c0 - 0.2); fr.tb(-L + 0.1, L - 0.1, y - 0.2, y - 0.08, c - 0.07, c + 0.07, MAT.WOOD, S(), FALL & ~FK); }
  const [bx, bz] = fr.xz(0, cm);
  fr.b.blockers.push({ site: fr.b.site, kind: 'box', x: bx, z: bz, hx: E + 0.1, hz: (c1 - c0) / 2 + ovg + 0.1, cos: Math.cos(fr.yaw), sin: Math.sin(fr.yaw), y0: y - 0.2, y1: yRidge + 0.35, cam: true });
  return { yTip, yRidge, E, tn, sn, cs, th };
}
function gableTri(fr, c, L, y, tn, mat, seed) { fr.b.tri(fr.pt(-L, y - 0.02, c), fr.pt(L, y - 0.02, c), fr.pt(0, y + L * tn, c), mat, seed); }

/** A dormer on side `sg` of a roof: a plaster box through the slope with its own gable roof and a window. */
function dormer(rf, rp, sg, cPos, mat, S) {
  const af = sg * (rp.E - 1.0), ys = rp.yTip + 1.0 * rp.tn, hf = 1.55, ydp = ys + hf;
  const d = rf.sub(af, cPos, sg > 0 ? PI / 2 : -PI / 2), Ld = hf / rp.tn + 0.2;
  d.box(-0.62, 0.62, ys - 0.45, ydp, -0.18, 0, MAT.PLASTER, S());
  for (const sx of [-1, 1]) {
    d.box(sx < 0 ? -0.62 : 0.56, sx < 0 ? -0.56 : 0.62, ys - 0.3, ydp, -Ld, 0, MAT.PLASTER, S());
    d.tb(sx < 0 ? -0.66 : 0.52, sx < 0 ? -0.52 : 0.66, ys - 0.1, ydp, -0.2, 0.05, MAT.WOOD, S(), FALL & ~FB);
  }
  d.tb(-0.66, 0.66, ydp - 0.14, ydp, -0.2, 0.06, MAT.WOOD, S());
  d.tb(-0.62, 0.62, ys - 0.05, ys + 0.06, -0.1, 0.06, MAT.WOOD, S(), FF | FT);
  dressWindow(d, { a: 0, y0: ys + 0.1, np: 1, shutters: false }, S);
  const th = Math.min(ROOF[mat].th, 0.2);
  roofGable(d, { L: 0.62, c0: -Ld, c1: 0, y: ydp, pitch: 0.7, mat, S, th, ove: 0.14, ovg: 0.18 });
  gableTri(d, -0.02, 0.62, ydp, Math.tan(0.7), MAT.PLASTER, S());
}

/** An open lean-to against a wall frame fr: roof sloping down to two posts. */
function leanTo(fr, aC, wid, dep, hB, hF, mat, S) {
  const tilt = Math.atan2(hB - hF, dep), len = Math.hypot(dep, hB - hF) + 0.35, hy = mat === MAT.THATCH ? 0.1 : 0.05;
  const [x, z] = fr.xz(aC, dep / 2 + 0.05), ym = (hB + hF) / 2 + hy + 0.05;
  fr.b.box(x, z, ym - hy, ym + hy, wid / 2 + 0.2, len / 2, fr.yaw, mat, S(), { plain: true, tilt, solid: false, ...NS });
  for (const sg of [-1, 1]) {
    const a = aC + sg * (wid / 2 - 0.08);
    fr.tb(a - 0.07, a + 0.07, 0, hF + 0.02, dep - 0.14, dep, MAT.WOOD, S(), FALL & ~FB);
    fr.block(a - 0.07, a + 0.07, 0, hF, dep - 0.14, dep);
    const [rx, rz] = fr.xz(a, dep / 2 + 0.05);
    fr.b.box(rx, rz, ym - hy - 0.12, ym - hy, 0.045, len / 2 - 0.1, fr.yaw, MAT.WOOD, S(), { plain: true, tilt, solid: false, ...NS });
  }
  fr.tb(aC - wid / 2, aC + wid / 2, hF - 0.14, hF + 0.02, dep - 0.1, dep, MAT.WOOD, S(), FF | FT | FB);
}

/** A stack of logs (lying along c) in rows of n, n-1, ... */
function woodpile(fr, a, c, rows, S, len = 1.1) {
  const r0 = 0.1;
  for (let row = 0; row < rows; row++) for (let k = 0; k < rows - row + 1; k++) {
    const aa = a + (k - (rows - row) / 2) * r0 * 2.05, [x, z] = fr.xz(aa, c);
    fr.b.drum(x, z, row * r0 * 1.8, row * r0 * 1.8 + len, r0 * 0.95, r0, 6, MAT.WOOD, S(), { lie: 1, yaw: fr.yaw + 0.05 * k, solid: false });
  }
  fr.block(a - (rows + 1) * r0, a + (rows + 1) * r0, 0, rows * r0 * 1.8, c - len / 2, c + len / 2);
}
function crate(fr, a, c, s, h, S, yaw = 0) {
  const [x, z] = fr.xz(a, c);
  fr.b.box(x, z, 0, h, s, s * 0.8, fr.yaw + yaw, MAT.WOOD, S(), { plain: true, ...NS, solid: true });
}
function barrel(fr, a, c, S, h = 0.85) {
  const [x, z] = fr.xz(a, c);
  fr.b.drum(x, z, 0, h, 0.3, 0.3, 8, MAT.WOOD, S());
  for (const hy of [0.16, h - 0.17]) fr.b.drum(x, z, hy, hy + 0.05, 0.315, 0.315, 8, MAT.IRON, S(), { solid: false });
}

// ─── planning ────────────────────────────────────────────────────────────────────────────────
const KIND_ID = { house: 1, house2: 2, shop: 3, workshop: 4, barn: 5, chapel: 6, hall: 7, well: 8, stall: 9, farm: 10 };
function seedRng(plot, salt = 0) { return rng((plot.seed | 0) * 7919 + (KIND_ID[plot.kind] || 0) * 104729 + salt * 31); }
function pickRoof(r, table) {
  let t = r() * table.reduce((s, e) => s + e[1], 0);
  for (const [m, w] of table) { t -= w; if (t <= 0) return m; }
  return table[0][0];
}
const mkOps = () => ({ g: { front: [], back: [], right: [], left: [] }, u: { front: [], back: [], right: [], left: [] } });
const WALLS = ['front', 'back', 'right', 'left'];
const isFB = (w) => w === 'front' || w === 'back';

/** Window centres along [lo, hi] avoiding intervals, at least `n` tried, greedy and shuffled by r. */
function slots(r, lo, hi, avoid, n, np) {
  const hw = np * 0.35 + 0.5, cand = [];
  for (let a = lo + hw + 0.45; a <= hi - hw - 0.45 + 1e-6; a += 0.7) if (!avoid.some(([x0, x1]) => a + hw > x0 && a - hw < x1)) cand.push(a);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const out = [];
  for (const a of cand) { if (out.length >= n) break; if (out.every((p) => Math.abs(p - a) > 2 * hw + 0.2)) out.push(a); }
  return out.sort((p, q) => p - q);
}
function bandHalf(o, band, wall) { return isFB(wall) ? o.W : (band === 'u' ? o.D + o.J / 2 : o.D); }
function addWindows(o, r, band, counts, opt) {
  const { np = 1, nv = 1, y0, shutterP = 0.7, cut = false, avoid = {}, npFor } = opt;
  const T = cut ? STONE_T : WALL_T;
  for (const wall of WALLS) {
    const n = counts[wall] || 0;
    if (!n) continue;
    const hl = bandHalf(o, band, wall), lo = isFB(wall) ? -hl : -(hl - T), hi = -lo;
    const av = (avoid[wall] || []).slice();
    for (const op of o.ops[band][wall]) av.push([op.a0 - 0.3, op.a1 + 0.3]);
    const npw = (npFor && npFor(wall)) || np;
    for (const a of slots(r, lo, hi, av, n, npw)) o.ops[band][wall].push(winOpen({ a, y0, np: npw, nv, shutters: !cut && r() < shutterP, cut }));
  }
}
/** Add the front door and return its record. */
function addDoor(o, a, w, stone, h = DOOR_H) {
  const g = { a0: a - w / 2, a1: a + w / 2, y0: stone ? -9 : FLOOR, fy: FLOOR, y1: h, cut: true, kind: 'door' };
  o.ops.g.front.push(g); o.door = { wall: 'front', a, w, y1: h, rec: g };
  return g;
}
/** An attic window in the gable of `wall` of the top band (if the roof is tall enough there). */
function addAttic(o, r, wall, np = 1) {
  const band = o.h1 ? 'u' : 'g', plateY = (o.foot + o.h0) + (o.h1 || 0), L = bandHalf(o, band, wall), tn = Math.tan(o.pitch);
  if ((L - np * 0.35 - 0.3) * tn < 1.95) return;
  o.ops[band][wall].push(winOpen({ a: 0, y0: plateY + 0.35, np, nv: 1, shutters: r() < 0.6, cut: false }));
}

// ─── the building ────────────────────────────────────────────────────────────────────────────
/** Build a framed building from a plan `o` (see the planners below); `extras(ctx)` adds the kind's own parts. */
function building(b, facing, o, extras) {
  const { W, D } = o, J = o.J || 0, foot = o.foot == null ? 0.45 : o.foot, h1 = o.h1 || 0;
  const root = new Frame(b, facing, o.ox || 0, o.oz || 0, 0);
  let sd = 100 + (o.seed % 3000) * 40;
  const S = () => sd++;
  const r2 = rng(o.seed * 17 + 5);
  const g1 = foot + o.h0, plateY = g1 + h1, stoneG = o.ground === 'stone', topBand = h1 ? 'u' : 'g', tn = Math.tan(o.pitch);
  const gF = { front: root.sub(0, D, 0), back: root.sub(0, -D, PI), right: root.sub(W, 0, PI / 2), left: root.sub(-W, 0, -PI / 2) };
  const uF = h1 ? { front: root.sub(0, D + J, 0), back: gF.back, right: root.sub(W, J / 2, PI / 2), left: root.sub(-W, J / 2, -PI / 2) } : null;
  const F = { g: gF, u: uF }, bands = h1 ? ['g', 'u'] : ['g'];
  // Walls with their frames.
  for (const band of bands) for (const w of WALLS) {
    const stone = band === 'g' && stoneG, th = stone ? STONE_T : WALL_T, hl = bandHalf(o, band, w), fb = isFB(w);
    const A0 = fb ? -hl : -(hl - th), A1 = -A0, yb = band === 'g' ? (stone ? -1.2 : foot) : g1, yt = band === 'g' ? g1 : plateY;
    const gable = band === topBand && (o.gableFront ? fb : !fb) ? { span: hl, tan: tn } : null;
    wallRun(F[band][w], A0, A1, yb, yt, {
      mat: band === 'g' ? o.gMat : o.uMat, ops: o.ops[band][w], pattern: o.pattern, S, stone, th, gable, course: o.course,
      rails: stone ? [] : band === 'g' ? (o.railsG || [foot + 0.6]) : [g1 + 0.35], margin: fb ? 0.22 : 0.12, noBraces: o.noBraces,
    });
  }
  // Corner posts (stone corners need none).
  const posts = (yb, yt, fFront) => {
    for (const sx of [-1, 1]) for (const [fz, fs] of [[-D, -1], [fFront, 1]]) {
      const a0 = sx < 0 ? -W - 0.05 : W - 0.2, a1 = sx < 0 ? -W + 0.2 : W + 0.05, c0 = fs < 0 ? fz - 0.05 : fz - 0.2, c1 = fs < 0 ? fz + 0.2 : fz + 0.05;
      root.tb(a0, a1, yb, yt, c0, c1, MAT.WOOD, S(), FALL & ~FB);
    }
  };
  if (!stoneG) posts(foot, g1, D);
  if (h1) posts(g1, plateY, D + J);
  // Plinth: the stone course under timber walls, with the door left open.
  if (!stoneG) {
    const dg = o.door ? [{ a0: o.door.rec.a0, a1: o.door.rec.a1, y0: -9, y1: 9, cut: true }] : [];
    for (const w of WALLS) {
      const fb = isFB(w), hl = bandHalf(o, 'g', w);
      cutPieces(fb ? -hl - 0.07 : -(hl - 0.3), fb ? hl + 0.07 : hl - 0.3, -1.2, foot, w === 'front' ? dg : [], (a0, a1, y0, y1) =>
        gF[w].box(a0, a1, y0, y1, -WALL_T, 0.07, MAT.STONE, S(), y0 < -0.05 ? { solid: true, plain: true, carve: 5 } : { solid: true, plain: a1 - a0 < 0.6 || y1 - y0 < 0.5, course: 0.85 }));
    }
  }
  // Jetty: joists, bressummer, soffit and corner brackets.
  if (h1 && J > 0) {
    root.box(-W, W, g1 - 0.16, g1, D, D + J, MAT.PLANK, S());
    root.tb(-W - 0.05, W + 0.05, g1 - 0.34, g1 + 0.02, D + J - 0.2, D + J + 0.05, MAT.WOOD, S(), FALL & ~FK);
    const nj = Math.max(3, Math.round(2 * W / 0.7));
    for (let k = 0; k <= nj; k++) { const a = -W + 0.15 + (k / nj) * (2 * W - 0.3); root.tb(a - 0.06, a + 0.06, g1 - 0.32, g1 - 0.16, D - 0.05, D + J - 0.2, MAT.WOOD, S(), FB | FL | FR); }
    for (const sx of [-1, 1]) {
      const fr = uF[sx > 0 ? 'right' : 'left'], sgn = sx > 0 ? -1 : 1, fo = J / 2;
      const aOf = (f) => sgn * (f - fo);
      fr.diag(aOf(D + J - 0.15), g1 - 0.34, aOf(D + 0.05), g1 - 1.05, 0.14, 0, 0.13, MAT.WOOD, S());
    }
  }
  // Interior: floor (walkable), ceiling under an upper floor, furniture hooks.
  const t = stoneG ? STONE_T : WALL_T;
  root.box(-W + t - 0.03, W - t + 0.03, -0.3, FLOOR, -D + t - 0.03, D - t + 0.03, o.floorMat || MAT.PLANK, S(), { platform: true });
  if (h1) root.box(-W + t, W - t, g1 - 0.2, g1, -D + t, D + J - t, MAT.PLANK, S());
  // Roof.
  const rf = o.gableFront ? root : root.sub(0, J / 2, PI / 2);
  const L = o.gableFront ? W : D + J / 2, c0 = o.gableFront ? -D : -W, c1 = o.gableFront ? D + J : W;
  const rp = roofGable(rf, { L, c0, c1, y: plateY, pitch: o.pitch, mat: o.roofMat, S, ove: o.ove, ovg: o.ovg, th: o.roofTh });
  // Chimney: an interior breast (the hearth) and a stack through the roof.
  if (o.chimney) {
    const se = o.chimney, cc = se > 0 ? c1 - 0.75 : c0 + 0.75, top = rp.yRidge + 0.95;
    rf.box(-0.75, 0.75, FLOOR, plateY + 0.05, cc - 0.4, cc + 0.4, MAT.STONE, S(), { solid: true });
    rf.box(-0.36, 0.36, plateY, top, cc - 0.3, cc + 0.3, MAT.STONE, S());
    rf.box(-0.46, 0.46, top, top + 0.14, cc - 0.4, cc + 0.4, MAT.STONE, S());
    rf.box(-0.55, 0.55, FLOOR + 0.9, FLOOR + 1.0, cc - 0.52, cc + 0.4, MAT.STONE, S());
    const fp = rf.sub(0, cc - se * 0.4, se > 0 ? PI : 0);       // the hearth opening on the breast's inner face
    fp.box(-0.38, 0.38, FLOOR, FLOOR + 0.85, -0.02, 0.0, MAT.IRON, S());
  }
  // Dormers, lean-to.
  for (const d of o.dormers || []) dormer(rf, rp, d.sg, d.c, o.roofMat, S);
  if (o.lean) {
    const fr = gF[o.lean.wall];
    leanTo(fr, o.lean.a, o.lean.w, o.lean.d, o.lean.hB, o.lean.hF, o.lean.mat || o.roofMat, S);
    woodpile(fr, o.lean.a - o.lean.w * 0.2, o.lean.d * 0.55, 3, S, 0.9);
    barrel(fr, o.lean.a + o.lean.w * 0.28, o.lean.d * 0.5, S, 0.75);
  }
  // Dressing: windows, doors, shopfront ...
  for (const band of bands) for (const w of WALLS) for (const op of o.ops[band][w]) {
    const fr = F[band][w], stone = band === 'g' && stoneG;
    if (op.win) dressWindow(fr, { ...op.win, rec: op.win.cut ? -0.2 : 0.012 }, S);
    else if (op.kind === 'door') {
      dressDoor(fr, { ...op, y0: op.fy }, S, { th: stone ? STONE_T : WALL_T, stone, double: o.doubleDoor, open: o.doorOpen, noLintel: o.noLintel, lantern: o.lantern != null ? o.lantern : undefined, step: o.step });
    } else if (op.kind === 'shopfront') {
      const t0 = WALL_T, W2 = MAT.WOOD;
      fr.tb(op.a0 - 0.14, op.a0 + 0.02, op.y0 - 0.05, op.y1 + 0.17, -t0 - 0.02, 0.07, W2, S(), FALL & ~FB);
      fr.tb(op.a1 - 0.02, op.a1 + 0.14, op.y0 - 0.05, op.y1 + 0.17, -t0 - 0.02, 0.07, W2, S(), FALL & ~FB);
      fr.tb(op.a0 - 0.14, op.a1 + 0.14, op.y1 - 0.03, op.y1 + 0.17, -t0 - 0.02, 0.07, W2, S());
      fr.tb(op.a0 - 0.1, op.a1 + 0.1, op.y0 - 0.06, op.y0 + 0.04, -0.1, 0.42, W2, S(), FALL & ~FK);
      fr.tb(op.a0 - 0.14, op.a1 + 0.14, op.y0 - 0.5, op.y0 - 0.06, 0.0, 0.05, MAT.PLANK, S(), FF | FT);
      for (const sg of [-1, 1]) { const e = sg < 0 ? op.a0 : op.a1; fr.tb(Math.min(e, e + sg * 0.03), Math.max(e, e + sg * 0.03), op.y0, op.y1, 0.05, 0.6, MAT.PLANK, S(), FALL & ~FK & ~FB); }
      fr.box(op.a0 + 0.2, op.a1 - 0.2, FLOOR, op.y0 - 0.1, -0.95, -0.55, MAT.WOOD, S(), { solid: true });   // the counter inside
    } else if (op.kind === 'loft') {
      const c0b = -0.04, W2 = MAT.WOOD;
      fr.face(op.a0, op.a1, op.y0, op.y1, 0.01, MAT.IRON, S());
      fr.tb(op.a0 - 0.1, op.a0, op.y0 - 0.1, op.y1 + 0.1, c0b, 0.07, W2, S(), FALL & ~FB & ~FK);
      fr.tb(op.a1, op.a1 + 0.1, op.y0 - 0.1, op.y1 + 0.1, c0b, 0.07, W2, S(), FALL & ~FB & ~FK);
      fr.tb(op.a0 - 0.1, op.a1 + 0.1, op.y1, op.y1 + 0.1, c0b, 0.07, W2, S());
      fr.tb(op.a0 - 0.1, op.a1 + 0.1, op.y0 - 0.1, op.y0, c0b, 0.1, W2, S());
      const ac = (op.a0 + op.a1) / 2;      // hoist beam and hook
      fr.tb(ac - 0.07, ac + 0.07, op.y1 + 0.35, op.y1 + 0.5, 0.0, 1.0, W2, S(), FALL & ~FK);
      fr.tb(ac - 0.01, ac + 0.01, op.y1 - 0.6, op.y1 + 0.35, 0.95, 0.97, MAT.IRON, S());
      fr.tb(ac - 0.05, ac + 0.05, op.y1 - 0.66, op.y1 - 0.6, 0.9, 1.0, MAT.IRON, S());
      for (const sg of [-1, 1]) { const e = sg < 0 ? op.a0 - 0.1 : op.a1 + 0.1; fr.tb(Math.min(e, e + sg * 0.55), Math.max(e, e + sg * 0.55), op.y0 - 0.05, op.y1 + 0.05, 0, 0.05, MAT.PLANK, S(), FF | FT | FL | FR); }
    }
  }
  extras && extras({ b, facing, root, S, r2, gF, uF, rf, rp, g1, plateY, foot, W, D, J, o });
}

function finishMeta(fn, o, extra = {}) {
  fn.meta = { kind: o.kind, W: o.W, D: o.D, J: o.J || 0, ox: o.ox || 0, oz: o.oz || 0, foot: o.foot == null ? 0.45 : o.foot, door: o.door, roofMat: o.roofMat, pitch: o.pitch, pattern: o.pattern, framed: true, ...extra };
  return fn;
}
function placeDoorLantern(o, r, always) {
  const g = o.door.rec;
  if (always || r() < 0.5) o.lantern = r() < 0.5 ? g.a1 + 0.5 : g.a0 - 0.5;
}

// ─── interiors and yards ─────────────────────────────────────────────────────────────────────
function furnishHouse(c, bedS, bedF) {
  const { root, S } = c, WD = MAT.WOOD;
  root.box(bedS - 0.45, bedS + 0.45, FLOOR, FLOOR + 0.4, bedF - 0.95, bedF + 0.95, WD, S(), { solid: true });
  root.box(bedS - 0.42, bedS + 0.42, FLOOR + 0.4, FLOOR + 0.5, bedF - 0.6, bedF + 0.9, MAT.CANVAS, S());
  root.box(-0.55, 0.55, FLOOR + 0.72, FLOOR + 0.8, -0.1 - 0.3, -0.1 + 0.3, WD, S(), { solid: true });
  root.box(-0.1, 0.1, FLOOR, FLOOR + 0.72, -0.4, -0.2, WD, S());
  for (const sx of [-1, 1]) { const [x, z] = root.xz(sx * 0.75, -0.1); c.b.drum(x, z, FLOOR, FLOOR + 0.42, 0.17, 0.15, 6, WD, S(), { solid: false }); }
}
function runFence(fr, A0, A1, S, gap) {
  const segs = gap ? [[A0, gap[0]], [gap[1], A1]] : [[A0, A1]];
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 0.3) continue;
    const n = Math.max(1, Math.round((s1 - s0) / 1.6));
    for (let k = 0; k <= n; k++) { const a = s0 + (k / n) * (s1 - s0); fr.tb(a - 0.06, a + 0.06, 0, 1.25, -0.06, 0.06, MAT.WOOD, S(), FALL & ~FB); }
    for (const y of [0.4, 0.82]) fr.tb(s0, s1, y, y + 0.1, -0.035, 0.035, MAT.WOOD, S(), FF | FK | FT | FB);
    fr.block(s0, s1, 0, 1.1, -0.06, 0.06);
  }
  if (gap) leaf(fr, gap[0], 0, Math.cos(1.1), Math.sin(1.1), gap[1] - gap[0] - 0.05, 0.12, 1.1, S);
}

// ─── the kinds ───────────────────────────────────────────────────────────────────────────────
function planHouseLike(plot, farm) {
  const r = seedRng(plot);
  const W = clamp((farm ? 3.1 : 2.4) + r() * (farm ? 0.9 : 1.1), 2.0, Math.max(2.0, plot.w - 0.5));
  const D = clamp((farm ? 2.8 : 2.2) + r() * 1.0, 2.0, Math.max(2.0, plot.d - 0.5));
  const gableFront = !farm && r() < 0.3, foot = 0.45;
  const o = {
    kind: plot.kind, seed: plot.seed, W, D, J: 0, h0: 2.75, h1: 0, foot, ground: 'plaster', gMat: MAT.PLASTER, uMat: MAT.PLASTER, gableFront,
    roofMat: pickRoof(r, farm ? [[MAT.THATCH, 0.55], [MAT.TILE, 0.3], [MAT.SLATE, 0.15]] : [[MAT.THATCH, 0.45], [MAT.SLATE, 0.3], [MAT.TILE, 0.25]]),
    pitch: 0.7 + r() * 0.26, pattern: Math.floor(r() * 3), ops: mkOps(),
  };
  const maxOff = Math.max(0, W - 0.6 - 0.45), da = gableFront ? (r() < 0.5 ? -1 : 1) * (r() < 0.5 ? 0 : maxOff) : (r() * 2 - 1) * maxOff;
  addDoor(o, da, 1.2);
  o.chimney = gableFront ? -1 : (r() < 0.5 ? -1 : 1);
  // A lean-to by seed (not on the door wall).
  const wantLean = r() < (farm ? 0.7 : 0.45);
  const wall = gableFront ? (r() < 0.5 ? 'right' : 'left') : ['back', 'left', 'right'][Math.floor(r() * 3)];
  if (wantLean) {
    const hl = isFB(wall) ? W : D, wd = Math.min(2.4, 2 * (hl - WALL_T) - 1.4);
    if (wd >= 1.6) {
      const a = isFB(wall) ? (r() - 0.5) * Math.max(0, 2 * W - wd - 1.2) : (wall === 'right' ? 1 : -1) * (D - WALL_T - wd / 2 - 0.15);
      o.lean = { wall, a, w: wd, d: 1.7, hB: 2.3, hF: 1.75, mat: o.roofMat === MAT.THATCH ? MAT.THATCH : MAT.SHINGLE };
    }
  }
  const lw = o.lean ? o.lean.wall : null, cnt = (w, n) => (w === lw ? 0 : n);
  addWindows(o, r, 'g', {
    front: gableFront ? 1 : 1 + (r() < 0.5 ? 1 : 0), right: cnt('right', 1), left: cnt('left', r() < 0.5 ? 1 : 0), back: cnt('back', r() < 0.4 ? 1 : 0),
  }, { y0: foot + 0.8, np: 1, npFor: (w) => (w === 'front' && !gableFront && W > 3.0 && r() < 0.35 ? 2 : 1) });
  if (gableFront) addAttic(o, r, 'front'); else if (r() < 0.5) addAttic(o, r, r() < 0.5 ? 'right' : 'left');
  o.dormers = [];
  if (gableFront) { for (const sg of [-1, 1]) if (r() < 0.5) o.dormers.push({ sg, c: D * 0.3 }); }
  else if (r() < 0.6 && W > 2.6) o.dormers.push({ sg: -1, c: -o.chimney * W * 0.42 });
  placeDoorLantern(o, r, false);
  return o;
}
function houseExtras(o) {
  return (c) => {
    const bs = o.gableFront ? o.W - 0.9 : -o.chimney * (o.W - 0.95), bf = o.gableFront ? -o.D + 1.1 : -o.D + 1.15;
    furnishHouse(c, bs, bf);
  };
}
function houseKit(plot) {
  const o = planHouseLike(plot, false), ex = houseExtras(o);
  return finishMeta((b, facing) => building(b, facing, o, ex), o);
}

function planTwoStorey(plot, shop) {
  const r = seedRng(plot), J = 0.4 + r() * 0.2, foot = 0.45;
  const W = clamp((shop ? 3.1 : 2.5) + r() * (shop ? 0.7 : 0.8), 2.2, Math.max(2.2, plot.w - 0.5));
  const D = clamp(2.9 + r() * 0.9, 2.4, Math.max(2.4, plot.d - 0.5 - J));
  const o = {
    kind: plot.kind, seed: plot.seed, W, D, J, h0: 2.75, h1: 2.3, foot, ground: 'plaster', gMat: MAT.PLASTER, uMat: MAT.PLASTER, gableFront: true,
    roofMat: pickRoof(r, [[MAT.SLATE, 0.4], [MAT.TILE, 0.4], [MAT.THATCH, 0.2]]), pitch: 0.8 + r() * 0.16, pattern: Math.floor(r() * 3), ops: mkOps(), chimney: -1,
  };
  const g1 = foot + o.h0, side = r() < 0.5 ? -1 : 1, signWall = r() < 0.5 ? 'right' : 'left', maxOff = W - 0.95;
  const da = shop ? side * maxOff : (r() < 0.5 ? 0 : side * Math.max(0, W - 1.3));
  const dg = addDoor(o, da, 1.2);
  if (shop) {
    const inner = da - side * 1.0;
    let a0 = Math.min(inner, -side * (W - 0.4)), a1 = Math.max(inner, -side * (W - 0.4));
    if (a1 - a0 > 3.4) { if (side > 0) a0 = a1 - 3.4; else a1 = a0 + 3.4; }
    o.shop = { a0, a1 };
    o.ops.g.front.push({ a0, a1, y0: foot + 0.6, y1: 2.5, cut: true, kind: 'shopfront' });
    o.signWall = signWall;
  }
  addWindows(o, r, 'g', { front: shop ? 0 : 1, right: 1 + (r() < 0.5 ? 1 : 0), left: r() < 0.6 ? 1 : 0, back: r() < 0.5 ? 1 : 0 }, { y0: foot + 0.8, np: 1 });
  const hlU = D + J / 2, avoid = shop ? { [signWall]: signWall === 'right' ? [[-hlU - 1, -hlU + 1.9]] : [[hlU - 1.9, hlU + 1]] } : {};
  const wide = r() < 0.5;
  addWindows(o, r, 'u', { front: wide ? 1 : 2, right: 1 + (r() < 0.5 ? 1 : 0), left: 1 + (r() < 0.4 ? 1 : 0), back: 1 }, { y0: g1 + 0.5, np: 1, shutterP: 0.6, avoid, npFor: (w) => (w === 'front' && wide ? 2 : 1) });
  addAttic(o, r, 'front');
  o.dormers = [];
  for (const sg of [-1, 1]) if (r() < 0.55) o.dormers.push({ sg, c: D * 0.3 + J / 2 });
  if (shop) o.lantern = r() < 0.5 ? dg.a1 + 0.5 : dg.a0 - 0.5;
  else placeDoorLantern(o, r, false);
  return o;
}
function house2Kit(plot) {
  const o = planTwoStorey(plot, false);
  const ex = (c) => furnishHouse(c, o.W - 0.9, -o.D + 1.1);
  return finishMeta((b, facing) => building(b, facing, o, ex), o);
}

function shopExtras(o) {
  return (c) => {
    const { root, S, gF, uF, g1, W, D, J, b } = c, fr = gF.front, { a0, a1 } = o.shop, sd = o.seed;
    // Interior: a counter is on the shopfront; shelves along the back wall.
    root.box(-W + 0.5, W - 0.5, FLOOR, FLOOR + 1.9, -D + WALL_T, -D + WALL_T + 0.3, MAT.WOOD, S(), { solid: true });
    // Canvas awning on two poles, striped by seed.
    const aw0 = a0 - 0.2, aw1 = a1 + 0.2, ns = Math.max(4, Math.round((aw1 - aw0) / 0.4)), sA = 500 + (sd * 7) % 300, sB = sA + 411 + (sd % 5) * 37;
    const yAt = (v) => 2.78 - 0.68 * v, cAt = (v) => 0.06 + 1.85 * v;
    for (let k = 0; k < ns; k++) {
      const x0 = aw0 + (aw1 - aw0) * k / ns, x1 = aw0 + (aw1 - aw0) * (k + 1) / ns, mat = MAT.CANVAS, seed = k % 2 ? sB : sA;
      cloth(b, (u, v) => fr.pt(x0 + (x1 - x0) * u, yAt(v) - 0.07 * Math.sin(Math.PI * v), cAt(v)), 1, 3, mat, seed);
      b.quad(fr.pt(x1, yAt(1), cAt(1)), fr.pt(x0, yAt(1), cAt(1)), fr.pt(x0, yAt(1) - 0.26, cAt(1) - 0.04), fr.pt(x1, yAt(1) - 0.26, cAt(1) - 0.04), mat, seed);
    }
    for (const a of [aw0 + 0.08, aw1 - 0.08]) {
      fr.stk([a, -0.2, cAt(1) - 0.05], [a, yAt(1) + 0.03, cAt(1) - 0.05], 0.05, 0.045, 6, MAT.WOOD, S());
      b.blockers.push({ site: b.site, kind: 'circle', x: fr.xz(a, cAt(1) - 0.05)[0], z: fr.xz(a, cAt(1) - 0.05)[1], r: 0.08, y0: 0, y1: 2.1 });
    }
    // Hanging sign: iron bracket on the side wall near the front corner, a plank board on two chains.
    const sw = o.signWall, sf = uF[sw], sgn = sw === 'right' ? -1 : 1, aS = sgn * ((D + J) - J / 2 - 0.55), yA = g1 + 1.75;
    sf.tb(aS - 0.02, aS + 0.02, yA - 0.025, yA + 0.025, 0, 1.05, MAT.IRON, S(), FALL & ~FK);
    for (const cc of [0.3, 0.95]) sf.tb(aS - 0.008, aS + 0.008, yA - 0.28, yA, cc - 0.008, cc + 0.008, MAT.IRON, S(), FF | FL | FR | FK);
    sf.tb(aS - 0.025, aS + 0.025, yA - 0.85, yA - 0.28, 0.2, 1.05, MAT.PLANK, S());
    sf.tb(aS - 0.032, aS + 0.032, yA - 0.87, yA - 0.84, 0.19, 1.06, MAT.WOOD, S());
    sf.tb(aS - 0.032, aS + 0.032, yA - 0.3, yA - 0.27, 0.19, 1.06, MAT.WOOD, S());
    // Goods under and beside the awning.
    const side = o.door.a > 0 ? 1 : -1, ox = -side * (W - 1.0);
    crate(fr, ox, 0.95, 0.3, 0.5, S, 0.2); crate(fr, ox + 0.05, 0.9, 0.26, 0.95, S, -0.3);
    barrel(fr, -side * (W - 2.1), 1.1, S); barrel(fr, o.door.a - side * 1.45, 0.75, S, 0.8);
  };
}
function shopKit(plot) {
  const o = planTwoStorey(plot, true);
  const ex = shopExtras(o);
  return finishMeta((b, facing) => building(b, facing, o, (c) => { ex(c); }), o, { lanterns: 1 });
}

function planWorkshop(plot) {
  const r = seedRng(plot), foot = 0.45;
  const W = clamp(3.5 + r() * 0.9, 2.8, Math.max(2.8, plot.w - 0.5)), D = clamp(3.0 + r() * 0.9, 2.6, Math.max(2.6, plot.d - 0.5));
  const o = {
    kind: 'workshop', seed: plot.seed, W, D, J: 0, h0: 3.0, h1: 1.9, foot, ground: 'stone', gMat: MAT.STONE, uMat: MAT.PLANK, gableFront: false, course: 1.0,
    roofMat: pickRoof(r, [[MAT.SLATE, 0.35], [MAT.TILE, 0.25], [MAT.SHINGLE, 0.4]]), pitch: 0.66 + r() * 0.19, pattern: 3, ops: mkOps(),
    doubleDoor: true, floorMat: MAT.PLANK, noBraces: true, chimney: r() < 0.5 ? -1 : 1,
  };
  const g1 = foot + o.h0, maxOff = Math.max(0, W - 1.3 - 0.4);
  addDoor(o, (r() * 2 - 1) * maxOff, 2.6, true, 2.9);
  const bench = r() < 0.5 ? 'right' : 'left', other = bench === 'right' ? 'left' : 'right';
  o.lean = { wall: bench, a: (bench === 'right' ? 1 : -1) * (D - STONE_T - 1.7), w: 3.0, d: 2.2, hB: 2.8, hF: 2.0, mat: o.roofMat, bench: true };
  o.rack = { wall: other, a: (other === 'right' ? 1 : -1) * (D - STONE_T - 1.1) };
  addWindows(o, r, 'g', { front: 2, back: 1, [other]: 1 }, { y0: 1.35, np: 1, cut: true });
  addWindows(o, r, 'u', { front: 2, right: 1, left: 1, back: 1 }, { y0: g1 + 0.28, np: 1, shutterP: 0.8 });
  placeDoorLantern(o, r, r() < 0.6);
  return o;
}
function workshopKit(plot) {
  const o = planWorkshop(plot);
  const ex = (c) => {
    const { root, S, gF, W, D } = c, bf = gF[o.lean.wall], B = MAT.WOOD;
    // The workbench under the lean-to: plank top on trestle legs, a vice, tools, a stool.
    const a = o.lean.a, w = o.lean.w;
    bf.box(a - w * 0.38, a + w * 0.38, 0.82, 0.9, 0.3, 0.95, MAT.PLANK, S(), { solid: true });
    for (const sx of [-1, 1]) for (const cc of [0.38, 0.87]) bf.tb(a + sx * w * 0.35 - 0.04, a + sx * w * 0.35 + 0.04, 0, 0.82, cc - 0.04, cc + 0.04, B, S(), FALL & ~FB);
    bf.tb(a - w * 0.38, a + w * 0.38, 0.35, 0.4, 0.4, 0.85, B, S(), FT | FF | FK);
    bf.box(a + w * 0.3, a + w * 0.3 + 0.2, 0.9, 1.08, 0.45, 0.6, MAT.IRON, S());
    bf.box(a - 0.3, a + 0.1, 0.9, 0.95, 0.55, 0.62, MAT.IRON, S());
    const [sx, sz] = bf.xz(a - 0.2, 1.5); c.b.drum(sx, sz, 0, 0.45, 0.2, 0.17, 7, B, S(), { solid: false });
    woodpile(gF[o.rack.wall], o.rack.a, 0.75, 4, S, 1.1);
    crate(gF.front, o.door.a + (o.door.a > 0 ? -1 : 1) * 2.0, 0.7, 0.32, 0.6, S, 0.3);
    barrel(gF.front, o.door.a + (o.door.a > 0 ? -1 : 1) * 2.7, 0.65, S);
    // Inside: a work table, an anvil block and the hearth glow.
    root.box(-W * 0.4 - 0.9, -W * 0.4 + 0.9, FLOOR + 0.8, FLOOR + 0.88, -D * 0.2 - 0.4, -D * 0.2 + 0.4, B, S(), { solid: true });
    root.box(W * 0.3 - 0.2, W * 0.3 + 0.2, FLOOR, FLOOR + 0.6, -D * 0.1 - 0.15, -D * 0.1 + 0.15, MAT.IRON, S(), { solid: true });
  };
  return finishMeta((b, facing) => building(b, facing, o, ex), o);
}

function planBarn(plot) {
  const r = seedRng(plot), foot = 0.9;
  const W = clamp(4.0 + r() * 1.0, 3.2, Math.max(3.2, plot.w - 0.7)), D = clamp(5.5 + r() * 2.0, 4.0, Math.max(4.0, plot.d - 0.7));
  const wall = r() < 0.5 ? MAT.SHINGLE : MAT.PLANK;
  const o = {
    kind: 'barn', seed: plot.seed, W, D, J: 0, h0: 3.7, h1: 0, foot, ground: 'plank', gMat: wall, uMat: wall, gableFront: true,
    roofMat: pickRoof(r, [[MAT.SLATE, 0.5], [MAT.THATCH, 0.5]]), pitch: 0.72 + r() * 0.16, pattern: 3, ops: mkOps(), noBraces: true,
    doubleDoor: true, floorMat: MAT.EARTH, railsG: [foot + 1.6], ove: 0.65, ovg: 0.5, step: 1.1,
  };
  const g1 = foot + o.h0;
  addDoor(o, 0, 3.0, false, 3.4);
  addWindows(o, r, 'g', { right: 1, left: 1, back: 1 }, { y0: foot + 1.8, np: 1, shutterP: 1 });
  o.ops.g.front.push({ a0: -0.65, a1: 0.65, y0: g1 + 0.7, y1: g1 + 1.7, kind: 'loft' });
  return o;
}
function barnKit(plot) {
  const o = planBarn(plot);
  const ex = (c) => {
    const { root, S, W, D } = c, r = rng(o.seed + 3);
    // Hay bales stacked inside, a loose heap, a pitchfork leaning.
    for (const [a, f, n] of [[-W + 1.2, -D + 1.0, 3], [-W + 1.2, -D + 2.0, 2], [W - 1.3, -D + 1.1, 2], [W - 1.3, D - 2.0, 1]]) for (let k = 0; k < n; k++) {
      root.box(a - 0.5, a + 0.5, FLOOR + k * 0.46, FLOOR + (k + 1) * 0.46, f - 0.45, f + 0.45, MAT.THATCH, S(), { solid: k === 0, yawAdd: (r() - 0.5) * 0.12 });
    }
    root.box(-0.9, 0.9, FLOOR, FLOOR + 0.9, -D + 3.2, -D + 4.4, MAT.THATCH, S(), { solid: true });
    root.tb(-W + 0.4, W - 0.4, 2.7, 2.85, -D + 0.4, -D + 0.5, MAT.WOOD, S());
    const [px, pz] = root.xz(W - 0.5, 0.2);
    c.b.drum(px, pz, FLOOR, FLOOR + 1.6, 0.4, 0.4, 7, MAT.WOOD, S());
  };
  return finishMeta((b, facing) => building(b, facing, o, ex), o);
}

function planChapel(plot) {
  const r = seedRng(plot), foot = 0.45;
  const W = clamp(2.5 + r() * 0.4, 2.2, Math.max(2.2, plot.w - 0.6)), D = clamp(4.6 + r() * 1.2, 3.8, Math.max(3.8, plot.d - 0.8));
  const o = {
    kind: 'chapel', seed: plot.seed, W, D, J: 0, h0: 3.75, h1: 0, foot, ground: 'stone', gMat: MAT.STONE, uMat: MAT.STONE, gableFront: true,
    roofMat: MAT.SLATE, pitch: 0.95 + r() * 0.1, pattern: 0, ops: mkOps(), course: 1.0, doubleDoor: true, floorMat: MAT.FLAG, noLintel: true, ove: 0.35, ovg: 0.08, doorOpen: 1.3, noBraces: true,
  };
  addDoor(o, 0, 1.4, true, 2.45);
  const nwin = Math.max(2, Math.round(D * 2 / 3.2));
  for (const wall of ['right', 'left']) {
    const hl = D - STONE_T;
    for (let k = 0; k < nwin; k++) o.ops.g[wall].push(winOpen({ a: -hl + (k + 0.5) * (2 * hl) / nwin, y0: 1.3, np: 1, nv: 2, cut: true }));
  }
  o.ops.g.back.push(winOpen({ a: 0, y0: 1.3, np: 1, nv: 2, cut: true }));
  addAttic(o, r, 'front');
  o.nwin = nwin;
  o.lantern = 1.2;
  return o;
}
function chapelKit(plot) {
  const o = planChapel(plot);
  const ex = (c) => {
    const { root, S, gF, W, D, b, g1 } = c, fr = gF.front, tn = Math.tan(o.pitch), I = MAT.STONE;
    // Buttresses between the windows.
    for (const wall of ['right', 'left']) {
      const sf = gF[wall], hl = D;
      for (let k = 0; k <= o.nwin; k++) {
        const a = k === 0 ? -hl + 0.3 : k === o.nwin ? hl - 0.3 : -hl + (k * 2 * hl) / o.nwin;
        sf.box(a - 0.3, a + 0.3, -1.2, 2.7, 0, 0.62, I, S(), { solid: true, plain: false });
        sf.box(a - 0.2, a + 0.2, 2.7, g1 - 0.25, 0, 0.36, I, S(), { solid: true });
        sf.box(a - 0.26, a + 0.26, 2.65, 2.75, 0, 0.68, I, S());
      }
    }
    // The round-arched door: voussoirs and a planked tympanum.
    const ri = 0.7, ro = 1.05, yc = o.door.y1, n = 9, ty = yc;
    for (let k = 0; k < n; k++) {
      const th0 = PI - (PI * k) / n, th1 = PI - (PI * (k + 1)) / n, tm = (th0 + th1) / 2, rm = (ri + ro) / 2;
      const am = rm * Math.cos(tm), ym = yc + rm * Math.sin(tm), hy = (rm * Math.abs(th0 - th1)) / 2 * 0.96, [x, z] = fr.xz(am, 0.06);
      b.box(x, z, ym - hy, ym + hy, (ro - ri) / 2, 0.14, fr.yaw, I, S(), { plain: true, roll: tm, solid: false, ...NS });
      b.tri(fr.pt(0, ty, 0.01), fr.pt(ri * Math.cos(th0), ty + ri * Math.sin(th0), 0.01), fr.pt(ri * Math.cos(th1), ty + ri * Math.sin(th1), 0.01), MAT.PLANK, S());
    }
    fr.box(-1.15, -ro + 0.0, yc - 0.1, yc + 0.05, 0, 0.14, I, S());
    lantern(fr, -(o.door.w / 2 + 0.55), o.door.y1 - 0.35, S);
    // Bell gable.
    const yA = g1 + W * tn, [bx, bz] = fr.xz(0, -0.2);
    fr.box(-0.8, 0.8, yA - 1.2, yA - 0.1, -0.45, 0.06, I, S());
    for (const sx of [-1, 1]) fr.box(sx < 0 ? -0.8 : 0.5, sx < 0 ? -0.5 : 0.8, yA - 0.1, yA + 1.4, -0.45, 0.06, I, S());
    fr.box(-0.85, 0.85, yA + 1.4, yA + 1.7, -0.5, 0.1, I, S());
    b.cone(bx, bz, yA + 1.7, yA + 2.9, 0.78, 8, MAT.SLATE, S(), { solid: false });
    b.drum(bx, bz, yA + 0.35, yA + 1.2, 0.3, 0.1, 8, MAT.METAL, S(), { solid: false });
    fr.tb(-0.55, 0.55, yA + 1.2, yA + 1.3, -0.3, -0.1, MAT.WOOD, S());
    // Pews, an aisle, a chancel step and altar.
    const r = rng(o.seed + 9);
    for (let k = 0; k < Math.floor((D * 2 - 4.5) / 1.2); k++) {
      const f = D - 2.3 - k * 1.2;
      for (const sx of [-1, 1]) {
        const a0 = sx < 0 ? -W + 0.55 : 0.5, a1 = sx < 0 ? -0.5 : W - 0.55;
        root.box(a0, a1, FLOOR, FLOOR + 0.45, f - 0.2, f + 0.2, MAT.WOOD, S(), { solid: true });
        root.box(a0, a1, FLOOR + 0.45, FLOOR + 0.95, f - 0.22, f - 0.16, MAT.WOOD, S());
      }
    }
    root.box(-W + 0.45, W - 0.45, FLOOR, FLOOR + 0.2, -D + 0.45, -D + 2.1, MAT.FLAG, S(), { platform: true });
    root.box(-0.8, 0.8, FLOOR + 0.2, FLOOR + 1.05, -D + 0.7, -D + 1.3, I, S(), { solid: true });
    root.box(-0.9, 0.9, FLOOR + 1.05, FLOOR + 1.12, -D + 0.62, -D + 1.38, I, S());
    void r;
  };
  return finishMeta((b, facing) => building(b, facing, o, ex), o, { lanterns: 1 });
}

function planHall(plot) {
  const r = seedRng(plot), foot = 0.45;
  const W = clamp(3.3 + r() * 0.6, 2.8, Math.max(2.8, plot.w - 0.5)), D = clamp(5.0 + r() * 1.0, 4.0, Math.max(4.0, plot.d - 0.5));
  const o = {
    kind: 'hall', seed: plot.seed, W, D, J: 0, h0: 3.0, h1: 2.4, foot, ground: 'stone', gMat: MAT.STONE, uMat: MAT.PLASTER, gableFront: true, course: 1.1,
    roofMat: r() < 0.5 ? MAT.TILE : MAT.SLATE, pitch: 0.75 + r() * 0.15, pattern: r() < 0.5 ? 1 : 0, ops: mkOps(), doubleDoor: true, floorMat: MAT.FLAG, chimney: -1, doorOpen: 1.2,
  };
  const g1 = foot + o.h0;
  addDoor(o, 0, 1.8, true, 2.6);
  addWindows(o, r, 'g', { front: 2, back: 1, right: 2, left: 2 }, { y0: 1.3, np: 1, cut: true });
  addWindows(o, r, 'u', { front: 2, back: 1, right: 2, left: 2 }, { y0: g1 + 0.5, np: 2, shutterP: 0.4 });
  addAttic(o, r, 'front');
  return o;
}
function hallKit(plot) {
  const o = planHall(plot);
  const ex = (c) => {
    const { root, S, gF, W, D, b } = c, fr = gF.front, WD = MAT.WOOD;
    // The porch: stone floor, two posts, a small gable roof, a lantern on each post.
    fr.box(-1.7, 1.7, -0.6, 0.14, 0, 2.3, MAT.FLAG, S(), { platform: true });
    for (const sx of [-1, 1]) {
      const a = sx * 1.45;
      fr.tb(a - 0.08, a + 0.08, 0.14, 2.7, 1.95, 2.11, WD, S(), FALL & ~FB);
      b.blockers.push({ site: b.site, kind: 'circle', x: fr.xz(a, 2.03)[0], z: fr.xz(a, 2.03)[1], r: 0.1, y0: 0, y1: 2.7 });
      const pf = fr.sub(a, 2.11, 0);
      lantern(pf, 0, 2.0, S);
      fr.diag(a, 2.0, a + sx * -0.5, 2.55, 0.1, 1.88, 2.05, WD, S());
    }
    fr.tb(-1.7, 1.7, 2.55, 2.75, 1.9, 2.15, WD, S());
    roofGable(fr, { L: 1.55, c0: 0.1, c1: 2.15, y: 2.75, pitch: 0.5, mat: o.roofMat, S, ove: 0.2, ovg: 0.18 });
    // The hall: a long table with benches and a lectern.
    for (let k = 0; k < 2; k++) root.box(-0.55 + k * 0.0, 0.55, FLOOR + 0.75, FLOOR + 0.83, -D + 1.8, D - 2.6, WD, S(), { solid: k === 0 });
    root.box(-0.4, 0.4, FLOOR, FLOOR + 0.75, -D + 2.0, D - 2.8, WD, S());
    for (const sx of [-1, 1]) root.box(sx < 0 ? -1.2 : 0.8, sx < 0 ? -0.8 : 1.2, FLOOR, FLOOR + 0.45, -D + 2.0, D - 2.8, WD, S(), { solid: true });
    root.box(-W + 0.45, W - 0.45, FLOOR, FLOOR + 0.2, -D + 0.45, -D + 1.7, MAT.FLAG, S(), { platform: true });
  };
  return finishMeta((b, facing) => building(b, facing, o, ex), o, { lanterns: 3 });
}

function farmKit(plot) {
  const o = planHouseLike(plot, true), D = o.D;
  o.kind = 'farm';
  const yardF1 = plot.d - 0.5 - 2 * D - 0.5 - 0.6;   // front edge of the yard (house back wall minus a gap)
  o.oz = plot.d - D - 0.5;
  placeDoorLantern(o, seedRng(plot, 5), false);
  const yardBack = -plot.d + 0.5, yardFront = o.oz - D - 0.55, yw = Math.max(2.5, plot.w - 0.5), hasYard = yardFront - yardBack > 3.0;
  void yardF1;
  const ex = (c) => {
    const { root, S, b } = c, base = new Frame(b, c.facing, 0, 0, 0);
    // The house's furniture.
    furnishHouse(c, o.gableFront ? o.W - 0.9 : -o.chimney * (o.W - 0.95), -o.D + 1.15);
    if (!hasYard) return;
    runFence(base.sub(0, yardBack, PI), -yw, yw, S, null);                           // back, a = -s
    runFence(base.sub(-yw, 0, -PI / 2), yardBack, yardFront, S, null);                // left, a = +f
    runFence(base.sub(yw, 0, PI / 2), -yardFront, -yardBack, S, null);                // right, a = -f
    const gapC = (o.door.a || 0) * 0.3;
    runFence(base.sub(0, yardFront, 0), -yw, yw, S, [gapC - 0.9, gapC + 0.9]);
    // A haystack with a thatch hat, a trough, a few bales.
    const hx = yw - 2.2, hz = yardBack + 2.2, [sx, sz] = base.xz(-hx, hz);
    b.drum(sx, sz, 0, 1.3, 1.45, 1.35, 10, MAT.THATCH, S(), { solid: true });
    b.cone(sx, sz, 1.3, 3.0, 1.55, 10, MAT.THATCH, S(), { solid: false });
    base.box(yw - 2.6, yw - 0.6, 0, 0.5, yardBack + 4.2, yardBack + 4.9, MAT.WOOD, S(), { solid: true });
    base.box(-yw + 0.9, -yw + 1.9, 0, 0.45, yardBack + 0.9, yardBack + 1.8, MAT.THATCH, S(), { solid: true });
    base.box(-yw + 0.9, -yw + 1.9, 0.45, 0.9, yardBack + 1.0, yardBack + 1.7, MAT.THATCH, S());
  };
  return finishMeta((b, facing) => building(b, facing, o, ex), o, { yard: hasYard });
}

function wellKit(plot) {
  const r = seedRng(plot), roofMat = r() < 0.5 ? MAT.SHINGLE : MAT.THATCH, n = 10, pitch = 0.75 + r() * 0.15;
  const fn = (b, facing) => {
    const fr = new Frame(b, facing, 0, 0, 0);
    let sd = 100 + (plot.seed % 3000) * 40;
    const S = () => sd++;
    // Round stone curb: a ring of blocks, a dark water disc inside.
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2, rr = 0.88, [x, z] = fr.xz(Math.cos(a) * rr, Math.sin(a) * rr);
      b.box(x, z, -0.3, 0.9, 0.31, 0.17, fr.yaw - a - PI / 2, MAT.STONE, S(), { solid: false, ...NS });
    }
    b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 1.1, y0: -0.3, y1: 1.2 });
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * PI * 2, a1 = ((k + 1) / 10) * PI * 2, ra = 0.72, y = 0.35;
      b.tri(fr.pt(0, y, 0), fr.pt(Math.cos(a0) * ra, y, Math.sin(a0) * ra), fr.pt(Math.cos(a1) * ra, y, Math.sin(a1) * ra), MAT.IRON, S());
    }
    // Frame: two posts, a cross beam, the windlass, a crank, a small roof, bucket and rope.
    for (const sx of [-1, 1]) {
      const a = sx * 1.1;
      fr.tb(a - 0.07, a + 0.07, 0.6, 2.55, -0.07, 0.07, MAT.WOOD, S(), FALL & ~FB);
      fr.diag(a, 1.75, a - sx * 0.5, 2.4, 0.08, -0.04, 0.04, MAT.WOOD, S());
      b.blockers.push({ site: b.site, kind: 'circle', x: fr.xz(a, 0)[0], z: fr.xz(a, 0)[1], r: 0.1, y0: 0, y1: 2.5 });
    }
    fr.tb(-1.2, 1.2, 2.35, 2.55, -0.09, 0.09, MAT.WOOD, S());
    fr.stk([-1.2, 2.0, 0], [1.4, 2.0, 0], 0.09, 0.09, 8, MAT.WOOD, S());
    fr.tb(1.38, 1.44, 1.5, 2.0, -0.03, 0.03, MAT.WOOD, S());
    fr.tb(1.38, 1.7, 1.46, 1.52, -0.03, 0.03, MAT.WOOD, S());
    roofGable(fr.sub(0, 0, PI / 2), { L: 0.95, c0: -1.4, c1: 1.4, y: 2.55, pitch, mat: roofMat, S, th: roofMat === MAT.THATCH ? 0.26 : 0.08, ove: 0.28, ovg: 0.25 });
    fr.stk([0.1, 1.9, 0.0], [0.1, 1.0, 0.05], 0.014, 0.014, 4, MAT.CANVAS, S());
    const [bx, bz] = fr.xz(0.1, 0.05);
    b.drum(bx, bz, 0.7, 1.0, 0.17, 0.2, 8, MAT.WOOD, S(), { solid: false });
    b.drum(bx, bz, 0.78, 0.82, 0.205, 0.205, 8, MAT.IRON, S(), { solid: false });
  };
  fn.meta = { kind: 'well', framed: false, W: 1.2, D: 1.2, J: 0 };
  return fn;
}

function stallKit(plot) {
  const fn = (b, facing) => marketStall(b, 0, 0, facing, plot.seed % 4, 100 + (plot.seed % 50) * 40, rng(plot.seed + 1));
  fn.meta = { kind: 'stall', framed: false, W: 1.9, D: 1.6, J: 0 };
  return fn;
}

/** kind → builder factory `(plot) => (b, facing, R) => void`. plot = { kind, w, d, seed, district }. */
export const KITS = {
  house: houseKit, house2: house2Kit, shop: shopKit, workshop: workshopKit, barn: barnKit,
  chapel: chapelKit, hall: hallKit, well: wellKit, stall: stallKit, farm: farmKit,
};

const PREVIEW_PLOTS = {
  house: [4.5, 4.5], house2: [5, 5.5], shop: [5, 5.5], workshop: [6, 5.5], barn: [7, 9], chapel: [5, 8], hall: [6, 8], well: [2, 2], stall: [2.4, 2], farm: [8, 11],
};
/** One of each kind in a row along +x, 14 m apart from `at` = [x, z] (dev spot, like the swatch site). Fronts face -z
 *  (facing π): stand at z = at[1] - 16 looking +z. Site records like meadowSites': { id, at, facing, build, footprint, seatAt, windows }. */
export function kitPreviewSites(at) {
  return Object.keys(KITS).map((kind, i) => {
    const [w, d] = PREVIEW_PLOTS[kind], plot = { kind, w, d, seed: 11 + i * 7, district: 'preview' };
    return { id: 'kit-' + kind, at: [at[0] + i * 14, at[1]], facing: PI, build: KITS[kind](plot), footprint: Math.max(w, d) * 0.8, seatAt: 'center', windows: true, plot };
  });
}

/** The village's sites from the baked layout (data/world/village.json, src/world/village.js): one per
 *  plot (its kit, seated on the highest ground under it), and one per street lantern. Ids `vil-…`. */
const TAU = Math.PI * 2;
export function villageSites(village) {
  const sites = [];
  for (const p of village.plots) {
    if (!KITS[p.kind]) continue;
    sites.push({ id: 'vil-' + p.id, at: [p.at[0], p.at[1]], facing: p.facing, build: KITS[p.kind](p), footprint: Math.max(1, Math.min(p.w, p.d) * 0.85), seatAt: p.kind === 'stall' || p.kind === 'well' ? 'center' : 'top', windows: true, plot: p });
  }
  village.lights.forEach((l, i) => {
    const seed = 400 + i;
    sites.push({ id: 'vil-lamp-' + i, at: [l.at[0], l.at[1]], facing: 0, build: (b) => lampPost(b, 0, 0, 2.6, (i * 2.399) % TAU, seed, 1.5), footprint: 0.5, seatAt: 'center', lamp: true });
  });
  return sites;
}
