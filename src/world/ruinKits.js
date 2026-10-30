// The erg's Shaper ruins (Phase 9 D7; docs/phase-9/plan.md "D7 — Ruins and glass"): architecture
// sites (world/architecture.js) in the Shapers' stone, half buried by the dunes. Each site is seated
// on the ground under it like every other; sand settles on their ledges and banks at their feet in
// the architecture shader (site glow z = 2, systems/architecture.js). Seats: tools/bake-world/seats.mjs.
//
//   the Sunken Temple   a dome showing above the sand round an open vent, a ring of half-buried
//                       columns, a portal and a stair going down into the sand (the Buried Door, D11)
//   the colonnade       two rows of columns walking into a dune, sinking deeper pair by pair
//   the obelisk field   a ring of carved obelisks round a gnomon (sundial and wind-gauge stones)
//   the aqueduct        arches carrying a channel east along the wadi from the escarpment, spans
//                       fallen; built on the baked ground (absolute heights)
//   the Sun Gate        two piers and a lintel with a slot the sun shines through, on the west rim
//   the colossus head   a giant's fallen head, face up in the sand
//
// Pure geometry on the Builder; deterministic.

import { MAT } from './architecture.js';
import { blob } from './blobStone.js';

const NS = { drift: false, cap: false };

/** A rotation by `f` (site facing): local (x, z) → site frame. */
const rot = (f) => { const c = Math.cos(f), s = Math.sin(f); return (x, z) => [x * c + z * s, -x * s + z * c]; };
/** Small deterministic hash in [0, 1). */
const hh = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/** A smooth spherical cap of stone (the temple dome): radius r, centre at (0, yc, 0), from latitude
 *  phi0 up to phi1 (an open vent above), drawn with masonry courses (carve 5). */
function dome(b, r, yc, phi0, phi1, seed) {
  const NU = 40, NV = 14, base = b.pos.length / 3;
  for (let j = 0; j <= NV; j++) {
    const ph = phi0 + (phi1 - phi0) * j / NV, cp = Math.cos(ph), sp = Math.sin(ph);
    for (let i = 0; i <= NU; i++) {
      const th = (i / NU) * Math.PI * 2, nx = cp * Math.cos(th), nz = cp * Math.sin(th);
      b.pos.push(nx * r, yc + sp * r, nz * r); b.nrm.push(nx, sp, nz); b.uv.push(th * r, ph * r);
      b.info.push(b.site, MAT.STONE, seed, 5);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = base + j * (NU + 1) + i, c = a + NU + 2, d = a + NU + 1;
    b.idx.push(a, a + 1, c, a, c, d);
  }
}

/** A column that may have broken off (`broken` 0..1 of its height lost) or fallen (lies along yaw). */
function column(b, x, z, y0, h, r, seed, { fallen = false, yaw = 0, broken = 0 } = {}) {
  if (fallen) { b.drum(x, z, y0, y0 + h, r, r, 14, MAT.STONE, seed, { lie: 1, yaw }); return; }
  b.box(x, z, y0, y0 + 0.5, r * 1.35, r * 1.35, 0, MAT.STONE, seed + 1, NS);                   // base
  b.drum(x, z, y0 + 0.5, y0 + h * (1 - broken), r, r * 0.9, 18, MAT.STONE, seed + 2, { broken: broken > 0 ? 1 : 0 });
  if (!broken) b.box(x, z, y0 + h, y0 + h + 0.55, r * 1.45, r * 1.45, 0, MAT.STONE, seed + 3, NS); // capital
}

function sunkenTemple(b, facing) {
  const P = rot(facing);
  // The dome: 13 m radius, its centre 6 m under the sand; the vent open to the sky at the crown.
  dome(b, 13, -3, 0, 1.33, 11);
  b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 12.2, y0: -3, y1: 9.5 });
  // The vent's rim: a stone collar round the oculus.
  b.drum(0, 0, 9.2, 10.0, 3.6, 3.3, 24, MAT.GLYPH, 12, { carve: 1 });
  // A ring of columns round the dome, buried to their knees or deeper, some broken, two fallen.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.11, [x, z] = [Math.cos(a) * 17.5, Math.sin(a) * 17.5];
    const h = hh(k, 3), sink = 1.5 + 2.5 * hh(k, 4);
    if (k === 3 || k === 9) column(b, x + Math.cos(a) * 3, z + Math.sin(a) * 3, -0.9, 7.5, 0.75, 20 + k, { fallen: true, yaw: a + 1.2 });
    else column(b, x, z, -sink, 8.5, 0.75, 20 + k, { broken: h < 0.45 ? 0.25 + 0.4 * h : 0 });
  }
  // The portal, half buried, facing out; the stair going down to it into the sand.
  const [px, pz] = P(0, 15.5);
  for (const s of [-1, 1]) { const [qx, qz] = P(s * 3.1, 15.5); b.box(qx, qz, -4, 4.2, 0.9, 1.1, facing, MAT.STONE, 40 + s, { ruin: 0.3 }); }
  b.box(px, pz, 4.2, 5.4, 4.2, 1.2, facing, MAT.GLYPH, 43, { carve: 1 });
  for (let k = 0; k < 8; k++) { const [sx, sz] = P(0, 18 + k * 0.9); b.box(sx, sz, -3.2 + k * 0.4 - 0.3, -3.2 + k * 0.4, 2.2, 0.45, facing, MAT.STONE, 50 + k, NS); }
  // Fallen pieces of the cornice round it.
  for (let k = 0; k < 6; k++) { const a = hh(k, 7) * 6.28, d = 20 + 6 * hh(k, 8), [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; b.box(x, z, -0.6, 0.5 + 0.5 * hh(k, 9), 0.9 + 0.6 * hh(k, 10), 0.6, a, MAT.STONE, 60 + k, { ...NS, tilt: (hh(k, 11) - 0.5) * 0.4 }); }
}

/** A pair of columns across the aisle, an architrave across them while the pair still stands. */
function colonnadePair(k) {
  return (b, facing) => {
    const P = rot(facing), broken = hh(k, 21);
    for (const s of [-1, 1]) {
      const [x, z] = P(s * 3.2, 0), stands = !(k === 4 && s > 0) && !(k === 7 && s < 0);
      if (stands) column(b, x, z, -0.4, 7.2, 0.62, 100 + k * 4 + s, { broken: broken < 0.3 && s < 0 ? 0.45 : 0 });
      else { const [fx, fz] = P(s * 5.5, 1.5); column(b, fx, fz, -0.3, 6.5, 0.6, 100 + k * 4 + s, { fallen: true, yaw: facing + 1.4 * s }); }
    }
    if (broken >= 0.3 && k !== 4 && k !== 7) b.box(0, 0, 7.35, 8.25, 4.0, 0.55, facing + Math.PI / 2, MAT.GLYPH, 120 + k, { carve: 1, ...NS });
  };
}

/** An obelisk: a tapered, carved shaft and its pyramidion; it may lean (the wind-gauge stones). */
function obelisk(k, gnomon = false) {
  return (b, facing) => {
    const h = gnomon ? 15 : 7 + 4 * hh(k, 31), w = gnomon ? 1.1 : 0.62 + 0.2 * hh(k, 32), lean = gnomon ? 0 : (hh(k, 33) - 0.5) * 0.3;
    b.box(0, 0, -0.6, 0.45, w * 1.9, w * 1.9, facing, MAT.STONE, 200 + k, NS);
    if (Math.abs(lean) < 0.05) {
      b.frustum(0, 0, 0.45, h, w, w, w * 0.62, w * 0.62, facing, MAT.GLYPH, 210 + k);
      b.cone(0, 0, h, h + w * 1.3, w * 0.62 * 1.414, 4, MAT.STONE, 220 + k, { solid: false });
    } else {
      b.box(0, 0, 0.45, h, w * 0.8, w * 0.8, facing, MAT.GLYPH, 210 + k, { tilt: lean, carve: 1, ...NS });
    }
    b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: w * 1.2, y0: 0, y1: h });
  };
}

/** An aqueduct span: two piers from the ground (seat) up to the channel at height `ch` (site-local)
 *  and the arch and trough between them; fallen spans leave the piers only, blocks in the sand. */
function aqueductSpan(k, len, ch, fallen) {
  return (b, facing) => {
    const P = rot(facing), pw = 1.4, half = len / 2;
    // Piers up to the arches' spring line, the arch turning from there, the spandrel band over the
    // crowns carrying the trough at `ch`.
    const r = half - pw, spring = ch - 2.2 - r;
    for (const s of [-1, 1]) {
      const [x, z] = P(0, s * half);
      b.box(x, z, -2, fallen && s > 0 ? spring * 0.6 : spring, 1.25, pw, facing, MAT.STONE, 300 + k * 3 + s, { ruin: fallen && s > 0 ? 0.5 : 0, drift: false });
    }
    if (fallen) {
      for (let q = 0; q < 5; q++) { const [x, z] = P((hh(k, q) - 0.5) * 6, (hh(k, q + 9) - 0.5) * len); b.box(x, z, -0.5, 0.4 + 0.5 * hh(k, q + 3), 0.8, 0.6, facing + hh(k, q + 5) * 3, MAT.STONE, 320 + k * 7 + q, { ...NS, tilt: (hh(k, q + 7) - 0.5) * 0.5 }); }
      return;
    }
    // Voussoirs round the semicircle, from pier to pier.
    for (let q = 0; q < 11; q++) {
      const a0 = Math.PI * q / 11, a1 = Math.PI * (q + 1) / 11, am = (a0 + a1) / 2;
      const [x, z] = P(0, -Math.cos(am) * (r + 0.45));
      b.box(x, z, spring + Math.sin(am) * (r + 0.45) - 0.45, spring + Math.sin(am) * (r + 0.45) + 0.45, 1.15, 0.5 * ((r + 0.45) * (a1 - a0)) + 0.05, facing, MAT.STONE, 340 + k * 11 + q, { ...NS, tilt: -(am - Math.PI / 2), solid: false });
    }
    // The haunches filled up to the crown beside the arch, the spandrel band and trough on top.
    for (const s of [-1, 1]) { const [x, z] = P(0, s * (half - 0.2)); b.box(x, z, spring, spring + r + 0.9, 1.2, pw + 0.9, facing, MAT.STONE, 352 + k * 2 + s, { ...NS, solid: false }); }
    b.box(0, 0, spring + r + 0.9, ch, 1.25, half + pw, facing, MAT.STONE, 360 + k, { course: 0.55, drift: false, solid: false });
    for (const s of [-1, 1]) { const [x, z] = P(s * 1.05, 0); b.box(x, z, ch, ch + 0.7, 0.2, half + pw, facing, MAT.STONE, 370 + k * 2 + s, { ...NS, solid: false }); }
  };
}

function sunGate(b, facing) {
  const P = rot(facing);
  for (const s of [-1, 1]) { const [x, z] = P(s * 3.4, 0); b.box(x, z, -2, 10.5, 1.3, 1.6, facing, MAT.STONE, 400 + s, {}); }
  // The lintel in two blocks with a slot between: at the right hour the sun shines through it (D11).
  for (const s of [-1, 1]) { const [x, z] = P(s * 2.55, 0); b.box(x, z, 10.5, 12.6, 2.05, 1.8, facing, MAT.GLYPH, 410 + s, { carve: 1, ...NS }); }
  b.box(0, 0, 12.6, 13.4, 5.2, 2.0, facing, MAT.STONE, 415, NS);
  const [tx, tz] = P(0, 0); b.box(tx, tz, -0.6, 0.25, 2.2, 2.6, facing, MAT.STONE, 416, { ...NS, platform: true, solid: false });
}

function colossusHead(b, facing) {
  const P = rot(facing);
  // A giant's head buried to the chin, facing the way in, in the Shapers' monumental manner: a long
  // face under a deep brow shelf, a wedge of a nose, thin set lips, the eyes closed (cut grooves),
  // and the headdress flaring behind, cracked across. Sand-worn: the skull a weathered lump.
  blob(b, 0, -0.8, -3, 9.0, 3.6, 3.4, facing, MAT.STONE, 501, { solid: true, lump: 0.06 });       // skull
  { const [x, z] = P(0, 1.2); b.frustum(x, z, -3, 6.6, 3.1, 2.4, 3.5, 2.6, facing, MAT.STONE, 502); }  // the face's block
  { const [x, z] = P(0, 3.55); b.box(x, z, 6.2, 7.3, 3.5, 0.75, facing, MAT.STONE, 503, { ...NS, solid: false }); }   // brow shelf
  { const [x, z] = P(0, 4.0); b.frustum(x, z, 2.2, 6.2, 0.95, 0.9, 0.45, 0.35, facing, MAT.STONE, 504); }             // nose
  for (const [y0, y1, d] of [[0.9, 1.35, 3.85], [0.35, 0.8, 3.75]]) { const [x, z] = P(0, d); b.box(x, z, y0, y1, 1.5, 0.22, facing, MAT.STONE, 505 + y0 * 10, { ...NS, solid: false }); } // lips
  { const [x, z] = P(0, 3.4); b.box(x, z, -1.2, 0.2, 2.0, 0.6, facing, MAT.STONE, 509, { ...NS, solid: false }); }    // chin
  for (const s of [-1, 1]) { const [x, z] = P(s * 1.7, 3.62); b.box(x, z, 5.05, 5.3, 0.95, 0.12, facing, MAT.GLYPH, 506 + s, { ...NS, carve: 1, solid: false }); } // closed eyes
  for (const s of [-1, 1]) {
    { const [x, z] = P(s * 2.05, 2.95); blob(b, x, z, -1.4, 4.7, 1.4, 1.0, facing, MAT.STONE, 520 + s, { lump: 0.05 }); }       // cheek and jaw, worn round
    { const [x, z] = P(s * 3.75, 0.6); blob(b, x, z, 2.2, 6.0, 0.55, 1.0, facing, MAT.STONE, 523 + s, { lump: 0.1 }); }          // ear
  }
  { const [x, z] = P(0, -1.6); b.frustum(x, z, 6.0, 13.5, 3.6, 3.0, 4.6, 3.4, facing, MAT.GLYPH, 510); }             // headdress
  { const [x, z] = P(-1.4, -1.0); b.box(x, z, 13.4, 14.6, 2.2, 1.9, facing - 0.3, MAT.STONE, 511, { ...NS, tilt: 0.35, solid: false }); } // its broken crown
  for (let k = 0; k < 6; k++) { const a = hh(k, 61) * 6.28, d = 8 + 6 * hh(k, 62), [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; b.box(x, z, -0.5, 0.3 + 0.6 * hh(k, 63), 0.7 + 0.5 * hh(k, 64), 0.5, a, MAT.STONE, 512 + k, { ...NS, tilt: (hh(k, 65) - 0.5) * 0.4 }); }
}

/**
 * The caravanserai at the oasis (D11's camp, the Wellhouse; plan.md "a Veiled caravan stranded in a
 * ruined caravanserai at the oasis"): a walled court 32 m square in Shaper stone, its walls broken
 * along the top and down to stumps in two places, a gate in the front wall under a carved lintel,
 * round towers at the corners (one fallen in), an arcade of piers along the back and sides carrying
 * a roof slab (walkable: platforms), the dry well in the middle of the court. Sand has drifted
 * against the walls and half fills the gateway: a drift you walk up and over (platforms stepped
 * with its slope — the CPU solid from the drift's height).
 */
function caravanserai(b, facing) {
  const P = rot(facing), S = 16, T = 0.65, H = 7.2;
  // The walls, in runs (local: x across, z toward the front); the front run split by the gate.
  const runs = [
    [[-S, -S], [S, -S]], [[-S, -S], [-S, S]], [[S, -S], [S, S]],
    [[-S, S], [-3.2, S]], [[3.2, S], [S, S]],
  ];
  runs.forEach(([a, c], ri) => {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.round(len / 4));
    const yaw = facing + Math.atan2(c[0] - a[0], c[1] - a[1]);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, lx = a[0] + (c[0] - a[0]) * t, lz = a[1] + (c[1] - a[1]) * t, [x, z] = P(lx, lz);
      // Breaches: two stretches down to stumps; elsewhere the top worn ragged.
      const breach = (ri === 1 && k >= 3 && k <= 4) || (ri === 0 && k === 6);
      const top = breach ? 0.8 + 0.6 * hh(ri * 31 + k, 1) : H - 1.6 * hh(ri * 31 + k, 2);
      b.box(x, z, -1, top, T, len / n / 2 + 0.02, yaw, MAT.STONE, 600 + ri * 40 + k, { ruin: breach ? 0.6 : 0.35, course: 0.62 });
    }
  });
  // The gate: two piers and a carved lintel; a step of fallen blocks.
  for (const s of [-1, 1]) { const [x, z] = P(s * 3.6, S); b.box(x, z, -1, H + 1.4, 0.9, 1.0, facing, MAT.STONE, 700 + s, {}); }
  { const [x, z] = P(0, S); b.box(x, z, H - 0.4, H + 1.0, 4.5, 0.85, facing, MAT.GLYPH, 703, { carve: 1, ...NS }); }
  // Corner towers; the back-right one fallen in to a stump, its drums in the sand.
  [[-S, -S], [S, -S], [-S, S], [S, S]].forEach(([lx, lz], ti) => {
    const [x, z] = P(lx, lz), fallen = ti === 1;
    b.drum(x, z, -1, fallen ? 2.2 : H + 2.2, 2.4, 2.2, 20, MAT.STONE, 720 + ti, { broken: fallen ? 1 : 0 });
    if (!fallen) b.drum(x, z, H + 2.2, H + 2.8, 2.6, 2.6, 20, MAT.STONE, 730 + ti, { solid: false });
    else for (let q = 0; q < 3; q++) { const a = 0.6 + q * 0.5, [fx, fz] = P(lx + 4 + q * 1.6, lz - 1 - q * 0.8); b.drum(fx, fz, -0.4, 1.6, 1.0, 1.0, 14, MAT.STONE, 740 + q, { lie: 1, yaw: facing + a }); }
  });
  // The arcade: piers 3.6 m in from the back and side walls, a roof slab over each bay to the wall.
  const D = 3.6, PH = 4.2;
  const bays = [];
  for (let k = -3; k <= 3; k++) bays.push([k * 4, -S + D, 0]);                       // back
  for (let k = -2; k <= 2; k++) { bays.push([-S + D, k * 4 + 1, 1]); bays.push([S - D, k * 4 + 1, 1]); }   // sides
  bays.forEach(([lx, lz, side], i) => {
    const [x, z] = P(lx, lz), broken = hh(i, 41) < 0.18;
    b.box(x, z, -1, broken ? PH * 0.45 : PH, 0.45, 0.45, facing, MAT.STONE, 760 + i, { ruin: broken ? 0.5 : 0.1 });
    if (broken) return;
    // The slab from the pier back to the wall (walkable from the breach and the stair).
    const cx = side ? (lx < 0 ? -S + D / 2 : S - D / 2) : lx, cz = side ? lz : -S + D / 2;
    const [sx, sz] = P(cx, cz);
    b.box(sx, sz, PH, PH + 0.45, side ? D / 2 + 0.3 : 2.05, side ? 2.05 : D / 2 + 0.3, facing, MAT.STONE, 800 + i, { ...NS, platform: true, solid: false });
  });
  // A stair up to the arcade roof in the back-left corner.
  for (let k = 0; k < 10; k++) { const [x, z] = P(-S + D + 1.2 + k * 0.62, -S + D + 1.4); b.box(x, z, -1, 0.42 * (k + 1), 0.31, 0.9, facing, MAT.STONE, 830 + k, { ...NS, platform: true }); }
  // The dry well: a ring of stones round a dark shaft, a broken windlass post.
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, [x, z] = P(Math.cos(a) * 1.5, Math.sin(a) * 1.5 + 1); b.box(x, z, -0.3, 0.75, 0.32, 0.5, facing + a, MAT.STONE, 850 + k, { ...NS }); }
  { const [x, z] = P(0, 1); b.blockers.push({ site: b.site, kind: 'circle', x, z, r: 1.9, y0: -0.3, y1: 0.75 }); }
  { const [x, z] = P(1.9, 1); b.box(x, z, -0.2, 2.2, 0.18, 0.18, facing, MAT.WOOD, 870, { ...NS, tilt: 0.2 }); }
  // Sand: banked against the walls outside and in, and a drift half filling the gateway — a mound
  // you walk up and over, its platforms stepped with its slope (≤ 0.35 m a step).
  for (let k = 0; k < 9; k++) {
    const a = hh(k, 51), ri = k % 4, along = (a - 0.5) * 2 * (S - 3), out = ri < 2 ? 1 : -1;
    const [lx, lz] = ri === 0 || ri === 2 ? [along, -S + out * (T + 1.6)] : [(-S) * (ri === 1 ? 1 : -1) + out * (T + 1.6) * (ri === 1 ? -1 : 1), along];
    const [x, z] = P(lx, lz);
    blob(b, x, z, -1.4, 0.9 + 1.2 * hh(k, 52), 3.5 + 3 * hh(k, 53), 1.8, facing + (ri === 0 || ri === 2 ? Math.PI / 2 : 0), MAT.SNOW, 880 + k, { lump: 0.15 });
  }
  const DR = 1.5;   // the drift's crest in the gateway (m)
  { const [x, z] = P(0, S); blob(b, x, z, -1.2, DR, 3.4, 6.5, facing, MAT.SNOW, 900, { lump: 0.1 }); }
  for (let k = -9; k <= 9; k++) {
    const lz = S + k * 0.62, top = DR * (1 - (k / 10) * (k / 10)) - 0.15;
    if (top < 0.2) continue;
    const [x, z] = P(0, lz);
    b.platforms.push({ site: b.site, x, z, hx: 3.0, hz: 0.31, cos: Math.cos(facing), sin: Math.sin(facing), top });
  }
}

/**
 * The erg's ruin sites. `table` maps seat ids to POIs ({ pos }); `height(x, z)` is the baked ground
 * (world/stair.js loadBakedHeight) for the aqueduct's absolute channel level (null: no aqueduct).
 */
export function ruinSites(table, height) {
  const at = (id, fallback) => (table[id] && table[id].pos) || fallback;
  const sites = [];
  const temple = at('ruin-sunken-temple', [2909, 1136]);
  sites.push({ id: 'ruin-sunken-temple', at: temple, facing: 2.6, build: sunkenTemple, footprint: 20 });
  // The colonnade: from the playa's edge north-east into a dune; each pair seated on its own ground,
  // sinking a little more than the one before.
  const c0 = [2032, 742], dir = [Math.cos(0.75), Math.sin(0.75)];
  for (let k = 0; k < 10; k++) sites.push({ id: 'ruin-colonnade-' + k, at: [c0[0] + dir[0] * k * 5.5, c0[1] + dir[1] * k * 5.5], facing: Math.atan2(dir[0], dir[1]), build: colonnadePair(k), footprint: 4.4, seatAt: 'center', sink: 0.25 * k + 0.08 * k * k });
  // The obelisk field: eight round a gnomon.
  const o = [2338, 905];   // on the open erg east of the Stride
  sites.push({ id: 'ruin-obelisk-gnomon', at: o, facing: 0.3, build: obelisk(0, true), footprint: 2.5, seatAt: 'center' });
  for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; sites.push({ id: 'ruin-obelisk-' + k, at: [o[0] + Math.cos(a) * 16, o[1] + Math.sin(a) * 16], facing: a, build: obelisk(k), footprint: 2.2, seatAt: 'center', sink: 0.6 * hh(k, 34) }); }
  // The Sun Gate on a ledge of the west wall above the canyon floor (the seat lies on the floor's edge), facing the sunrise.
  sites.push({ id: 'ruin-gate-sun', at: [1365, 1039], facing: 1.57, build: sunGate, footprint: 4, seatAt: 'center' });
  sites.push({ id: 'ruin-colossus-head', at: [2318, 1030], facing: 3.6, build: colossusHead, footprint: 6, seatAt: 'center', sink: 0.5 });
  // The caravanserai at the oasis (the Wellhouse camp, D11), on the flat playa west of the pool (the
  // camp's seat at 1800, 700 is up a dune's flank), its gate toward the water.
  sites.push({ id: 'ruin-caravanserai', at: [1810, 775], facing: Math.atan2(1846 - 1810, 736 - 775), build: caravanserai, footprint: 20, seatAt: 'center', sink: 0.6 });
  // The aqueduct along the wadi: spans of 13 m, the channel level easing down east above the bed.
  if (height) {
    const A = [1900, 262], B = [2330, 290], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.floor(L / 13);
    const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, facing = Math.atan2(ux, uz);
    let top = -Infinity;
    for (let k = 0; k <= n; k++) top = Math.max(top, height(A[0] + ux * k * 13, A[1] + uz * k * 13));
    for (let k = 0; k < n; k++) {
      const cx = A[0] + ux * (k + 0.5) * 13, cz = A[1] + uz * (k + 0.5) * 13;
      const g = Math.min(height(cx - ux * 6.5, cz - uz * 6.5), height(cx + ux * 6.5, cz + uz * 6.5));
      if (!Number.isFinite(g)) continue;
      const channel = top + 9 - 0.012 * k * 13;                  // high over the wadi and its dunes, a gentle fall east
      if (channel - g < 4) continue;                             // where the ground rises to it, nothing shows
      const fallen = hh(k, 77) < 0.22;
      sites.push({ id: 'ruin-aqueduct-' + k, at: [cx, cz], facing, build: aqueductSpan(k, 13, channel - g, fallen), footprint: 8, seatY: g });
    }
  }
  return sites;
}
