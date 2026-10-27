// The dune-type map (Phase 9 D0): rg8 at 32 m, the same grid as the wind. R is the type coordinate
// on the axis barchan 0 — transverse 1/3 — star 2/3 — seif 1 (src/terrain/dunes.js blends the two
// nearest); G is the flat weight (playas, salt pans, ravine floors, the arena, the interdune belt).
//   barchans   on the stony margin by the escarpment (x < ~2000, z 300–1700)
//   transverse the main basin (today's layer)
//   star       the heart round the Warden's arena
//   seif       south of the Dry Braids, toward the ember side; a flat belt hides the seam
// Everything agrees with the wind (the meso builds each type in the wind frame). No phase seed: the
// meso hashes its cells by position, which is stable and needs no byte.
import { smooth } from './geography.mjs';
import { gfbm } from '../../src/terrain/gnoise.js';
import { PANS, SEIF_BELT, HEART } from './ravinesData.mjs';
import { ravineFlat } from './ravines.mjs';

const sqrt = Math.sqrt;
const T_TRANS = 1 / 3, T_STAR = 2 / 3;

/** Writes (type, flat) for (x, z) to out[0..1]. `feats` are the carved ravines. */
export function duneAt(x, z, feats, out) {
  // Margin barchans: west of x ≈ 2000, between the wadis' belt and the cold edge.
  const mW = (1 - smooth(1750, 2250, x)) * smooth(330, 600, z) * (1 - smooth(1500, 1800, z));
  let t = T_TRANS * (1 - mW);
  // The star heart.
  const hx = x - HEART.pos[0], hz = z - HEART.pos[1];
  const sW = 1 - smooth(450, 800, sqrt(hx * hx + hz * hz));
  t += (T_STAR - t) * sW;
  // Seif south of the belt, which wanders.
  const zb = SEIF_BELT.z + SEIF_BELT.wander * gfbm(x / 500, 0.9, 2, 9300) * 1.6, rel = z - zb;
  const east = smooth(1440, 1520, x);
  t += (1 - t) * smooth(80, -80, rel) * east;
  let flat = (1 - smooth(70, 200, rel < 0 ? -rel : rel)) * smooth(SEIF_BELT.from - 200, SEIF_BELT.from + 100, x) * 0.97;
  // Playas and pans: elliptical, eased edge, a little ragged.
  for (const p of PANS) {
    const dx = (x - p.pos[0]) / p.rx, dz = (z - p.pos[1]) / p.rz, e = sqrt(dx * dx + dz * dz);
    const v = 1 - smooth(0.7, 1.25, e + 0.1 * gfbm(x / 90, z / 90, 2, 9310));
    if (v > flat) flat = v;
  }
  // The arena: regraded flat.
  const ar = sqrt(hx * hx + hz * hz), av = 1 - smooth(HEART.arena * 0.8, HEART.arena * 1.5, ar);
  if (av > flat) flat = av;
  const rv = ravineFlat(feats, x, z);
  if (rv > flat) flat = rv;
  out[0] = t; out[1] = flat;
}

/** The map as RG8 (nw × nw, row 0 = north, cell-centred). */
export function bakeDuneMap(feats, nw, cw, half) {
  const map = new Uint8Array(nw * nw * 2), o = new Float64Array(2);
  for (let j = 0; j < nw; j++) for (let i = 0; i < nw; i++) {
    duneAt(-half + (i + 0.5) * cw, half - (j + 0.5) * cw, feats, o);
    map[(j * nw + i) * 2] = Math.round(Math.max(0, Math.min(1, o[0])) * 255);
    map[(j * nw + i) * 2 + 1] = Math.round(Math.max(0, Math.min(1, o[1])) * 255);
  }
  return map;
}
