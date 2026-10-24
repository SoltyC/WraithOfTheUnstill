// Pure rules of the meadow side quests (data/quests/meadow-side.json, systems/sideQuests.js): the
// Updraft marks that raise the fallen stone, the Gale gestures the Listening Stones ask for, the
// glide course and its medals. No game state is read here; the system feeds positions and events in,
// so each rule is unit-tested (tests/sideQuests.test.js). Allocation-free per call.

/** Distance from (x, z) to the segment from (ox, oz) along the unit direction (dx, dz) for `len` m. */
export function rayDistance(ox, oz, dx, dz, len, x, z) {
  const t = Math.min(len, Math.max(0, (x - ox) * dx + (z - oz) * dz));
  return Math.hypot(ox + dx * t - x, oz + dz * t - z);
}

/** Medal for a course time (s): 'gold' | 'silver' | 'bronze' | null. `m` = { bronze, silver, gold } (the limits, s). */
export function medalFor(secs, m) { return secs <= m.gold ? 'gold' : secs <= m.silver ? 'silver' : secs <= m.bronze ? 'bronze' : null; }
export const GLIDE_MEDALS = { bronze: 30, silver: 25, gold: 21 };

/**
 * The fallen stone: Updrafts cast at its head, its middle and its foot, in any order, each within
 * `reach` m of its mark, all three inside `window` s of the first. The window lapsing resets them.
 */
export class StoneRaise {
  constructor(marks, { reach = 3.2, window = 14 } = {}) {
    this.marks = marks; this.reach = reach; this.window = window;
    this.done = new Uint8Array(marks.length); this.count = 0; this.t = 0;
  }
  /** An Updraft was raised at (x, z). Returns 'mark' (one more), 'raised' (all), 'miss' or 'again' (that mark was already done). */
  updraft(x, z) {
    let hit = -1, best = this.reach;
    for (let k = 0; k < this.marks.length; k++) { const d = Math.hypot(x - this.marks[k][0], z - this.marks[k][1]); if (d < best) { best = d; hit = k; } }
    if (hit < 0) return 'miss';
    if (this.done[hit]) return 'again';
    if (this.count === 0) this.t = 0;
    this.done[hit] = 1; this.count++;
    return this.count >= this.marks.length ? 'raised' : 'mark';
  }
  /** Time passes; true when the window lapsed and the marks were cleared. */
  step(dt) {
    if (this.count === 0 || this.count >= this.marks.length) return false;
    this.t += dt;
    if (this.t < this.window) return false;
    this.reset(); return true;
  }
  reset() { this.done.fill(0); this.count = 0; this.t = 0; }
}

/**
 * A Listening Stone's request: a list of Gale gestures ('gust' | 'vortex' | 'updraft') to make at it, in
 * order, within `time` s of listening. A gesture aimed at the stone but not the one asked for starts it over.
 */
export class GestureAsk {
  constructor(ask, time = 40) { this.ask = ask; this.time = time; this.i = 0; this.left = 0; this.active = false; }
  start() { this.i = 0; this.left = this.time; this.active = true; }
  /** A gesture happened; `aimed` whether it was made at this stone. Returns 'ok' (next one asked), 'done', 'wrong' (reset) or null (not for this stone). */
  gesture(kind, aimed) {
    if (!this.active || !aimed) return null;
    if (kind !== this.ask[this.i]) { this.i = 0; return 'wrong'; }
    this.i++;
    if (this.i >= this.ask.length) { this.active = false; return 'done'; }
    return 'ok';
  }
  /** Time passes; true when the listening lapsed. */
  step(dt) { if (!this.active) return false; this.left -= dt; if (this.left > 0) return false; this.active = false; return true; }
  get next() { return this.ask[this.i]; }
}

/** Vortex held on a point: counts seconds the column (strength `s`) stands within `reach` m of it. */
export function vortexHold(acc, dt, strength, vx, vz, x, z, reach = 6) {
  return strength > 0.6 && Math.hypot(vx - x, vz - z) < reach ? acc + dt : Math.max(0, acc - dt * 2);
}

/**
 * The glide course: rings in order; flying within `r` of the first starts the clock, the last stops it.
 * Lost when the glide has ended for `grace` s, or the next ring is farther than `far` m.
 * rings: [{ x, y, z, r }].
 */
export class GlideCourse {
  constructor(rings, { grace = 2.5, far = 170 } = {}) {
    this.rings = rings; this.grace = grace; this.far = far;
    this.next = 0; this.t = 0; this.down = 0; this.running = false;
    this.last = 0.5 - 0.5;   // the last finished time
  }
  /** Per frame: the Wraith at (x, y, z), `gliding` whether the robe is open, dt seconds. Returns 'start' | 'ring' | 'done' | 'lost' | null. */
  step(x, y, z, gliding, dt) {
    const R = this.rings;
    if (this.running) {
      this.t += dt;
      this.down = gliding ? 0 : this.down + dt;
      const nr = R[this.next];
      if (this.down > this.grace || Math.hypot(x - nr.x, y - nr.y, z - nr.z) > this.far) { this.running = false; this.next = 0; return 'lost'; }
    }
    const r = R[this.next];
    if (!gliding || Math.hypot(x - r.x, y - r.y, z - r.z) > r.r) return null;
    if (this.next === 0) { this.running = true; this.t = 0; this.down = 0; this.next = 1; return 'start'; }
    this.next++;
    if (this.next >= R.length) { this.running = false; this.next = 0; this.last = this.t; return 'done'; }
    return 'ring';
  }
}
