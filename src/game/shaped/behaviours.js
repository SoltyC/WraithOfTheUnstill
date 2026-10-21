// Meadow Shaped behaviours (PLAN M8), keyed by archetype `behaviour`: 'flush' (Sedgerunners),
// 'territory' (Hedgewarden), 'support' (Chanter). Pure, allocation-free helpers (Node-testable);
// shaped.js wires them into the state machine. Outputs go into caller-owned scratch objects.

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- Flush (Sedgerunners) -----------------------------------------------------------------
export const FLUSH_RADIUS = 9, FLOCK_JOIN = 12, FLUSH_TIME = 1, PASS_BEND = 0.96, SLASH_RADIUS = 1.2;

/** The Wraith is close enough to put the flock up. */
export function flushDue(dx, dz, radius) { return dx * dx + dz * dz < radius * radius; }

/** Spread the flush across a flock: any flushed member flushes all with its flock id. Returns the
 *  number newly flushed. `flocks`/`flushed` are parallel arrays; `live[i]` 0 skips a slot. */
export function flockPropagate(flocks, flushed, live, n) {
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (!live[i] || !flushed[i]) continue;
    for (let j = 0; j < n; j++) if (live[j] && !flushed[j] && flocks[j] === flocks[i]) { flushed[j] = 1; c++; }
  }
  return c;
}

/** Break-out heading of member k of n: round the full circle, offset by the away-from-Wraith angle. */
export function flushAngle(k, n, away) { return away + ((k + 0.5) / n - 0.5) * TAU; }

/** Desired unit direction of an approach pass at (x, z) toward (px, pz): the straight line rotated
 *  by `side` × a bend that fades out over the last metres, so it sweeps in on an arc and crosses
 *  close. Writes out.x/out.z; returns the distance. */
export function passSteer(out, x, z, px, pz, side) {
  const dx = px - x, dz = pz - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3;
  const a = side * PASS_BEND * clamp01((d - 1) / 6), c = Math.cos(a), s = Math.sin(a);
  const ux = dx / d, uz = dz / d;
  out.x = ux * c - uz * s; out.z = uz * c + ux * s;
  return d;
}
/** Angle (rad) between the pass heading and the straight line to the target at distance d. */
export function passAngle(d) { return PASS_BEND * clamp01((d - 1) / 6); }
/** The slash lands: within reach during a pass, once per pass. */
export function slashHit(dist, done) { return !done && dist < SLASH_RADIUS; }
/** The pass is over once it has crossed (close, or already past with the target behind). */
export function passCrossed(dist, vx, vz, dx, dz) { return dist < 0.9 || (dist < 3 && vx * dx + vz * dz < 0); }
/** The carry-on is done when it is far enough out to turn round (or has run long enough). */
export function carryDone(dist, t) { return dist > 8 || t > 3; }

// ---- Territory (Hedgewarden) ----------------------------------------------------------------
export const TERR_BOUND = 14, TERR_GIVEUP = 1.5, TERR_LEASH = 1, PATROL_SPEED = 0.8;

/** Gate: aggro while the Wraith is inside the boundary; gives up `giveUp` s after it leaves.
 *  g = { aggro, away } (mutated); wd = Wraith's distance from home. Returns g.aggro. */
export function territoryGate(g, wd, bound, dt, giveUp = TERR_GIVEUP) {
  if (wd < bound) { g.aggro = true; g.away = 0; }
  else if (g.aggro) { g.away += dt; if (g.away >= giveUp) { g.aggro = false; g.away = 0; } }
  return g.aggro;
}
/** A point on the boundary circle `ahead` metres round from where (x, z) is (patrol / the way back). */
export function patrolPoint(out, x, z, hx, hz, bound, ahead) {
  const a = Math.atan2(z - hz, x - hx) + ahead / Math.max(bound, 1);
  out.x = hx + Math.cos(a) * bound; out.z = hz + Math.sin(a) * bound;
}
/** Leash: never pursue past bound + 1. Strips the outward part of (vx, vz) at the limit (out.x/z). */
export function leash(out, x, z, hx, hz, bound, vx, vz) {
  const dx = x - hx, dz = z - hz, d = Math.sqrt(dx * dx + dz * dz) || 1e-3, lim = bound + TERR_LEASH * 0.5;
  out.x = vx; out.z = vz;
  if (d < lim) return false;
  const nx = dx / d, nz = dz / d, o = vx * nx + vz * nz;
  if (o > 0) { out.x -= nx * o; out.z -= nz * o; }
  out.x -= nx * 0.5; out.z -= nz * 0.5;           // and a nudge home
  return true;
}

// ---- Support (Chanter) ---------------------------------------------------------------------
export const SONG_EVERY = 9, SONG_TIME = 3, SONG_HUM = 0.8, SONG_RANGE = 14, SONG_RATE = 6;
export const POLLEN_EVERY = 7, POLLEN_RADIUS = 4, POLLEN_LIFE = 6, POLLEN_CAP = 2, POLLEN_MAX = 8, DISPERSE_TIME = 0.5;

/** The Chanter may start singing: its cooldown is up and a wounded ally is in range. */
export function songEligible(cool, woundedNear) { return cool <= 0 && woundedNear > 0; }
/** hp after dt of song: only wounded Shaped within range regain, capped at max. */
export function songHeal(hp, max, dist, range, rate, dt) {
  if (dist > range || hp >= max) return hp;
  return Math.min(max, hp + rate * dt);
}
/** Where the curtain goes: on the line from the Chanter to the Wraith, `reach` out (never past the midpoint). */
export function curtainPos(out, cx, cz, px, pz, reach) {
  const dx = px - cx, dz = pz - cz, d = Math.sqrt(dx * dx + dz * dz) || 1e-3, r = Math.min(reach, d * 0.5);
  out.x = cx + dx / d * r; out.z = cz + dz / d * r;
}
/** Strength 0..1 of a curtain of age/life: fades in over `fin`, out over `fout`. */
export function curtainStrength(age, life, fin, fout) {
  return clamp01(Math.min(age / fin, (life - age) / fout));
}
/** Pollen at (x, z) from one curtain: full inside, a soft edge over the outer third. */
export function curtainAt(x, z, cx, cz, r, str) {
  const dx = x - cx, dz = z - cz, d = Math.sqrt(dx * dx + dz * dz);
  if (d >= r) return 0;
  const e = clamp01((r - d) / (r * 0.33));
  return str * e * e * (3 - 2 * e);
}
