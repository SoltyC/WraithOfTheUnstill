// Placement seats for the Glass Dunes (Phase 9 D0): positions only, no meshes. Later milestones hang
// their content on these ids (ruins D7, the camp and the sites D11, caves Phase 13, glass D7).
// Coordinates follow docs/phase-9/dunes-design.md and figures/erg-plan.png (px = 512 + x/8 on the
// world map; the plan figure is 2.611 m per px with (122, 445) at x = 1000, z = 1000).

/** [id, kind, x, z, extra] */
const SEATS = [
  // The way in (item 4): lip and foot of the Dry Stair; the photo spot looks east from the lip.
  ['dry-stair-lip', 'road-seat', 1040, 380],
  // The camp and the Wellhouse (D11): a ruined caravanserai at the oasis on the playa.
  ['camp-wellhouse', 'camp-seat', 1800, 700, { facing: 0.6 }],
  ['oasis-well', 'spring-seat', 1830, 750],
  // Ruins (D7).
  ['ruin-long-walker', 'ruin', 2436, 1124, { note: 'the Long Walker, buried to the shoulders in a star megadune' }],
  ['ruin-sunken-temple', 'ruin', 2909, 1136, { note: 'the Buried Door: the temple dome, its vent and stair under sand' }],
  ['ruin-aqueduct', 'ruin', 1900, 262, { note: 'aqueduct arches follow the wadi east from the escarpment', to: [2330, 290] }],
  ['ruin-gate-sun', 'ruin', 1439, 1039, { note: 'the Sun Gate, on the Galleries\' west rim' }],
  // Sites that need a seat before their puzzle (D11).
  ['site-hourglass', 'site', 1655, 443], ['site-flood-garden', 'site', 1559, 626], ['site-frozen-falls', 'site', 1595, 117],
  ['site-mirage-map', 'site', 1940, 177], ['site-singing-dunes', 'site', 2692, 744],
  // Glass fields (the Glass Battle's five fused formations, and the Walker's glass footprints).
  ['glass-1', 'glass-field', 2634, 825], ['glass-2', 'glass-field', 2762, 707], ['glass-3', 'glass-field', 2595, 629],
  ['glass-4', 'glass-field', 2535, 459], ['glass-5', 'glass-field', 2680, 560],
  // Echo stones: one by the way in, one in each ravine system, one at the heart, one at the edge of the cold erg.
  ['echo-dunes-1', 'echo-seat', 1250, 392], ['echo-dunes-2', 'echo-seat', 1590, 1135], ['echo-dunes-3', 'echo-seat', 2300, 205],
  ['echo-dunes-4', 'echo-seat', 2530, 1230], ['echo-dunes-5', 'echo-seat', 2150, 1640],
  // Cave mouths (Phase 13 seats only): the Needle's end, the Galleries' south end, the Stride's lip, under the temple dome.
  ['cave-needle', 'cave-mouth', 1806, 428], ['cave-galleries', 'cave-mouth', 1668, 20], ['cave-stride', 'cave-mouth', 2232, 760], ['cave-temple', 'cave-mouth', 2905, 1100],
  // The arena regrade: a ring of half-buried columns (a seat only: the meso keeps the arena flat).
  ['arena-ring', 'arena-ring', 2436, 1124, { r: 120, n: 12 }],
];

export function seatPOIs() {
  return SEATS.map(([id, kind, x, z, extra]) => ({ id, kind, biome: kind === 'road-seat' ? 'meadow' : 'dunes', pos: [x, z], ...(extra || {}) }));
}
