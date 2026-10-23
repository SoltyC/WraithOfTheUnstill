// Pure logic for the people of Hearn on the fire night (data/quests/meadow.json): the guide who
// leads the Wraith to the village, the child who cowers and is led out, and small geometry helpers.
// No game state is read here (systems/villagers.js feeds positions in and applies what comes out),
// so every rule is unit-tested (tests/meadowQuest.test.js).

/** The guide's lead-the-way: she runs ahead along the road and waits if the Wraith falls behind. */
export const LEAD = { run: 4.0, wait: 22, near: 8 };
/** The child: follows a few steps behind at a child's pace, waits when left behind, is "out" past `out` m from the house. */
export const CHILD = { gap: 1.8, run: 2.8, wait: 14, out: 6, hand: 4.5,   // out 6 (was 12: Marit stands 12 m from the house, so he could never be both out and with her)
  dwell: 1.2, reach: 2.6 };

const _p = [0, 0, 0];

/** A polyline path { pts, cum, length } from point lists (each list continues the last). */
export function makePath(lists) {
  const pts = [];
  for (const l of lists) for (const p of l) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) pts.push([p[0], p[1]]);
  }
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] || 0 };
}

/** Point at distance s along the path into out [x, z, heading]. */
export function pathAt(path, s, out = _p) {
  const P = path.pts, C = path.cum;
  s = Math.min(path.length, Math.max(0, s));
  let k = 1;
  while (k < P.length - 1 && C[k] < s) k++;
  if (P.length < 2) { out[0] = P[0]?.[0] ?? 0; out[1] = P[0]?.[1] ?? 0; out[2] = 0; return out; }
  const l = C[k] - C[k - 1] || 1, f = (s - C[k - 1]) / l;
  out[0] = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * f; out[1] = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * f;
  out[2] = Math.atan2(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  return out;
}

/** Distance along the path of the point nearest (x, z). */
export function projectOnPath(path, x, z) {
  let best = 1e18, bs = 0;
  const P = path.pts;
  for (let k = 1; k < P.length; k++) {
    const ax = P[k - 1][0], az = P[k - 1][1], dx = P[k][0] - ax, dz = P[k][1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
    if (d < best) { best = d; bs = path.cum[k - 1] + t * Math.sqrt(l2); }
  }
  return bs;
}

/** A guide state at the start of the path. */
export function newGuide(path) {
  const p = pathAt(path, 0, [0, 0, 0]);
  return { s: 0, x: p[0], z: p[1], yaw: p[2], vx: 0, vz: 0, speed: 0, waiting: false, arrived: false };
}

/**
 * One step of leading the way: full speed while the Wraith is within `near` m, slower the farther
 * it falls behind, stopped (waiting, turned toward it) beyond `wait` m. Arrived at the path's end.
 */
export function leadStep(st, wx, wz, dt, path, T = LEAD) {
  const d = Math.hypot(wx - st.x, wz - st.z);
  const f = Math.min(1, Math.max(0, (T.wait - d) / (T.wait - T.near)));
  st.waiting = f <= 0 && st.s < path.length;
  st.speed = f <= 0 ? 0 : st.speed + (T.run * f - st.speed) * Math.min(1, dt * 4);
  const px = st.x, pz = st.z;
  st.s = Math.min(path.length, st.s + st.speed * dt);
  pathAt(path, st.s, _p);
  st.x = _p[0]; st.z = _p[1];
  st.vx = dt > 0 ? (st.x - px) / dt : 0; st.vz = dt > 0 ? (st.z - pz) / dt : 0;
  if (st.speed > 0.05) st.yaw = _p[2];
  else if (d > 2) st.yaw = Math.atan2(wx - st.x, wz - st.z);
  st.arrived = st.s >= path.length - 1e-6;
  return st;
}

/** Move st toward (tx, tz), stopping `gap` short, at up to `top` m/s; returns the speed. */
export function stepToward(st, tx, tz, gap, top, dt) {
  const dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz);
  if (d <= gap + 0.05) { st.vx = 0; st.vz = 0; return 0; }
  const sp = Math.min(top, (d - gap) * 1.4), ux = dx / d, uz = dz / d;
  st.vx = ux * sp; st.vz = uz * sp; st.x += st.vx * dt; st.z += st.vz * dt; st.yaw = Math.atan2(ux, uz);
  return sp;
}

/** A new child state, cowering at (x, z). */
export function newChild(x, z) {
  return { mode: 'cower', x, z, vx: 0, vz: 0, yaw: 0, hunch: 0.6, dwell: 0, waiting: false, out: false, saved: false };
}

/**
 * One step of the child's story. c = { wx, wz (the Wraith), follow (the Wraith asked him), house,
 * door, mother: [x, z] }. cower → (asked) door → follow → (out of the house, near his mother) home.
 * `dwell` counts how long the Wraith has stood within reach while he cowers (the caller starts the talk).
 */
export function childStep(st, c, dt, T = CHILD) {
  const dw = Math.hypot(c.wx - st.x, c.wz - st.z);
  let target = 0;
  // The raid begins while he plays by the door: he runs inside (by the door) and hides (bot playtest
  // 2026-10-24: he stayed out in the street, never "in" the burning house).
  if (st.mode === 'idle' && c.raid && !c.follow) st.mode = 'enter';
  if (st.mode === 'enter') {
    target = 0.4;
    if (!st.inDoor) { if (stepToward(st, c.door[0], c.door[1], 0.3, 2.6, dt) === 0) st.inDoor = true; }
    else if (stepToward(st, c.house[0], c.house[1], 0.15, 1.6, dt) === 0) { st.mode = 'cower'; st.inDoor = false; st.dwell = 0; }
  }
  if (st.mode === 'cower') {
    target = 0.6; st.vx = 0; st.vz = 0;
    st.dwell = dw < T.reach ? st.dwell + dt : 0;
    if (c.follow) st.mode = 'door';
    else st.yaw = Math.atan2(c.house[0] - c.door[0], c.house[1] - c.door[1]) + 3.1416;
  }
  if (st.mode === 'door') {
    // Out of the house by its door first (the walls are solid to the Wraith, not to a figure's path).
    if (stepToward(st, c.door[0], c.door[1], 0.4, 2.4, dt) === 0) st.mode = 'follow';
  }
  if (st.mode === 'follow') {
    st.waiting = dw > T.wait;
    if (st.waiting) { st.vx = 0; st.vz = 0; st.yaw = Math.atan2(c.wx - st.x, c.wz - st.z); }
    else stepToward(st, c.wx, c.wz, T.gap, T.run, dt);
    if (Math.hypot(st.x - c.house[0], st.z - c.house[1]) > T.out) st.out = true;
    if (st.out && Math.hypot(st.x - c.mother[0], st.z - c.mother[1]) < T.hand) { st.mode = 'home'; st.saved = true; st.waiting = false; }
  }
  if (st.mode === 'home') {
    stepToward(st, c.mother[0] + 1.1, c.mother[1] + 0.6, 0, 1.8, dt);
    if (!st.vx && !st.vz) st.yaw = Math.atan2(c.mother[0] - st.x, c.mother[1] - st.z);
  }
  st.hunch += (target - st.hunch) * Math.min(1, dt * 2.5);
  return st;
}

/** n points on a ring round (cx, cz), starting at angle a0. */
export function ringSlots(cx, cz, r, n, a0 = 0) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = a0 + (k / n) * 6.2832; out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]); }
  return out;
}

/** The point in front of a plot (village.json plots: at, facing, w, d = half extents) `out` m beyond its front wall. */
export function frontOf(plot, out = 1.5) {
  const f = plot.facing, r = plot.d + out;
  return [plot.at[0] + Math.sin(f) * r, plot.at[1] + Math.cos(f) * r];
}

/** Where a figure hides inside a building and where its door lets out, from the kit's own plan (site
 *  `build.meta`: half-extents W, D, offset ox, oz, the front door's offset a along the wall) — the plot's
 *  bounds are larger than the house and the door is off centre. Falls back to the plot's centre/front. */
export function houseSpots(plot, meta) {
  if (!meta || !meta.door || meta.door.wall !== 'front') return { inside: [plot.at[0], plot.at[1]], door: frontOf(plot, 1.6) };
  const f = plot.facing, c = Math.cos(f), s = Math.sin(f);
  const w = (a, z) => [plot.at[0] + a * c + z * s, plot.at[1] - a * s + z * c];
  const ox = meta.ox || 0, oz = meta.oz || 0, side = meta.door.a > 0 ? -1 : 1;
  // A back corner on the side away from the door: seen through the doorway, not from the street.
  return { inside: w(ox + side * meta.W * 0.45, oz - meta.D * 0.35), door: w(ox + meta.door.a, oz + meta.D + 1.3) };
}

/** The plot ids ordered by distance from a point. */
export function nearestFirst(plots, ids, x, z) {
  const by = new Map(plots.map((p) => [p.id, p]));
  return ids.filter((id) => by.has(id)).sort((a, b) => Math.hypot(by.get(a).at[0] - x, by.get(a).at[1] - z) - Math.hypot(by.get(b).at[0] - x, by.get(b).at[1] - z));
}

/** Direction (unit) of the stair's first leg: from its foot toward the next route point. */
export function stairDir(points) {
  const a = points[0], b = points[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}
