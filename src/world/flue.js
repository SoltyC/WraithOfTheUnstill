// The old kiln flue (docs/direction.md M1, the meadow's first piece; data/quests/meadow.json "The Cold Forge"). The manor's
// kilns, where Bryn worked, ran their smoke under the hill and out through three stone vents in the forest north of the manor;
// the same draught pulled through Garrow's forge in Hearn. Since the bell stopped, turf has grown over all three mouths. The
// Wraith pulls them clear by hand (systems/flue.js), and so has seen, before the fight, three vents sealed with turf: the
// hall's chimney stacks, 38 m up and out of reach of hands, are capped the same way.
// Sites: the stone vents (always), and one turf cap per vent (hidden once pulled clear). Appended after every earlier site.

import { MAT, NS } from './architecture.js';

/** The three vents round the flue's place: [dx, dz, collar radius, height]. */
export const FLUE_VENTS = [[-2.6, 1.2, 0.72, 1.7], [1.9, 2.4, 0.62, 1.35], [0.6, -2.5, 0.8, 1.9]];

function vents(b, facing, R) {
  // A low ring of fallen dressed stone, half sunk in the leaf litter, round the three mouths.
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + R() * 0.4, r = 4.8 + R() * 1.0;
    b.box(Math.cos(a) * r, Math.sin(a) * r, -0.5, -0.05 + R() * 0.3, 0.32 + R() * 0.22, 0.22 + R() * 0.12, a + R() * 0.6, MAT.STONE, 40 + k, { solid: false, ...NS, ruin: 0.3 });
  }
  FLUE_VENTS.forEach(([x, z, r, h], i) => {
    // The collar: dressed stone, sooted at the lip, a little out of true.
    b.drum(x, z, -0.8, h, r + 0.18, r, 10, MAT.STONE, 10 + i * 3, { solid: true });
    b.drum(x, z, h - 0.25, h + 0.05, r + 0.05, r - 0.02, 10, MAT.IRON, 11 + i * 3, { solid: false });
    // The open mouth: soot-black inside the lip (seen once the turf is off).
    b.drum(x, z, h - 0.6, h - 0.04, r * 0.78, r * 0.8, 10, MAT.EMBER, 12 + i * 3, { solid: false });
  });
}

/** The turf cap that seals vent i: a domed sod with roots hanging over the lip. */
function turfCap(i) {
  const [x, z, r, h] = FLUE_VENTS[i];
  return (b, facing, R) => {
    // A dome of sod in stacked rings (the hall's turf caps are built the same way: world/manor.js turf), lumpy, overhanging the lip.
    const top = 0.5 + R() * 0.25;
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4, ra = (r + 0.16) * Math.cos(t0 * 1.35), rb = (r + 0.16) * Math.cos(t1 * 1.35);
      b.drum(x + (R() - 0.5) * 0.06, z + (R() - 0.5) * 0.06, h - 0.25 + top * Math.sin(t0 * 1.35), h - 0.25 + top * Math.sin(t1 * 1.35) + 0.02, ra, Math.max(0.08, rb), 11, MAT.EARTH, 60 + i * 7 + k, { solid: false });
    }
    // Roots and sod hanging over the lip.
    for (let k = 0; k < 5; k++) { const a = R() * Math.PI * 2; b.box(x + Math.cos(a) * (r + 0.14), z + Math.sin(a) * (r + 0.14), h - 0.75, h - 0.15, 0.07, 0.05, a, MAT.EARTH, 90 + i * 5 + k, { solid: false, ...NS }); }
  };
}

export function flueSites(table) {
  const p = table['meadow-flue'];
  if (!p) return [];
  const at = p.pos;
  return [
    { id: 'flue-vents', at, facing: 0, build: vents, footprint: 5.5, seatAt: 'center' },
    // (The caps share the vents' footprint: the same seat, so they sit on the collars.)
    ...FLUE_VENTS.map((_, i) => ({ id: 'flue-turf-' + i, at, facing: 0, build: turfCap(i), footprint: 5.5, seatAt: 'center' })),
  ];
}
