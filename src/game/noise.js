// The Wraith's noise (Phase 10; plan F3 "sound as a mechanic", built here for Ebbhold's Drowned, U5): one level 0..1 and where it
// came from, made each frame from what the body is doing — the quiet walk (Shift) all but silent, an ordinary walk heard across a
// room, a swim stroke, a jump, a hard landing, a dodge, a swing. It rises at once and dies away over about half a second; how far
// it carries is the level times NOISE.radius (stone halls carry it). Listeners ask hears(). Pure and allocation-free (tests/noise.test.js).

export const NOISE = {
  quiet: 0.1,      // the quiet walk at its full pace
  walk: 0.42,      // an ordinary walk at full pace
  swim: 0.36,      // strokes
  jump: 0.5,
  land: 0.9,       // the hardest landing (scaled by the fall: from 4 m/s down)
  dodge: 0.85,
  attack: 0.75,
  radius: 32,      // m at level 1
  fade: 2.2,       // level lost per second
  floor: 9,        // m of height a sound carries between tiers (stone slabs between them)
};

export function createNoise() {
  return { level: 0, x: 0, y: 0, z: 0, r: 0, /** a new loud event this frame (a jump, a landing, a dodge, a swing, a cry) */ burst: false };
}

/**
 * One frame. i: { x, y, z, speed (horizontal m/s), grounded, quiet, swimming, landed (this frame), landV (m/s down),
 * jumped, dodged, attacked } — the events true for the one frame they happen.
 */
export function noiseStep(n, i, dt) {
  let s = 0;
  if (i.swimming) s = i.speed > 0.3 ? NOISE.swim * Math.min(1, i.speed / 3) : 0;
  else if (i.grounded && i.speed > 0.3) s = i.quiet ? NOISE.quiet * Math.min(1, i.speed / 2.2) : NOISE.walk * Math.min(1, i.speed / 5.2);
  let b = 0;
  if (i.jumped) b = Math.max(b, NOISE.jump);
  if (i.landed && i.landV > 4) b = Math.max(b, NOISE.land * Math.min(1, 0.35 + (i.landV - 4) / 10));
  if (i.dodged) b = Math.max(b, NOISE.dodge);
  if (i.attacked) b = Math.max(b, NOISE.attack);
  s = Math.max(s, b);
  n.burst = b > 0;
  n.level = Math.max(s, n.level - NOISE.fade * dt);
  // The source follows whatever is loud now (a fading sound stays where it was made).
  if (s > 0 && s >= n.level - 1e-6) { n.x = i.x; n.y = i.y; n.z = i.z; }
  n.r = n.level * NOISE.radius;
  return n;
}

/** A sound made somewhere else (a cry, a decoy): louder replaces quieter. */
export function noiseAt(n, x, y, z, level) {
  if (level < n.level) return n;
  n.level = level; n.x = x; n.y = y; n.z = z; n.r = level * NOISE.radius; n.burst = true;
  return n;
}

/** Does a listener at (x, y, z) hear the noise now? */
export function hears(n, x, y, z) {
  if (n.r <= 0) return false;
  const dx = x - n.x, dz = z - n.z;
  return dx * dx + dz * dz < n.r * n.r && Math.abs(y - n.y) < NOISE.floor;
}
