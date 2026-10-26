// The Shaped's airborne state (docs/mace-design.md §3.3): the smallest thing the dunk needs. A Shaped
// caught by an Updraft is thrown up 3-5 m (lighter things higher) on a ballistic arc that hangs near
// its top for about 0.8 s and lands on the ground query; the body's `lift` (its y offset over the
// ground it stands on) carries the arc, so it lands wherever the ground is under it. While it is up
// its AI is paused (shaped.js skips think) and it can be slammed: `slam(i)` drives it down at
// `slamSpeed` and flags the landing as a dunk, which the Bell-mace's plunge turns into a second
// impact (game/weapons/plunge.js reads `landed` / `onLand`). Fixed arrays, no allocation per frame.

export const airTuning = {
  riseLight: 5, riseHeavy: 3, heavyHealth: 200,    // m: the rise of a light body and of a heavy one (by health)
  upTime: 0.6,                                      // s to the top of the arc (the hang near it is about 0.8 s)
  slamSpeed: 30,                                    // m/s when driven down
};

const SLOTS = 8;

/** The rise (m) of a body with `health`: 5 m for a hound, 3 m for the heaviest. */
export function airRise(health) {
  const T = airTuning, k = Math.min(1, Math.max(0, health / T.heavyHealth));
  return T.riseLight + (T.riseHeavy - T.riseLight) * k;
}

/** @param {{ slots: any[], isLive: (i: number) => boolean }} shaped  the Shaped pool (its bodies are read and their lift written) */
export function createAirborne(shaped) {
  const T = airTuning;
  const on = new Uint8Array(SLOTS), dunk = new Uint8Array(SLOTS);
  const y = new Float64Array(SLOTS), vy = new Float64Array(SLOTS), grav = new Float64Array(SLOTS), age = new Float64Array(SLOTS);
  const self = {
    on, dunk, y,
    /** Called with (slot, x, z, dunked) on the frame a body lands (null = nobody listens; the weapons set it). */
    onLand: null,
    /** How many are in the air. */
    get count() { let n = 0; for (let i = 0; i < SLOTS; i++) n += on[i]; return n; },
    isAir(i) { return on[i] === 1; },
    /** Throw slot i up by `rise` m (default: by its health). It is staggered where it stands (the AI is paused anyway). */
    launch(i, rise) {
      const s = shaped.slots[i];
      if (!shaped.isLive(i) || s.state === 7) return false;               // (7: frozen, which a blow shatters instead)
      if (!(rise > 0)) rise = airRise(s.hp);
      grav[i] = 2 * rise / (T.upTime * T.upTime); vy[i] = grav[i] * T.upTime;
      y[i] = Math.max(on[i] ? y[i] : 0, 0.05); age[i] = 0; on[i] = 1; dunk[i] = 0;
      const b = s.body; b.wantVx = 0; b.wantVz = 0; b.vx = 0; b.vz = 0;       // it hangs where it was caught
      if (s.state !== 6) { s.state = 6; s.t = 0; }                         // S.STAGGER
      return true;
    },
    /** Drive slot i down at slamSpeed (a dunk); false if it is not in the air. */
    slam(i) {
      if (!on[i]) return false;
      vy[i] = -T.slamSpeed; grav[i] = 0; dunk[i] = 1;
      return true;
    },
    /** Advance slot i by dt: the arc, the body's lift, the landing. */
    step(i, dt) {
      if (!on[i]) return;
      const s = shaped.slots[i], b = s.body;
      if (s.state === 0) { on[i] = 0; dunk[i] = 0; return; }               // gone (S.EMPTY): a dead dunk still lands below, while it crumbles
      age[i] += dt;
      vy[i] -= grav[i] * dt; y[i] += vy[i] * dt;
      b.wantVx = 0; b.wantVz = 0;
      if (y[i] <= 0 && (vy[i] <= 0 || age[i] > dt * 2)) {
        y[i] = 0; on[i] = 0; if (s.state !== 8) b.lift = 0;
        if (s.state === 6 && s.t > 0) s.t = 0;                           // the stagger runs its course from the landing
        const d = dunk[i]; dunk[i] = 0;
        if (self.onLand !== null) self.onLand(i, b.sx[1], b.sz[1], d === 1);
        return;
      }
      if (s.state !== 8) b.lift = y[i];
    },
    /** A slot is gone or respawned: forget it. */
    clear(i) { on[i] = 0; dunk[i] = 0; y[i] = 0; },
    reset() { on.fill(0); dunk.fill(0); y.fill(0); },
  };
  return self;
}
