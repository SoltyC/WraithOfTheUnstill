// The crater's pit (docs/phase-11/ember-design.md §3, "you look in and you can see lava boiling"): the cone's geography
// (geography.mjs volcano()) leaves only a shallow bowl at the summit, so a pit is cut into the 2 m height: a lake floor
// (the lava lake, systems/volcano.js, lies over it), walls climbing in rough terraces (steep risers, narrow treads, the tiers
// wandering round the pit), and on the side that faces the Ash Chapel a promontory at the rim's height with a ramp down to
// it — where the Wraith stands to look in and to lend its motion (systems/emberClock.js). No face steeper than about 60°:
// a steeper one, on the 2 m grid, rings in the terrain's cubic filter (flutes, a sawtooth rim).
//
// It only lowers the ground, meeting it in a soft crease (a smooth minimum): the bake applies it once (tools/bake-world/
// index.mjs); tools/world/carveCrater.mjs applies it to the committed tiles from git HEAD's, so it can be re-run.

export const PIT = {
  x: 2350, z: -2150,
  floor: 688,        // m: the lake's bed
  lake: 72,          // m: the lake's radius (wobbled ±12 m round it)
  rise: 1.0,         // the wall's mean slope (m up per m out); the tiers swing it from 0.3 to 1.7
  tier: 15,          // m between the terraces' treads (horizontally)
  bench: { a: -2.36, half: 0.2, r0: 88, r1: 120, y: 745, ramp: 0.6 },   // toward the chapel (atan2 dz, dx): a ledge, then a ramp up to the rim
  reach: 230,        // m: nothing beyond is touched
};

const fract = (v) => v - Math.floor(v);
const hash = (i) => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);
/** A smooth periodic noise round the pit (angle in radians), −1..1. */
function ring(a, k, seed) {
  const t = (a / (Math.PI * 2) + 0.5) * k, i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  const v0 = hash((i % k) + seed), v1 = hash(((i + 1) % k) + seed);
  return (v0 + (v1 - v0) * u) * 2 - 1;
}
/** A smooth 2D value noise, −1..1. */
function vnoise(x, z, seed) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const h = (a, b) => hash(a * 157 + b * 113 + seed * 7);
  return ((h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v) * 2 - 1;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The lake's radius at an angle. */
export function lakeRadius(a) { return PIT.lake + 9 * ring(a, 7, 3) + 3 * ring(a, 19, 11); }

/** The pit's ground at (x, z) (m), or Infinity where it does not reach (the ground stays). */
export function craterTarget(x, z) {
  const dx = x - PIT.x, dz = z - PIT.z, r = Math.hypot(dx, dz);
  if (r > PIT.reach) return Infinity;
  const a = Math.atan2(dz, dx), rl = lakeRadius(a), d = r - rl;
  // The wall: terraces — the slope swings between tread and riser along d, the tiers' phase wandering round the pit.
  // (Phase and strength from noise over the ground, so the tiers break, merge and die out into scree.)
  const w = (Math.PI * 2) / PIT.tier, ph = 2.2 * ring(a, 9, 5) + 0.8 * ring(a, 23, 13) + 2.5 * vnoise(x / 40, z / 40, 17);
  const amp = 0.7 * smooth(-0.6, 0.4, ring(a, 6, 29) + 0.6 * vnoise(x / 60, z / 60, 31));
  const terr = -amp * (Math.sin(w * d + ph) - Math.sin(ph)) / w + 2.5 * ring(a, 13, 7) * smooth(0, 30, d) + 3 * vnoise(x / 25, z / 25, 41) * smooth(0, 15, d);
  let wall = d <= 0 ? PIT.floor - 2 * smooth(0, -20, d) : PIT.floor + PIT.rise * d + terr;
  // The bench and its ramp, toward the chapel.
  const B = PIT.bench;
  let da = Math.abs(a - B.a); da = Math.min(da, Math.PI * 2 - da);
  const s = 1 - smooth(B.half * 0.6, B.half, da);
  if (s > 0) {
    // A promontory: flat out to r0, its front falling into the pit at the wall's own slope (no sheer step: a cliff
    // steeper than the 2 m grid can hold rings in the terrain's cubic filter), then the ramp up to the rim behind.
    const bench = r < B.r0 ? B.y - PIT.rise * (B.r0 - r) : r < B.r1 ? B.y : B.y + B.ramp * (r - B.r1);
    wall += (Math.max(wall, Math.min(bench, B.y)) - wall) * s;
    if (r >= B.r1) wall += (Math.min(wall, bench) - wall) * s;
  }
  return wall;
}

/** Lower a 2 m height grid to the pit. get(i, j) / set(i, j, m) over texel (i, j); centre(i) / centreZ(j) give its world x, z. */
export function carveCrater(get, set, x0, x1, z0, z1, texel, half) {
  let n = 0;
  const i0 = Math.floor((x0 + half) / texel), i1 = Math.ceil((x1 + half) / texel), j0 = Math.floor((half - z1) / texel), j1 = Math.ceil((half - z0) / texel);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = (i + 0.5) * texel - half, z = half - (j + 0.5) * texel, t = craterTarget(x, z);
    if (t === Infinity) continue;
    const h = get(i, j);
    // A smooth minimum (k m): the rim a rounded lip, not a crease the grid saws.
    const k = 6, m = Math.min(h, t) - Math.max(k - Math.abs(h - t), 0) ** 2 / (4 * k);
    if (m < h - 1e-3) { set(i, j, m); n++; }
  }
  return n;
}

/** The ledge over the lake (on the bench, toward the chapel): where the Wraith stands to look in. */
export const LEDGE = { x: PIT.x + Math.cos(PIT.bench.a) * 104, z: PIT.z + Math.sin(PIT.bench.a) * 104 };
/** The lake's level by the mountain's stage (0 asleep … 4 Fire, 5 the eruption), m. */
export const LAKE_LEVEL = [691, 695, 703, 714, 727, 736];
