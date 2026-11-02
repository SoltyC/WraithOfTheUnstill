// Ebbhold, grey box (Phase 10 U3–U4; docs/phase-10/plan.md, storylines.md *The Lung*). The drowned Shaper city lives in a sealed space
// of its own (the whirlpool's cut hides the move), beyond the world's west edge and deep, so no terrain, lake or river is near it: the
// ground, the camera and the water ask these rooms instead while the Wraith is inside (systems/ebbhold.js).
//
// A room is an air box (x0..x1, z0..z1 from floor y up h, local metres) with a water level (or none). Rooms sit a wall's thickness
// apart; a door is an opening through the walls of two rooms. Features add floors (stairs as ramps, the undercroft's pool and black
// sand), columns, holes in a floor (the Tide Hall's great well) and props (the register, the shrine, the five people's places).
// From that one description come the mesh (render/ebbhold.js), the collision (floors, walls, ceilings) and the water.
//
// All queries are allocation-free: fields in, fields out.

/** Where the sealed city sits in the world (m): west of the map's edge, below anything. */
export const EBB_ORIGIN = { x: -4700, y: -300, z: -1400 };
/** Wall and slab thickness (m). */
export const WALL = 1;

/** The rooms. `water`: level (local m) or null; over the ceiling = fully flooded. `kind` names its look and purpose. */
export const ROOMS = [
  { id: 'undercroft', x0: 0, x1: 30, z0: 0, z1: 24, y: 0, h: 10, water: null, kind: 'cave', label: 'The undercroft: black sand, the pool the whirlpool spat the Wraith into, a shrine' },
  { id: 'intake', x0: 31, x1: 71, z0: 10, z1: 14, y: 0, h: 10, water: null, kind: 'tunnel', label: 'The intake tunnel, rising into the city' },
  { id: 'lowerGate', x0: 72, x1: 92, z0: 2, z1: 22, y: 6, h: 14, water: null, kind: 'hall', label: 'The lower gate' },
  { id: 'sweepStair', x0: 72, x1: 92, z0: 23, z1: 53, y: 6, h: 26, water: null, kind: 'stair', label: 'The sweeper\'s stair' },
  { id: 'bakehouse', x0: 93, x1: 111, z0: 2, z1: 16, y: 6, h: 7, water: null, kind: 'room', label: 'The bakehouse (the kneader)' },
  { id: 'nursery', x0: 93, x1: 111, z0: 17, z1: 31, y: 6, h: 7, water: 7.1, kind: 'room', label: 'The nursery, flooded to the waist (the cradle)' },
  { id: 'gallery', x0: 112, x1: 172, z0: 2, z1: 20, y: 2, h: 10, water: 13, kind: 'colonnade', label: 'The flooded gallery: a colonnade under water' },
  { id: 'upperHall', x0: 72, x1: 112, z0: 54, z1: 74, y: 18, h: 12, water: null, kind: 'hall', label: 'The upper hall' },
  { id: 'wheelRoom', x0: 113, x1: 131, z0: 54, z1: 70, y: 18, h: 10, water: null, kind: 'room', label: 'The wheel room (Liese at the sea-door wheel)' },
  { id: 'tideHall', x0: 132, x1: 192, z0: 21, z1: 81, y: 10, h: 36, water: 11, kind: 'great', label: 'The Tide Hall: the register, the great well' },
  { id: 'greatWell', x0: 154, x1: 170, z0: 52, z1: 68, y: -30, h: 40, water: 11, kind: 'well', label: 'The great well (the Listener stranded)' },
  { id: 'seaDoors', x0: 193, x1: 233, z0: 40, z1: 80, y: 10, h: 30, water: 11, kind: 'great', label: 'The sea-door hall: the way out' },
];

/** Doors between two rooms: `at` is the opening's centre along the shared wall, `w` its width, `h` its height (from the higher floor). */
export const DOORS = [
  { a: 'undercroft', b: 'intake', at: 12, w: 3.2, h: 3.4 },
  { a: 'intake', b: 'lowerGate', at: 12, w: 3.2, h: 3.4 },
  { a: 'lowerGate', b: 'sweepStair', at: 82, w: 6, h: 8 },
  { a: 'lowerGate', b: 'bakehouse', at: 9, w: 2.4, h: 3.2 },
  { a: 'bakehouse', b: 'nursery', at: 102, w: 2.4, h: 3.2 },
  { a: 'nursery', b: 'gallery', at: 18.5, w: 2.6, h: 3.4 },
  { a: 'sweepStair', b: 'upperHall', at: 82, w: 6, h: 8 },
  { a: 'upperHall', b: 'wheelRoom', at: 62, w: 3, h: 4 },
  { a: 'wheelRoom', b: 'tideHall', at: 62, w: 4, h: 6 },
  { a: 'gallery', b: 'tideHall', at: 150, w: 6, h: 2 },   // a low arch, swum through from the flooded gallery
  { a: 'tideHall', b: 'seaDoors', at: 60, w: 10, h: 16 },
];

/** Features: stairs (ramp floors, axis +z or +x or −…), the pool, columns, the well's hole, props. */
export const FEATURES = [
  // The undercroft: a pool sunk in the black sand (where the whirlpool spat the Wraith out), the intake's rise.
  { type: 'pool', room: 'undercroft', x0: 3, x1: 14, z0: 3, z1: 12, depth: 3, water: -0.25 },
  { type: 'ramp', room: 'intake', x0: 31, x1: 71, z0: 10, z1: 14, y0: 0, y1: 6, axis: 'x' },
  // The sweeper's stair: one grand flight up the room's length, landings top and bottom.
  { type: 'stair', room: 'sweepStair', x0: 76, x1: 88, z0: 27, z1: 49, y0: 6, y1: 18, axis: 'z' },
  { type: 'deck', room: 'sweepStair', x0: 72, x1: 92, z0: 49, z1: 53, y: 18 },
  // The Tide Hall: a balcony from the wheel room and a stair down to the floor; the great well in its centre.
  { type: 'deck', room: 'tideHall', x0: 132, x1: 140, z0: 54, z1: 70, y: 18 },
  { type: 'stair', room: 'tideHall', x0: 140, x1: 150, z0: 56, z1: 68, y0: 18, y1: 10, axis: 'x' },
  { type: 'hole', room: 'tideHall', x0: 153, x1: 171, z0: 51, z1: 69 },
  // Columns (centres; square, side s).
  { type: 'columns', room: 'lowerGate', xs: [76, 88], zs: [6, 14], s: 1.6 },
  { type: 'columns', room: 'gallery', xs: [118, 128, 138, 148, 158, 166], zs: [7, 15], s: 1.4 },
  { type: 'columns', room: 'tideHall', xs: [136, 188], zs: [27, 39, 75], s: 2.4 },
  { type: 'columns', room: 'upperHall', xs: [80, 92, 104], zs: [60, 68], s: 1.4 },
  // Props: the people's places, the register, the shrine (grey blocks for now; U5–U6 bring them).
  { type: 'prop', room: 'undercroft', x: 25, z: 19, w: 1.2, d: 1.2, hgt: 1.6, kind: 'shrine' },
  { type: 'prop', room: 'bakehouse', x: 102, z: 9, w: 3, d: 1.4, hgt: 0.95, kind: 'kneader' },
  { type: 'prop', room: 'nursery', x: 102, z: 24, w: 1.2, d: 0.8, hgt: 0.7, kind: 'cradle' },
  { type: 'prop', room: 'wheelRoom', x: 124, z: 62, w: 3.2, d: 0.6, hgt: 3.2, kind: 'wheel' },
  { type: 'prop', room: 'tideHall', x: 176, z: 60, w: 2.4, d: 1.6, hgt: 1.3, kind: 'register' },
  { type: 'prop', room: 'seaDoors', x: 232, z: 60, w: 1, d: 30, hgt: 26, kind: 'seaDoor' },
];

/** Lamps (local): flames that burn and never flicker (the city is held in one second). */
export const LAMPS = [
  [26, 3, 21], [8, 3, 20], [16, 3, 2], [2, 3, 14], [51, 3.5, 12], [74, 9, 4], [90, 9, 20], [82, 21, 51], [82, 9, 25],
  [109, 9, 4], [109, 9, 29], [120, 5, 11], [150, 5, 11], [100, 22, 72], [74, 22, 56], [128, 21, 56],
  [136, 21, 62], [176, 13, 62], [134, 14, 24], [190, 14, 78], [162, 14, 46], [212, 15, 44], [212, 15, 76],
  // The Tide Hall's ring of lamps, high on its walls.
  [150, 16, 22], [172, 16, 22], [191, 16, 36], [191, 16, 56], [172, 16, 80], [150, 16, 80], [133, 16, 44], [133, 16, 76],
  [124, 5, 6], [144, 5, 17], [164, 5, 6],
];
/** Lights that are not flames (local x, y, z, colour, intensity, radius): the cold glow rising out of the great well. */
export const GLOWS = [[162, 4, 60, [0.35, 0.75, 1.0], 14, 34]];

const byId = new Map(ROOMS.map((r) => [r.id, r]));
export const room = (id) => byId.get(id);

/**
 * The shared wall of two rooms and the opening through it: the wall's axis ('x' when the rooms are side by side along x),
 * its position, and the opening's span along the wall and up (local).
 */
export function doorOpening(d) {
  const A = room(d.a), B = room(d.b);
  const along = A.x1 < B.x0 || B.x1 < A.x0 ? 'z' : 'x';     // rooms apart along x: the wall runs along z
  const floor = Math.max(A.y, B.y);
  const y0 = floor, y1 = floor + d.h;
  if (along === 'z') {
    const wx0 = Math.min(A.x1, B.x1), wx1 = Math.max(A.x0, B.x0);
    return { axis: 'x', w0: wx0, w1: wx1, u0: d.at - d.w / 2, u1: d.at + d.w / 2, y0, y1 };
  }
  const wz0 = Math.min(A.z1, B.z1), wz1 = Math.max(A.z0, B.z0);
  return { axis: 'z', w0: wz0, w1: wz1, u0: d.at - d.w / 2, u1: d.at + d.w / 2, y0, y1 };
}

/** Rectangle [u0,u1]×[v0,v1] minus non-overlapping holes → rectangles (for walls with doors). */
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

/**
 * Every solid as an axis-aligned box (local): walls (with their doors cut), floor and ceiling slabs (with holes), stairs as
 * ramps (a top that rises along an axis), columns and props. { x0, x1, y0, y1, z0, z1, kind, ramp? }
 */
export function buildBoxes() {
  const boxes = [];
  const holesFor = (r) => FEATURES.filter((f) => f.type === 'hole' && f.room === r.id);
  for (const r of ROOMS) {
    const top = r.y + r.h;
    // Walls: four slabs just outside the air box, each with the doors through it.
    const doors = DOORS.filter((d) => d.a === r.id || d.b === r.id).map(doorOpening);
    const T = WALL / 2;
    const xWall = (x, x0, x1) => {
      const hs = doors.filter((o) => o.axis === 'x' && Math.abs((o.w0 + o.w1) / 2 - x) < WALL + 0.01).map((o) => ({ u0: o.u0, u1: o.u1, v0: o.y0, v1: o.y1 }));
      for (const [u0, u1, v0, v1] of subtractHoles(r.z0 - T * 2, r.z1 + T * 2, r.y - T * 2, top + T * 2, hs)) boxes.push({ x0, x1, z0: u0, z1: u1, y0: v0, y1: v1, kind: 'wall', room: r.id });
    };
    const zWall = (z, z0, z1) => {
      const hs = doors.filter((o) => o.axis === 'z' && Math.abs((o.w0 + o.w1) / 2 - z) < WALL + 0.01).map((o) => ({ u0: o.u0, u1: o.u1, v0: o.y0, v1: o.y1 }));
      for (const [u0, u1, v0, v1] of subtractHoles(r.x0, r.x1, r.y - T * 2, top + T * 2, hs)) boxes.push({ x0: u0, x1: u1, z0, z1, y0: v0, y1: v1, kind: 'wall', room: r.id });
    };
    xWall(r.x0 - T, r.x0 - WALL, r.x0); xWall(r.x1 + T, r.x1, r.x1 + WALL);
    zWall(r.z0 - T, r.z0 - WALL, r.z0); zWall(r.z1 + T, r.z1, r.z1 + WALL);
    // Floor (minus holes; a pool is a sunk floor of its own) and ceiling.
    const fh = holesFor(r).map((h) => ({ u0: h.x0, u1: h.x1, v0: h.z0, v1: h.z1 }));
    for (const f of FEATURES) if (f.type === 'pool' && f.room === r.id) fh.push({ u0: f.x0, u1: f.x1, v0: f.z0, v1: f.z1 });
    for (const [u0, u1, v0, v1] of subtractHoles(r.x0, r.x1, r.z0, r.z1, fh)) boxes.push({ x0: u0, x1: u1, z0: v0, z1: v1, y0: r.y - WALL, y1: r.y, kind: 'floor', room: r.id });
    // (The well opens into the Tide Hall's floor: no ceiling; its walls stand a metre proud of that floor as a rim.)
    if (r.kind !== 'well') boxes.push({ x0: r.x0 - WALL, x1: r.x1 + WALL, z0: r.z0 - WALL, z1: r.z1 + WALL, y0: top, y1: top + WALL, kind: 'ceiling', room: r.id });
  }
  for (const f of FEATURES) {
    const r = room(f.room);
    if (f.type === 'pool') {
      boxes.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: r.y - f.depth - WALL, y1: r.y - f.depth, kind: 'floor', room: r.id });
      // Its sides, from the bed up to the sand (stood on from the sand, a wall to a swimmer in it).
      const b0 = r.y - f.depth - WALL, t = 0.5;
      boxes.push({ x0: f.x0 - t, x1: f.x0, z0: f.z0 - t, z1: f.z1 + t, y0: b0, y1: r.y, kind: 'poolWall', room: r.id });
      boxes.push({ x0: f.x1, x1: f.x1 + t, z0: f.z0 - t, z1: f.z1 + t, y0: b0, y1: r.y, kind: 'poolWall', room: r.id });
      boxes.push({ x0: f.x0, x1: f.x1, z0: f.z0 - t, z1: f.z0, y0: b0, y1: r.y, kind: 'poolWall', room: r.id });
      boxes.push({ x0: f.x0, x1: f.x1, z0: f.z1, z1: f.z1 + t, y0: b0, y1: r.y, kind: 'poolWall', room: r.id });
    }
    else if (f.type === 'deck') boxes.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: f.y - 0.6, y1: f.y, kind: 'floor', room: r.id });
    else if (f.type === 'ramp' || f.type === 'stair') boxes.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: Math.min(f.y0, f.y1) - 0.6, y1: Math.max(f.y0, f.y1), kind: f.type, room: r.id, ramp: { axis: f.axis, a: f.axis === 'x' ? f.x0 : f.z0, b: f.axis === 'x' ? f.x1 : f.z1, y0: f.y0, y1: f.y1, steps: f.type === 'stair' } });
    else if (f.type === 'columns') for (const x of f.xs) for (const z of f.zs) boxes.push({ x0: x - f.s / 2, x1: x + f.s / 2, z0: z - f.s / 2, z1: z + f.s / 2, y0: r.y, y1: r.y + r.h, kind: 'column', room: r.id });
    else if (f.type === 'prop') boxes.push({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2, y0: r.y, y1: r.y + f.hgt, kind: f.kind, room: r.id });
  }
  return boxes;
}

/** Top of a box at (x, z) (local): flat, or a ramp's height (stairs stepped every 0.3 m of rise). */
export function boxTop(b, x, z) {
  if (!b.ramp) return b.y1;
  const R = b.ramp, u = Math.min(1, Math.max(0, ((R.axis === 'x' ? x : z) - R.a) / (R.b - R.a)));
  return R.y0 + (R.y1 - R.y0) * u;
}

/**
 * The city's collision and water (world coordinates in, local inside). Ground: the highest floor top at (qx, qz) not above
 * ref + STEP (ref = the body's feet, set by the owner); walls push the capsule out; ceilings hold it under; the camera's
 * probe says whether a point is inside a solid or outside every room.
 */
export function createEbbholdSolids(boxes = buildBoxes()) {
  const O = EBB_ORIGIN, n = boxes.length;
  const X0 = new Float64Array(n), X1 = new Float64Array(n), Y0 = new Float64Array(n), Y1 = new Float64Array(n), Z0 = new Float64Array(n), Z1 = new Float64Array(n);
  const KIND = new Uint8Array(n);   // 1 floor-like (stood on), 2 wall-like (blocks), 3 ceiling
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    X0[i] = b.x0 + O.x; X1[i] = b.x1 + O.x; Y0[i] = b.y0 + O.y; Y1[i] = b.y1 + O.y; Z0[i] = b.z0 + O.z; Z1[i] = b.z1 + O.z;
    KIND[i] = b.kind === 'ceiling' ? 3 : b.kind === 'floor' || b.ramp ? 1 : 2;
  }
  const rooms = ROOMS.map((r) => ({ id: r.id, x0: r.x0 + O.x, x1: r.x1 + O.x, z0: r.z0 + O.z, z1: r.z1 + O.z, y0: r.y + O.y, y1: r.y + r.h + O.y, water: r.water === null ? NaN : r.water + O.y }));
  const pools = FEATURES.filter((f) => f.type === 'pool').map((f) => ({ x0: f.x0 + O.x, x1: f.x1 + O.x, z0: f.z0 + O.z, z1: f.z1 + O.z, water: f.water + O.y + room(f.room).y }));
  const STEP = 0.7, R = 0.38, BODY = 1.75;
  const top = (i, x, z) => (boxes[i].ramp ? boxTop(boxes[i], x - O.x, z - O.z) + O.y : Y1[i]);
  const S = {
    /** Bounds (world) of the whole city, with a margin. */
    x0: Math.min(...rooms.map((r) => r.x0)) - 5, x1: Math.max(...rooms.map((r) => r.x1)) + 5,
    z0: Math.min(...rooms.map((r) => r.z0)) - 5, z1: Math.max(...rooms.map((r) => r.z1)) + 5,
    rooms, boxes,
    /** The body's feet (owner): floors above ref + STEP are not under it. */
    ref: 0.5,
    qx: 0.5, qz: 0.5, qy: 0.5, h: 0.5, lv: 0.5,
    /** Inside the city's bounds (x, z)? */
    contains(x, z) { return x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1; },
    /** Ground under (qx, qz) below ref + STEP → h (−1e4: none). */
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
    /** Water level at (qx, qz) in the room the body is in (NaN: dry). */
    levelQ() {
      const x = S.qx, z = S.qz, y = S.ref + 0.5;
      let lv = NaN;
      for (let k = 0; k < pools.length; k++) { const p = pools[k]; if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 && y < p.water + 3) lv = p.water; }
      if (lv !== lv) for (let k = 0; k < rooms.length; k++) {
        const r = rooms[k];
        if (x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5 && y >= r.y0 - 1.5 && y <= r.y1) { lv = r.water; if (lv === lv) break; }
      }
      S.lv = lv;
    },
    /** Push a capsule (feet p, velocity v) out of walls, columns and props, and under the ceiling. */
    push(p, v) {
      const yb = p.y + 0.25, yt = p.y + BODY;
      for (let i = 0; i < n; i++) {
        const k = KIND[i];
        if (k === 3) {
          if (p.x > X0[i] && p.x < X1[i] && p.z > Z0[i] && p.z < Z1[i] && yt > Y0[i] && p.y < Y0[i]) { p.y = Y0[i] - BODY; if (v.y > 0) v.y = 0; }
          continue;
        }
        // Anything whose top here is within a step of the feet is stood on, not walked into (a deck's edge, a stair's
        // low end, a cradle); higher, it blocks — a stair's side where it has risen, a wall.
        const t = k === 1 ? top(i, p.x, p.z) : Y1[i];
        if (t - p.y < STEP) continue;
        if (yt < Y0[i] || yb > t) continue;
        const cx = p.x < X0[i] ? X0[i] : p.x > X1[i] ? X1[i] : p.x, cz = p.z < Z0[i] ? Z0[i] : p.z > Z1[i] ? Z1[i] : p.z;
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), s = (R - d) / d;
          p.x += dx * s; p.z += dz * s;
          const nx = dx / d, nz = dz / d, vn = v.x * nx + v.z * nz;
          if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
        } else {
          // Inside the box: out by the nearest face.
          const l = p.x - X0[i], r = X1[i] - p.x, b = p.z - Z0[i], f = Z1[i] - p.z, m = Math.min(l, r, b, f);
          if (m === l) { p.x = X0[i] - R; v.x = Math.min(v.x, 0); } else if (m === r) { p.x = X1[i] + R; v.x = Math.max(v.x, 0); }
          else if (m === b) { p.z = Z0[i] - R; v.z = Math.min(v.z, 0); } else { p.z = Z1[i] + R; v.z = Math.max(v.z, 0); }
        }
      }
    },
    /** Camera probe (qx, qy, qz): true inside any solid, or outside every room's air. */
    solidQ() {
      const x = S.qx, y = S.qy, z = S.qz;
      let inRoom = false;
      for (let k = 0; k < rooms.length && !inRoom; k++) { const r = rooms[k]; inRoom = x > r.x0 - WALL && x < r.x1 + WALL && z > r.z0 - WALL && z < r.z1 + WALL && y > r.y0 - 40 && y < r.y1; }
      if (!inRoom) return true;
      for (let i = 0; i < n; i++) {
        if (x < X0[i] || x > X1[i] || z < Z0[i] || z > Z1[i]) continue;
        const yt = KIND[i] === 1 ? top(i, x, z) : Y1[i];
        if (y > Y0[i] && y < yt) return true;
      }
      return false;
    },
  };
  return S;
}
