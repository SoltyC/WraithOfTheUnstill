// The Bell Ledge (docs/mace-design.md §6, docs/cross-biome.md §3): a stone ledge 14.6 m up a bastion of
// dressed Shaper stone behind the monastery, with a bell frame standing on it. The great bell and the
// mace hung in it as its clapper are the weapon mesh's (render/weaponGeo3.js, slot MACE_FIND); this
// is the stone: the stepped bluff (courses of ashlar, the top paved), two carved pillars and a
// lintel, and fieldstone (world/blobStone.js) at its foot and on the ledge. It cannot be climbed:
// every face is a wall, and the ground behind it never rises to the ledge. Only an Updraft from the
// hollow in front of it (the hounds sleep there) gets the Wraith up, and the way down is the first plunge.
// Built into the one architecture mesh like the nooks (world/nookSites.js); the site table is appended last.

import { MAT } from './architecture.js';
import { blob } from './blobStone.js';

/** Where it stands, from the monastery's pad: this far behind the hall along its back (the ground is level there). */
export const LEDGE = { back: 38, top: 14.6, beam: 17.7, hollow: 9, houndSpread: 3.2, wake: 10 };

const TAU = Math.PI * 2;
const frame = (yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (u, f) => [u * c + f * s, -u * s + f * c]; };

/** Build the bluff, the frame and the stones (site-local; y = 0 is the seat, `facing` toward the hollow and the monastery). */
export function buildBellLedge(b, facing, R) {
  const P = frame(facing), T = LEDGE.top;
  // The bastion: three stepped courses of ashlar (the plinth builder lays the walls and paves each top), the last one the ledge.
  b.box(0, 0, -3.2, 5.2, 6.0, 5.0, facing, MAT.STONE, 1, { drift: false });
  { const [x, z] = P(0.5, -0.5); b.box(x, z, 5.2, 10.4, 5.0, 4.0, facing, MAT.STONE, 2, { drift: false }); }
  { const [x, z] = P(0.5, -0.9); b.box(x, z, 10.4, T, 4.2, 3.4, facing, MAT.STONE, 3, { platform: true, drift: false }); }
  // Buttresses down the front face, battered toward the ground, and string courses between the stages.
  for (const u of [-3.4, 3.4]) {
    const [x, z] = P(u, 5.3);
    b.frustum(x, z, -3.2, 10.4, 1.0, 1.2, 0.7, 0.55, facing, MAT.STONE, 20 + u);
  }
  { const [x, z] = P(0.5, -0.5); b.box(x, z, 5.1, 5.35, 5.25, 4.25, facing, MAT.STONE, 30, { solid: false, drift: false }); }
  { const [x, z] = P(0.5, -0.9); b.box(x, z, 10.3, 10.55, 4.45, 3.65, facing, MAT.STONE, 31, { solid: false, drift: false }); }
  // A carved band on the front of the middle stage: the Shapers' marks that tell what hangs above.
  { const [x, z] = P(0.5, 3.55); b.box(x, z, 6.4, 8.9, 2.1, 0.12, facing, MAT.GLYPH, 32, { carve: 2, solid: false, drift: false, cap: false }); }
  // The bell frame on the ledge: two carved pillars and a lintel (the bell hangs from it, 3.1 m under).
  const ledgeZ = -0.9;
  for (const s of [-1, 1]) { const [x, z] = P(0.5 + s * 2.3, ledgeZ); b.box(x, z, T, LEDGE.beam + 0.55, 0.42, 0.42, facing, MAT.GLYPH, 40 + s, { carve: 1, drift: false }); }
  { const [x, z] = P(0.5, ledgeZ); b.box(x, z, LEDGE.beam, LEDGE.beam + 0.55, 2.95, 0.5, facing, MAT.STONE, 42, { drift: false, solid: false }); }
  { const [x, z] = P(0.5, ledgeZ + 0.52); b.box(x, z, LEDGE.beam + 0.1, LEDGE.beam + 0.45, 2.2, 0.04, facing, MAT.GLYPH, 43, { carve: 3, solid: false, drift: false, cap: false }); }
  // Fieldstone: scree at the foot of the bluff and round the hollow, and a few stones fallen on the ledge.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU + R() * 0.3, r = 6.4 + R() * 3.2, [x, z] = P(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.8 + 1.2);
    if (Math.sin(a) < -0.3) continue;               // none behind it (the hill rises there)
    blob(b, x, z, -0.5, 0.2 + R() * 0.55, 0.35 + R() * 0.3, 0.28 + R() * 0.25, R() * TAU, MAT.STONE, 50 + k, { lump: 0.18, solid: R() > 0.5 });
  }
  for (const [u, f, w] of [[-3.1, 1.3, 0.34], [3.5, 1.6, 0.28], [-2.6, -2.2, 0.3]]) {
    const [x, z] = P(0.5 + u, ledgeZ + f);
    blob(b, x, z, T - 0.1, T + 0.32 + R() * 0.15, w, w * 0.8, R() * TAU, MAT.STONE, 70 + (u | 0), { lump: 0.16 });
  }
}

/** The site: seated at the ground's centre under it, facing the monastery. `table` is the baked POIs by id. */
export function bellLedgeSites(table) {
  const mon = table.monastery;
  if (!mon) return [];
  const mf = mon.facing ?? 0, at = [mon.pos[0] - Math.sin(mf) * LEDGE.back, mon.pos[1] - Math.cos(mf) * LEDGE.back];
  const facing = Math.atan2(mon.pos[0] - at[0], mon.pos[1] - at[1]);
  return [{ id: 'bell-ledge', at, facing, build: buildBellLedge, footprint: 7, seatAt: 'center' }];
}

/** Where the two sleeping hounds lie: in the hollow in front of the bluff (world x, z), and the point to cast an Updraft from. */
export function bellLedgeHollow(site) {
  const c = Math.cos(site.facing), s = Math.sin(site.facing), at = (u, f) => [site.at[0] + u * c + f * s, site.at[1] - u * s + f * c];
  return { hounds: [at(-LEDGE.houndSpread, LEDGE.hollow + 1), at(LEDGE.houndSpread, LEDGE.hollow)], foot: at(0.5, 5.6) };
}
