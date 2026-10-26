// The erg's ravines (docs/phase-9/dunes-design.md §7), by hand: control points are (x, z) metres.
// Coordinates follow the doc where it gives them and the figure (figures/erg-plan.png) otherwise;
// the canyon's south end bends SE to follow the escarpment's foot (the foot leaves x ≈ 1500 there).

/** Pitch (m) of the canyon walls' ledges: strata at multiples of this above sea level, so they line up. */
export const STRATA = 12;

/** The Red Galleries: the main canyon along the escarpment foot, plus three side galleries. Floor half-widths
 *  run from w0 to w1 (40–120 m floors), depth is the wall height below the lower rim (30–80 m). */
export const CANYONS = [
  { id: 'red-galleries', kind: 'canyon', w: [20, 60], depth: [38, 66], slope: 1.05, wander: 22,
    pts: [[1500, 1380], [1480, 1250], [1468, 1120], [1484, 1000], [1512, 880], [1526, 760], [1522, 640], [1536, 520], [1534, 400], [1530, 290], [1556, 190], [1610, 100], [1668, 20], [1700, -50]] },
  { id: 'gallery-sun', kind: 'canyon', w: [14, 22], depth: [26, 36], slope: 1.05, wander: 10, parent: 'red-galleries',
    pts: [[1470, 1122], [1540, 1150], [1600, 1138], [1648, 1172]] },
  { id: 'gallery-flood', kind: 'canyon', w: [16, 28], depth: [24, 34], slope: 1.05, wander: 10, parent: 'red-galleries',
    pts: [[1524, 642], [1584, 612], [1646, 592], [1700, 604]] },
  { id: 'gallery-falls', kind: 'canyon', w: [14, 24], depth: [30, 44], slope: 1.05, wander: 10, parent: 'red-galleries',
    pts: [[1556, 190], [1604, 140], [1664, 92], [1716, 70]] },
];

/** Slot canyons: a 10 m wide trench (the wall kit of D7b dresses it), 20–40 m deep, branching off a gallery's wall. */
export const SLOTS = [
  { id: 'needle', kind: 'slot', half: 5, depth: 38, rise: 0.04, parent: 'red-galleries', wander: 14,
    pts: [[1534, 440], [1600, 458], [1668, 432], [1738, 414], [1806, 428]] },
  { id: 'hourglass', kind: 'slot', half: 5, depth: 34, rise: 0.045, parent: 'red-galleries', wander: 12,
    pts: [[1528, 520], [1590, 546], [1650, 538], [1704, 572], [1752, 612]] },
];

/** The Dry Braids: wadis (30–150 m wide, 3–8 m deep) with braided channels round gravel bars. */
export const WADIS = [
  { id: 'wadi-a', kind: 'wadi', half: 44, depth: 6.5, pts: [[1580, 272], [1648, 292], [1830, 316], [2000, 324], [2180, 300], [2340, 285]] },
  { id: 'wadi-b', kind: 'wadi', half: 52, depth: 7, pts: [[1600, 250], [1757, 235], [1950, 228], [2144, 225], [2340, 262], [2541, 296], [2730, 312], [2915, 319]] },
  { id: 'wadi-c', kind: 'wadi', half: 30, depth: 5, pts: [[1757, 235], [1830, 205], [1909, 178], [2060, 172], [2235, 175], [2400, 230], [2541, 296]] },
];

/** The Stride: one deep crack across the erg (about 60 m deep, 15–40 m wide), with two land bridges. */
export const RIFT = {
  id: 'stride', kind: 'rift', w: [8, 20], depth: 60, slope: 4.5, wander: 30,
  pts: [[2120, 1480], [2150, 1330], [2175, 1170], [2185, 1000], [2215, 830], [2250, 660], [2290, 490], [2340, 380], [2380, 300]],
  bridges: [0.36, 0.74],
};

/** Salt pans and playas (flat interdune ground): centre, semi-axes (m). The Wellhouse's is first. */
export const PANS = [
  { id: 'playa-well', pos: [1830, 750], rx: 270, rz: 150 },
  { id: 'pan-north', pos: [2790, 1420], rx: 200, rz: 120 },
  { id: 'pan-east', pos: [3000, 780], rx: 230, rz: 140 },
  { id: 'pan-heart', pos: [2060, 1180], rx: 150, rz: 100 },
  { id: 'pan-south', pos: [2520, -250], rx: 260, rz: 130 },
  { id: 'pan-margin', pos: [1960, 1530], rx: 180, rz: 90 },
];

/** Where the seif dunes begin: the interdune belt along the wadis (z ≈ 250) hides the seam. */
export const SEIF_BELT = { z: 250, wander: 30, from: 1600 };

/** The arena's heart: the Warden's star megadune country (the arena itself is regraded flat). */
export const HEART = { pos: [2436, 1124], arena: 150 };
