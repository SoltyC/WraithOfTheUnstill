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
  { const [x, z] = P(0, -1.6); b.frustum(x, z, 6.0, 13.5, 3.6, 3.0, 4.6, 3.4, facing, MAT.GLYPH, 510); }             // headdress
  { const [x, z] = P(-1.4, -1.0); b.box(x, z, 13.4, 14.6, 2.2, 1.9, facing - 0.3, MAT.STONE, 511, { ...NS, tilt: 0.35, solid: false }); } // its broken crown
  for (let k = 0; k < 6; k++) { const a = hh(k, 61) * 6.28, d = 8 + 6 * hh(k, 62), [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; b.box(x, z, -0.5, 0.3 + 0.6 * hh(k, 63), 0.7 + 0.5 * hh(k, 64), 0.5, a, MAT.STONE, 512 + k, { ...NS, tilt: (hh(k, 65) - 0.5) * 0.4 }); }
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
