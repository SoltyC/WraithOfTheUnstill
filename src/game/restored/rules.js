// Pure rules of the restored-world play (systems/restored/*.js, data/restored.json, data/quests/*-restored.json): the Wind
// Road's checks, a Gust that goes with the wind, the lantern's rise. No game state is read; the systems feed positions and
// events in, so each rule is unit-tested (tests/restored.test.js). Allocation-free per call.

/** A Gust helps the chaff only when it goes the way the wind does: its direction (unit) against the wind's, cos >= `min`. */
export function withWind(dx, dz, wx, wz, min = 0.5) { return dx * wx + dz * wz >= min * Math.hypot(dx, dz) * Math.hypot(wx, wz); }

/** The chaff on the threshing floor: `need` Gusts aimed at the floor and going with the wind clear it. */
export class Winnow {
  constructor(need = 3) { this.need = need; this.count = 0; }
  /** A Gust was cast: `aimed` at the floor, `with` the wind. Returns 'done', 'hit', 'against' (aimed but into the wind) or null. */
  gust(aimed, withIt) {
    if (!aimed) return null;
    if (!withIt) return 'against';
    this.count++;
    return this.count >= this.need ? 'done' : 'hit';
  }
  reset() { this.count = 0; }
}

/**
 * The Wind Road: a flight from Hearn's hill foot to the Western Edge's first ring, never touching the ground. It starts
 * when the Wraith glides low near the start; then the checks in order (an air check: within r of its point, at least `agl`
 * m over the ground; a ring check: within r of the point at its height y). The ground for more than `grace` s ends it.
 * checks: [{ pos: [x, z], r, agl?, y? }]
 */
export class RoadRun {
  constructor(checks, start, { grace = 3 } = {}) {
    this.checks = checks; this.start = start; this.grace = grace;
    this.running = false; this.stage = 0; this.t = 0; this.down = 0; this.last = 0.5 - 0.5;
  }
  /** Per frame: the Wraith at (x, y, z), `agl` m over the ground, gliding or not. Returns 'start' | 'check' | 'done' | 'lost' | null. */
  step(x, y, z, agl, gliding, dt) {
    if (!this.running) {
      if (!gliding) return null;
      const s = this.start;
      if (Math.hypot(x - s.pos[0], z - s.pos[1]) > s.r || agl > s.agl) return null;
      this.running = true; this.stage = 0; this.t = 0; this.down = 0; return 'start';
    }
    this.t += dt;
    this.down = gliding ? 0 : this.down + dt;
    if (this.down > this.grace) { this.running = false; this.stage = 0; return 'lost'; }
    const c = this.checks[this.stage], d2 = Math.hypot(x - c.pos[0], z - c.pos[1]);
    if (c.y !== undefined ? Math.hypot(d2, y - c.y) > c.r : d2 > c.r || agl < c.agl) return null;
    this.stage++;
    if (this.stage >= this.checks.length) { this.running = false; this.stage = 0; this.last = this.t; return 'done'; }
    return 'check';
  }
}

/** The lantern's rise (0..1) after `t` s of its `seconds`: slow off the hand, quick in the middle, easing into the dark. */
export function lanternRise(t, seconds) { const u = t <= 0 ? 0 : t >= seconds ? 1 : t / seconds; return u * u * (3 - 2 * u); }
