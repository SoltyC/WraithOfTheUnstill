// Ebbhold (Phase 10 U3–U4; docs/phase-10/plan.md, storylines.md *The Lung*). User, 2026-11-02: "we want it to be huge instead of
// feeling like some interconnected boxes" (references: the monumental dwarf-halls of film — colossal pillars out of an abyss,
// walkways and bridges over the void, ranks of statues, geometric relief, light in shafts through haze). Not a copy: the motifs
// are the Shapers' own (tide chevrons, wave-stepped frames, veiled figures with staves).
//
// One colossal hall, the Tide Hall, is the city: a chasm whose drowned floor is the great well (the Listener's strand), crossed by a
// causeway lined with statues to the register's platform and on to the sea-doors; galleries in three tiers along its long walls,
// joined by long stairs and by bridges high over the void; pillars rising out of the dark to a roof cut with slits that let the
// sea-light down. The people's rooms open off the galleries. Under the west gate, the intake stair climbs from the undercroft.
//
// It lives in a sealed space of its own (the whirlpool's cut hides the move): beyond the world's west edge and deep, so nothing of
// the terrain is near. From one generator come the collision (boxes: floors, walls, flights, ceilings), the rooms' air (the camera
// stays in it), the water, the lamps and the mesh's decoration (render/ebbhold.js). Queries are allocation-free.

/** Where the sealed city sits in the world (m). */
export const EBB_ORIGIN = { x: -4700, y: 400, z: -1400 };   // above sea level: below it the atmosphere puts the camera inside the planet (no sunlight)

/** The hall's dimensions (local m). */
export const HALL = { L: 260, HW: 45, walk: 0, g1: 24, g2: 48, roof: 110, floor: -80, water: -50 };
/** The roof's slits (local x0, x1, z0, z1) and the sea-light's fixed slant down through them (unit, pointing down): the hall's own
 *  light, not the sun's — the beams always fall the same way (shaders/ebbhold.wgsl.js on the stone, post/compose in the haze). */
export const SLITS = Array.from({ length: 6 }, (_, k) => [25 + k * 42 - 1.5, 25 + k * 42 + 1.5, -24, 24]);
export const BEAM_DIR = (() => { const v = [0.32, -1, 0.22], l = Math.hypot(...v); return v.map((c) => c / l); })();
/** The great pillars: two rows (local x, ±z), square 9 m across the flats. */
export const PILLARS = { x: [40, 80, 180, 220], z: 23, s: 9 };
/** WGSL: slitMask(local xz on the roof) → 0..1 (soft-edged), beamAt(local point) → how much of the sea-light reaches it. */
export const BEAM_WGSL = /* wgsl */ `
const EBB_O: vec3f = vec3f(${-4700}.0, ${400}.0, ${-1400}.0);
const EBB_ROOF: f32 = ${110}.0;
const EBB_BEAM: vec3f = vec3f(${BEAM_DIR.map((c) => c.toFixed(5)).join(', ')});
fn slitMask(r: vec2f) -> f32 {
  if (r.y < -24.0 || r.y > 24.0 || r.x < 22.0 || r.x > 238.0) { return 0.0; }
  let k = round((r.x - 25.0) / 42.0);
  let dx = 1.5 - abs(r.x - (25.0 + k * 42.0));
  // Each slit is a row of short openings (5 m open, 3 m stone): many narrow beams, not one sheet.
  let fz = abs(fract((r.y + 24.0) / 8.0) * 8.0 - 2.5);
  let dz = min(24.0 - abs(r.y), 2.5 - fz);
  return smoothstep(0.0, 0.8, dx) * smoothstep(0.0, 0.8, dz);
}
/** Is (x, z) under a slab at level y (the causeway, the platforms, the galleries, the bridges)? */
fn slabAt(x: f32, z: f32, y: f32) -> bool {
  let az = abs(z);
  if (az > 33.0) { return true; }                                        // the galleries, every tier
  if (y < 1.0) {
    if (x > 108.0 && x < 152.0) { return true; }                         // the register's platform
    if (x > 226.0 && az < 20.0) { return true; }                         // the sea-door landing
    return az < 6.0 && x > 0.0;                                          // the causeway
  }
  if (y < 25.0) { return (x > 58.0 && x < 66.0) || (x > 196.0 && x < 204.0); }   // the bridges
  return false;
}
fn beamAt(p: vec3f) -> f32 {
  if (p.y > EBB_ROOF) { return 0.0; }
  // Up the beam to each slab level above the point: a slab there keeps the light off it.
  for (var i = 0; i < 3; i++) {
    let ly = f32(i) * 24.0;
    if (p.y < ly - 0.05) {
      let q = p - EBB_BEAM * ((ly - p.y) / (-EBB_BEAM.y));
      if (slabAt(q.x, q.z, ly)) { return 0.0; }
    }
  }
  let t = (EBB_ROOF - p.y) / (-EBB_BEAM.y);
  let r = p - EBB_BEAM * t;
  let m = slitMask(r.xz);
  if (m <= 0.0) { return 0.0; }
  // The great pillars stand in the light's way: the beam's line up to the roof passing through one (in plan) keeps it off.
  let a = p.xz; let ab = r.xz - a; let il = 1.0 / max(dot(ab, ab), 1e-4);
  var px = array<f32, 4>(${PILLARS.x.join('.0, ')}.0);
  for (var i = 0; i < 8; i++) {
    let c = vec2f(px[i & 3], select(-${PILLARS.z}.0, ${PILLARS.z}.0, i > 3));
    let q = a + ab * clamp(dot(c - a, ab) * il, 0.0, 1.0) - c;
    if (dot(q, q) < ${((PILLARS.s / 2 - 0.1) ** 2).toFixed(2)}) { return 0.0; }
  }
  return m;
}
`;

/**
 * The city: { boxes, airs, pools, lamps, glows, decor, spawns, exit }.
 * boxes: { x0, x1, y0, y1, z0, z1, kind, ramp? } (local). kinds: wall, floor, ceiling, column, rail, statue, plinth, prop, door, stair.
 * airs: { id, x0, x1, y0, y1, z0, z1, water (local level or null) } — the rooms' air; the camera and the water ask them.
 * decor (visual only): pillars, pilasters, statues, windows for the mesh.
 */
export function buildCity() {
  const H = HALL, L = H.L, HW = H.HW;
  const boxes = [], airs = [], pools = [], lamps = [], glows = [], decor = [];
  const B = (x0, x1, y0, y1, z0, z1, kind, extra) => { boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), kind, ...extra }); };
  const ramp = (x0, x1, z0, z1, ya, yb, axis) => {
    // A flight: its top rises from ya at the axis's low end to yb at its high end; 1.2 m thick under its line (passable beneath).
    const a = axis === 'x' ? x0 : z0, b = axis === 'x' ? x1 : z1;
    boxes.push({ x0, x1, z0, z1, y0: Math.min(ya, yb) - 1.2, y1: Math.max(ya, yb), kind: 'stair', ramp: { axis, a, b, y0: ya, y1: yb, steps: true } });
  };
  const rail = (x0, x1, z0, z1, y) => B(x0, x1, y, y + 1.15, z0, z1, 'rail');

  // ── The hall ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  airs.push({ id: 'tideHall', x0: 0, x1: L, z0: -HW, z1: HW, y0: H.floor, y1: H.roof, water: H.water });
  B(0, L, H.floor - 2, H.floor, -HW, HW, 'floor');
  const alcoveDoors = [];
  // Roof with slits for the sea-light: six bays, a slit across each above the chasm.
  const slits = [];
  for (let k = 0; k < 6; k++) { const cx = 25 + k * 42; for (let j = 0; j < 6; j++) slits.push({ u0: cx - 1.5, u1: cx + 1.5, v0: -24 + j * 8 + 0.5, v1: -24 + j * 8 + 5.5 }); }
  for (const [u0, u1, v0, v1] of subtractHoles(-2, L + 2, -HW - 2, HW + 2, slits)) B(u0, u1, H.roof, H.roof + 8, v0, v1, 'ceiling');
  // West wall: the gate (12 × 16). East wall: the sea-doors (28 × 56), shut, in bronze.
  for (const [u0, u1, v0, v1] of subtractHoles(-HW - 2, HW + 2, H.floor - 2, H.roof, [{ u0: -6, u1: 6, v0: 0, v1: 16 }])) B(-2, 0, v0, v1, u0, u1, 'wall');
  for (const [u0, u1, v0, v1] of subtractHoles(-HW - 2, HW + 2, H.floor - 2, H.roof, [{ u0: -14, u1: 14, v0: 0, v1: 56 }])) B(L, L + 2, v0, v1, u0, u1, 'wall');
  B(L - 0.6, L, 0, 56, -14, 14, 'door');

  // ── The causeway, the platforms ─────────────────────────────────────────────────────────────────────────────────────────
  const plat = { x0: 108, x1: 152 };
  const land = { x0: L - 34, x1: L };
  B(0, plat.x0, -2.5, 0, -6, 6, 'floor');
  B(plat.x1, land.x0, -2.5, 0, -6, 6, 'floor');
  B(plat.x0, plat.x1, -3, 0, -33, 33, 'floor');
  B(land.x0, land.x1, -3, 0, -20, 20, 'floor');
  for (const [a, b] of [[0, plat.x0], [plat.x1, land.x0]]) { rail(a, b, 5.6, 6, 0); rail(a, b, -6, -5.6, 0); }
  rail(plat.x0, plat.x0 + 0.4, 6, 33, 0); rail(plat.x0, plat.x0 + 0.4, -33, -6, 0); rail(plat.x1 - 0.4, plat.x1, 6, 33, 0); rail(plat.x1 - 0.4, plat.x1, -33, -6, 0);
  rail(land.x0, land.x0 + 0.4, 6, 20, 0); rail(land.x0, land.x0 + 0.4, -20, -6, 0); rail(land.x0, land.x1 - 2, 19.6, 20, 0);
  // The register: a stone book on a stepped plinth, in the platform's middle.
  B(127, 133, 0, 0.5, -3, 3, 'plinth'); B(128.8, 131.2, 0.5, 1.6, -1.2, 1.2, 'prop', { prop: 'register' });
  // Down into the drowned depth from the landing's south edge (and up out of it).
  ramp(land.x0 + 2, land.x1 - 4, -24, -20, H.water - 2, 0, 'x');

  // ── Galleries in three tiers on the long walls, their stairs, the bridges ────────────────────────────────────────────────
  const GD = 12;
  // Where a rail is broken: the platform meets the walk galleries; the bridges meet g1.
  const BRIDGES = [58, 196];
  const gaps = { [H.walk]: [[plat.x0, plat.x1]], [H.g1]: BRIDGES.map((b) => [b, b + 8]), [H.g2]: [] };
  // Each flight comes up through the gallery above it: an opening in that slab over its last 26 m, railed.
  const FLIGHTS = [{ x0: 16, x1: 96, ya: H.walk, yb: H.g1 }, { x0: 164, x1: 244, ya: H.g1, yb: H.g2 }];
  for (const side of [1, -1]) {
    const zIn = side * (HW - GD), zOut = side * HW, zs0 = side * (HW - 4.5), zs1 = side * HW;
    for (const y of [H.walk, H.g1, H.g2]) {
      const over = FLIGHTS.filter((f) => f.yb === y).map((f) => ({ u0: f.x1 - 26, u1: f.x1, v0: Math.min(zs0, zs1), v1: Math.max(zs0, zs1) }));
      for (const [u0, u1, v0, v1] of subtractHoles(0, L, Math.min(zIn, zOut), Math.max(zIn, zOut), over)) B(u0, u1, y - 2, y, v0, v1, 'floor');
      for (const o of over) rail(o.u0, o.u1 - 0.1, side > 0 ? zs0 - 0.4 : zs0, side > 0 ? zs0 : zs0 + 0.4, y);
      const rz0 = zIn - (side > 0 ? 0 : 0.4), rz1 = zIn + (side > 0 ? 0.4 : 0);
      let x = 0;
      for (const [g0, g1] of gaps[y]) { if (g0 > x) rail(x, g0, rz0, rz1, y); x = g1; }
      if (x < L) rail(x, L, rz0, rz1, y);
    }
    for (const f of FLIGHTS) ramp(f.x0, f.x1, Math.min(zs0, zs1), Math.max(zs0, zs1), f.ya, f.yb, 'x');
  }
  // The bridges at g1: across the void at the second and fifth bays (over the causeway).
  for (const bx of BRIDGES) {
    B(bx, bx + 8, H.g1 - 2.5, H.g1, -(HW - GD), HW - GD, 'floor');
    rail(bx, bx + 0.4, -(HW - GD), HW - GD, H.g1); rail(bx + 7.6, bx + 8, -(HW - GD), HW - GD, H.g1);
  }

  // ── Pillars: two rows out of the abyss to the roof ──────────────────────────────────────────────────────────────────────
  const PX = PILLARS.x, PZ = PILLARS.z, PS = PILLARS.s;
  for (const x of PX) for (const s of [1, -1]) {
    B(x - PS / 2, x + PS / 2, H.floor, H.roof, s * PZ - PS / 2, s * PZ + PS / 2, 'column');
    decor.push({ type: 'pillar', x, z: s * PZ, s: PS, y0: H.floor, y1: H.roof });
  }
  for (let x = 20; x < L; x += 40) for (const s of [1, -1]) decor.push({ type: 'pilaster', x, z: s * HW, s: 5, y0: H.floor, y1: H.roof });
  // Colonnades: a column behind each gallery's rail every 20 m, tier on tier (out of the abyss under the walk gallery, up to the
  // roof over the top one), so the galleries read as arcades in the wall rather than shelves. None where the platform and the
  // bridges join the galleries.
  const CS = 2.4, CZ = HW - GD + 0.4 + CS / 2;
  const tiers = [[H.floor, H.walk - 5.4, []], [H.walk, H.g1 - 5.4, [[plat.x0 - 3, plat.x1 + 3]]], [H.g1, H.g2 - 5.4, BRIDGES.map((b) => [b - 3, b + 11])], [H.g2, H.roof, []]];
  for (const [y0, y1, skip] of tiers) for (let x = 10; x < L; x += 20) {
    if (skip.some(([a, b]) => x > a && x < b)) continue;
    for (const s of [1, -1]) {
      B(x - CS / 2, x + CS / 2, y0, y1, s * CZ - CS / 2, s * CZ + CS / 2, 'column');
      decor.push({ type: 'column', x, z: s * CZ, s: CS, y0, y1 });
    }
  }

  // ── Statues: veiled Shapers with staves, along the causeway; two colossi at the sea-doors ─────────────────────────────────
  const addStatue = (x, z, y, hgt, s, plinth) => {
    const w = hgt * 0.24;
    if (plinth) B(x - w * 0.7, x + w * 0.7, y - 4, y + 1.2, z - w * 0.6, z + w * 0.6, 'plinth');
    B(x - w * 0.45, x + w * 0.45, y + 1.2, y + 1.2 + hgt, z - w * 0.4, z + w * 0.4, 'statue');
    decor.push({ type: 'statue', x, z, y: y + 1.2, h: hgt, face: -s });
  };
  for (let x = 12; x < plat.x0 - 4; x += 16) for (const s of [1, -1]) addStatue(x, s * 8.6, 0, 14, s, true);
  for (let x = plat.x1 + 10; x < land.x0 - 4; x += 16) for (const s of [1, -1]) addStatue(x, s * 8.6, 0, 14, s, true);
  for (const s of [1, -1]) { B(L - 26, L - 10, H.floor, 0, s * 21, s * 33, 'plinth'); addStatue(L - 18, s * 27, 0, 52, s, false); }

  // ── The people's rooms, off the galleries ────────────────────────────────────────────────────────────────────────────────
  const ROOMS = [
    { id: 'bakehouse', side: 1, x0: 30, x1: 48, y: H.walk, h: 7, water: null, prop: 'kneader' },
    { id: 'nursery', side: -1, x0: 110, x1: 128, y: H.walk - 1, h: 7, water: H.walk + 0.1, prop: 'cradle' },
    { id: 'wheelRoom', side: 1, x0: 150, x1: 172, y: H.g1, h: 10, water: null, prop: 'wheel' },
    { id: 'sweepers', side: -1, x0: 120, x1: 138, y: H.g1, h: 8, water: null, prop: 'broom' },
    { id: 'archive', side: 1, x0: 100, x1: 120, y: H.g2, h: 9, water: null, prop: 'shelves' },
  ];
  for (const r of ROOMS) {
    const zA = r.side * (HW + 2), zB = r.side * (HW + 2 + 14), z0 = Math.min(zA, zB), z1 = Math.max(zA, zB);
    airs.push({ id: r.id, x0: r.x0, x1: r.x1, z0: r.side > 0 ? HW : z0, z1: r.side > 0 ? z1 : -HW, y0: r.y, y1: r.y + r.h, water: r.water });
    B(r.x0 - 1, r.x1 + 1, r.y - 1, r.y, r.side > 0 ? HW : z0, r.side > 0 ? z1 : -HW, 'floor');
    B(r.x0 - 1, r.x1 + 1, r.y + r.h, r.y + r.h + 1, z0 - 1, z1 + 1, 'ceiling');
    B(r.x0 - 1, r.x0, r.y - 1, r.y + r.h, z0, z1, 'wall'); B(r.x1, r.x1 + 1, r.y - 1, r.y + r.h, z0, z1, 'wall');
    if (r.side > 0) B(r.x0 - 1, r.x1 + 1, r.y - 1, r.y + r.h, z1, z1 + 1, 'wall'); else B(r.x0 - 1, r.x1 + 1, r.y - 1, r.y + r.h, z0 - 1, z0, 'wall');
    alcoveDoors.push({ side: r.side, x0: (r.x0 + r.x1) / 2 - 2, x1: (r.x0 + r.x1) / 2 + 2, y0: r.y, y1: r.y + 4.5 });
    const cx = (r.x0 + r.x1) / 2, cz = (z0 + z1) / 2 + r.side * 2;
    B(cx - 1.5, cx + 1.5, r.y, r.y + 1, cz - 0.7, cz + 0.7, 'prop', { prop: r.prop });
    lamps.push([r.x0 + 2, r.y + 3, cz], [r.x1 - 2, r.y + 3, cz]);
  }
  for (const side of [1, -1]) {
    const holes = alcoveDoors.filter((d) => d.side === side).map((d) => ({ u0: d.x0, u1: d.x1, v0: d.y0, v1: d.y1 }));
    const z0 = side > 0 ? HW : -HW - 2, z1 = side > 0 ? HW + 2 : -HW;
    for (const [u0, u1, v0, v1] of subtractHoles(-2, L + 2, H.floor - 2, H.roof, holes)) B(u0, u1, v0, v1, z0, z1, 'wall');
    for (let x = 40; x < L; x += 40) decor.push({ type: 'window', x, z: side * HW, y0: 66, y1: 98, w: 10, side });
  }
  for (const z of [-24, 24]) decor.push({ type: 'window', x: L, z, y0: 64, y1: 104, w: 12, side: 0, end: true });

  // ── The gate, the intake stair, the undercroft ───────────────────────────────────────────────────────────────────────────
  airs.push({ id: 'vestibule', x0: -30, x1: 0, z0: -10, z1: 10, y0: 0, y1: 22, water: null });
  B(-30, -2, -2, 0, -10, 10, 'floor'); B(-31, -1, 22, 24, -11, 11, 'ceiling');
  B(-31, -2, -2, 22, 10, 11, 'wall'); B(-31, -2, -2, 22, -11, -10, 'wall');
  for (const [u0, u1, v0, v1] of subtractHoles(-11, 11, -32, 22, [{ u0: -3, u1: 3, v0: -30, v1: 4 }])) B(-32, -30, v0, v1, u0, u1, 'wall');
  airs.push({ id: 'intake', x0: -64, x1: -30, z0: -3, z1: 3, y0: -32, y1: 4, water: null });
  ramp(-62, -30, -3, 3, -30, 0, 'x');   // to the vestibule's floor edge (a gap here was a hole to nowhere)
  B(-64, -30, -32, -30, -3, 3, 'floor');
  B(-64, -30, 4, 6, -4, 4, 'ceiling'); B(-64, -30, -32, 4, 3, 4, 'wall'); B(-64, -30, -32, 4, -4, -3, 'wall');
  airs.push({ id: 'undercroft', x0: -104, x1: -64, z0: -20, z1: 20, y0: -30, y1: -14, water: null, cave: true });
  const pool = { x0: -100, x1: -86, z0: -16, z1: -4 };
  for (const [u0, u1, v0, v1] of subtractHoles(-104, -64, -20, 20, [{ u0: pool.x0, u1: pool.x1, v0: pool.z0, v1: pool.z1 }])) B(u0, u1, -32, -30, v0, v1, 'floor', { sand: true });
  B(pool.x0, pool.x1, -35, -33, pool.z0, pool.z1, 'floor', { sand: true });
  for (const [a, b, c, d] of [[pool.x0 - 0.5, pool.x0, pool.z0 - 0.5, pool.z1 + 0.5], [pool.x1, pool.x1 + 0.5, pool.z0 - 0.5, pool.z1 + 0.5], [pool.x0, pool.x1, pool.z0 - 0.5, pool.z0], [pool.x0, pool.x1, pool.z1, pool.z1 + 0.5]]) B(a, b, -35, -30, c, d, 'poolWall', { sand: true });
  pools.push({ ...pool, water: -30.3 });
  B(-105, -63, -14, -12, -21, 21, 'ceiling');
  B(-105, -104, -32, -14, -20, 20, 'wall'); B(-104, -64, -32, -14, 20, 21, 'wall'); B(-104, -64, -32, -14, -21, -20, 'wall');
  for (const [u0, u1, v0, v1] of subtractHoles(-21, 21, -32, -14, [{ u0: -3, u1: 3, v0: -30, v1: -26 }])) B(-64, -63, v0, v1, u0, u1, 'wall');
  B(-70, -68.6, -30, -28.4, 12, 13.4, 'prop', { prop: 'shrine' });

  // ── Lamps (flames that never flicker) and the cold glows ────────────────────────────────────────────────────────────────
  for (let x = 20; x < L - 34; x += 32) for (const s of [1, -1]) lamps.push([x, 2.2, s * 5]);
  for (const y of [H.walk, H.g1, H.g2]) for (let x = 10; x < L; x += 30) for (const s of [1, -1]) lamps.push([x, y + 2.5, s * (HW - 1.5)]);
  for (const [x, z] of [[112, 30], [148, 30], [112, -30], [148, -30], [L - 6, 17], [L - 6, -17]]) lamps.push([x, 2.5, z]);
  for (const [x, y, z] of [[-16, 3, 8], [-16, 3, -8], [-46, -14, 0], [-70, -27, 12], [-96, -27, 16], [-80, -27, -16]]) lamps.push([x, y, z]);
  for (const x of [60, 130, 200]) glows.push([x, H.water + 4, 0, [0.3, 0.7, 0.95], 10, 40]);

  const spawns = {
    undercroft: [-80, -30, 4, 1.5708],
    gate: [-16, 0, 0, 1.5708],
    hall: [14, 0, 0, 1.5708],
    tideHall: [14, 0, 0, 1.5708],
    platform: [124, 0, 8, 1.5708],
    gallery: [60, H.g1, HW - 8, 1.5708],
    well: [130, H.water + 0.4, -30, 1.5708],
  };
  const exit = { x0: L - 2.5, x1: L, z0: -14, z1: 14, y0: -1, y1: 6 };
  return { boxes, airs, pools, lamps, glows, decor, spawns, exit };
}

/** Rectangle [u0,u1]×[v0,v1] minus non-overlapping holes → rectangles (walls with doors, the roof with its slits). */
export function subtractHoles(u0, u1, v0, v1, holes) {
  const out = [];
  const hs = holes.filter((h) => h.u1 > u0 && h.u0 < u1 && h.v1 > v0 && h.v0 < v1).sort((a, b) => a.u0 - b.u0);
  let u = u0;
  for (const h of hs) {
    const a = Math.max(u0, h.u0), b = Math.min(u1, h.u1);
    if (a > u) out.push([u, a, v0, v1]);
    if (h.v0 > v0) out.push([a, b, v0, Math.min(v1, h.v0)]);
    if (h.v1 < v1) out.push([a, b, Math.max(v0, h.v1), v1]);
    u = Math.max(u, b);
  }
  if (u < u1) out.push([u, u1, v0, v1]);
  return out.filter(([a, b, c, d]) => b - a > 1e-3 && d - c > 1e-3);
}

/** Top of a box at (x, z) (local): flat, or a flight's line. */
export function boxTop(b, x, z) {
  if (!b.ramp) return b.y1;
  const R = b.ramp, u = Math.min(1, Math.max(0, ((R.axis === 'x' ? x : z) - R.a) / (R.b - R.a)));
  return R.y0 + (R.y1 - R.y0) * u;
}

/**
 * The city's collision and water (world in, local inside). Ground: the highest top at (qx, qz) not above ref + STEP (ref = the
 * body's feet, set by the owner); walls push the capsule out; ceilings hold it under; the camera's probe says whether a point is in
 * a solid or outside every room's air. A flight's underside follows its line, so it can be passed beneath.
 */
export function createEbbholdSolids(city = buildCity()) {
  const O = EBB_ORIGIN, boxes = city.boxes, n = boxes.length;
  const X0 = new Float64Array(n), X1 = new Float64Array(n), Y0 = new Float64Array(n), Y1 = new Float64Array(n), Z0 = new Float64Array(n), Z1 = new Float64Array(n);
  const KIND = new Uint8Array(n);   // 1 stood on (floors, flights), 2 blocks, 3 ceiling
  const RAMP = boxes.map((b) => !!b.ramp);
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    X0[i] = b.x0 + O.x; X1[i] = b.x1 + O.x; Y0[i] = b.y0 + O.y; Y1[i] = b.y1 + O.y; Z0[i] = b.z0 + O.z; Z1[i] = b.z1 + O.z;
    KIND[i] = b.kind === 'ceiling' ? 3 : b.kind === 'floor' || b.ramp ? 1 : 2;
  }
  const airs = city.airs.map((a) => ({ id: a.id, x0: a.x0 + O.x, x1: a.x1 + O.x, z0: a.z0 + O.z, z1: a.z1 + O.z, y0: a.y0 + O.y, y1: a.y1 + O.y, water: a.water === null ? NaN : a.water + O.y }));
  const pools = city.pools.map((p) => ({ x0: p.x0 + O.x, x1: p.x1 + O.x, z0: p.z0 + O.z, z1: p.z1 + O.z, water: p.water + O.y }));
  const STEP = 0.7, R = 0.38, BODY = 1.75;
  const top = (i, x, z) => (RAMP[i] ? boxTop(boxes[i], x - O.x, z - O.z) + O.y : Y1[i]);
  const bot = (i, x, z) => (RAMP[i] ? boxTop(boxes[i], x - O.x, z - O.z) - 1.2 + O.y : Y0[i]);
  const S = {
    x0: Math.min(...airs.map((r) => r.x0)) - 5, x1: Math.max(...airs.map((r) => r.x1)) + 5,
    z0: Math.min(...airs.map((r) => r.z0)) - 5, z1: Math.max(...airs.map((r) => r.z1)) + 5,
    airs, boxes, city,
    /** The body's feet (owner): floors above ref + STEP are not under it. */
    ref: 0.5,
    qx: 0.5, qz: 0.5, qy: 0.5, h: 0.5, lv: 0.5,
    contains(x, z) { return x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1; },
    /** Ground under (qx, qz) not above ref + STEP → h (−1e4: none). */
    floorQ() {
      const x = S.qx, z = S.qz, lim = S.ref + STEP;
      let h = -1e4;
      for (let i = 0; i < n; i++) {
        if (KIND[i] === 3 || x < X0[i] || x > X1[i] || z < Z0[i] || z > Z1[i]) continue;
        const t = top(i, x, z);
        if (t <= lim && t > h) h = t;
      }
      S.h = h;
    },
    /** Water level at (qx, qz) in the air the body is in (NaN: dry). */
    levelQ() {
      const x = S.qx, z = S.qz, y = S.ref + 0.5;
      let lv = NaN;
      for (let k = 0; k < pools.length; k++) { const p = pools[k]; if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 && y < p.water + 3) lv = p.water; }
      if (lv !== lv) for (let k = 0; k < airs.length; k++) {
        const r = airs[k];
        if (x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5 && y >= r.y0 - 1.5 && y <= r.y1) { lv = r.water; if (lv === lv) break; }
      }
      S.lv = lv;
    },
    /** Push a capsule (feet p, velocity v) out of walls, columns, rails and statues, and under the ceilings. */
    push(p, v) {
      const yb = p.y + 0.25, yt = p.y + BODY;
      for (let i = 0; i < n; i++) {
        if (p.x < X0[i] - R || p.x > X1[i] + R || p.z < Z0[i] - R || p.z > Z1[i] + R) continue;
        const k = KIND[i];
        if (k === 3) {
          if (p.x > X0[i] && p.x < X1[i] && p.z > Z0[i] && p.z < Z1[i] && yt > Y0[i] && p.y < Y0[i]) { p.y = Y0[i] - BODY; if (v.y > 0) v.y = 0; }
          continue;
        }
        // Within a step of the feet it is stood on, not walked into; higher, it blocks (a flight's side, a rail, a wall).
        const t = top(i, p.x, p.z);
        if (t - p.y < STEP) continue;
        if (yt < bot(i, p.x, p.z) || yb > t) continue;
        const cx = p.x < X0[i] ? X0[i] : p.x > X1[i] ? X1[i] : p.x, cz = p.z < Z0[i] ? Z0[i] : p.z > Z1[i] ? Z1[i] : p.z;
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), s = (R - d) / d;
          p.x += dx * s; p.z += dz * s;
          const nx = dx / d, nz = dz / d, vn = v.x * nx + v.z * nz;
          if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
        } else {
          const l = p.x - X0[i], r = X1[i] - p.x, b = p.z - Z0[i], f = Z1[i] - p.z, m = Math.min(l, r, b, f);
          if (m === l) { p.x = X0[i] - R; v.x = Math.min(v.x, 0); } else if (m === r) { p.x = X1[i] + R; v.x = Math.max(v.x, 0); }
          else if (m === b) { p.z = Z0[i] - R; v.z = Math.min(v.z, 0); } else { p.z = Z1[i] + R; v.z = Math.max(v.z, 0); }
        }
      }
    },
    /** Camera probe (qx, qy, qz): true inside any solid, or outside every room's air. */
    solidQ() {
      const x = S.qx, y = S.qy, z = S.qz;
      let inAir = false;
      for (let k = 0; k < airs.length && !inAir; k++) { const r = airs[k]; inAir = x > r.x0 - 1 && x < r.x1 + 1 && z > r.z0 - 1 && z < r.z1 + 1 && y > r.y0 - 3 && y < r.y1; }
      if (!inAir) return true;
      for (let i = 0; i < n; i++) {
        if (x < X0[i] || x > X1[i] || z < Z0[i] || z > Z1[i]) continue;
        if (y > bot(i, x, z) && y < top(i, x, z)) return true;
      }
      return false;
    },
  };
  return S;
}
