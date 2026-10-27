// The Bell-mace's numbers (docs/mace-design.md §1-§4) as pure functions over the plunge table of
// the weapon's def (defs3.js `plunge`), and the stored-height bookkeeping. Nothing here touches the
// game: it is what the tests check and what plunge.js calls. Fields in, numbers out (no objects
// made per call).

/** The damage of a plunge from `h` metres of stored height: 18 + 3.2 h, h capped at 20 m. A Warden takes at most `wardenCap` (the maul smash's 56). */
export function plungeDamage(P, h, warden = false) {
  const hc = Math.min(P.hMax, Math.max(0, h));
  const d = P.dmg + P.dmgPerM * hc;
  return warden ? Math.min(P.wardenCap, d) : d;
}

/** The toll's radius (m): 1.6 + 0.16 h (max 4.8 at the cap), plus the forged tier IV's width. */
export function tollRadius(P, h) {
  return P.tollR0 + P.tollRk * Math.min(P.hMax, Math.max(0, h)) + (P.tollBonus || 0);
}

/** How much of the full blow a body whose edge is `edgeDist` m from the centre takes: 1 at the centre, `tollEdge` (40 %) at the rim. */
export function tollFalloff(P, edgeDist, radius) {
  const u = radius > 0 ? Math.min(1, Math.max(0, edgeDist / radius)) : 1;
  return 1 - (1 - P.tollEdge) * u;
}

/** The share of height each rebound in a chain keeps: 0.7^n (0.8^n at Flow 2 and above). */
export function reboundKeep(P, n, flowTier) {
  return Math.pow(1 - (flowTier >= 2 ? P.decayFlow : P.decay), n);
}

/** The rebound's height (m) after a plunge of stored height `h`, the `n`th rebound of the chain (0 for the first); `extra` m from a gale-infused bell. */
export function reboundHeight(P, h, n, flowTier, extra = 0) {
  return Math.min(P.reboundMax, P.rebound * Math.min(P.hMax, Math.max(0, h))) * reboundKeep(P, n, flowTier) + extra;
}

/** The upward speed (m/s) that carries a body `height` m up under gravity `g`. */
export function launchSpeed(height, g) { return Math.sqrt(2 * g * Math.max(0, height)); }

/** Is a body at (x, z) inside one of the star's six arms from (cx, cz)? Arms are `len` m long, `hw` m either side, the first at `yaw`. */
export function inStar(cx, cz, yaw, len, hw, x, z) {
  const dx = x - cx, dz = z - cz, d = Math.sqrt(dx * dx + dz * dz);
  if (d <= hw) return true;
  if (d > len + hw) return false;
  // The angle off the nearest arm (arms every 60 degrees).
  let a = Math.atan2(dx, dz) - yaw; a -= Math.round(a / (Math.PI / 3)) * (Math.PI / 3);
  return d * Math.abs(Math.sin(a)) <= hw && d * Math.cos(a) <= len + hw;
}

/**
 * The stored height (docs §1): the highest point since the Wraith last stood on ground (or last
 * plunge impact), as an effective y that a glide's sink only lowers by half; bonuses (an Updraft
 * column, a Downdraft) add to it. `h(groundY)` is the drop to a point on the ground.
 */
export class StoredHeight {
  constructor() {
    this.top = 0.5 - 0.5; this.bonus = 0.5 - 0.5; this.lastY = 0.5 - 0.5; this.glideHalf = 0.5;
    /** Inputs (fields, set before rest() / fly()): the body's y and whether the robe is spread. */
    this.y = 0.5 - 0.5; this.gliding = false;
  }
  /** Stand on the ground at `y` (or reset at an impact): nothing stored. */
  rest() { this.top = this.y; this.bonus = 0; this.lastY = this.y; }
  /** One frame in the air at `y`: the apex rises with the body; a glide's sink counts at `glideHalf`. */
  fly() {
    const y = this.y;
    if (this.gliding && y < this.lastY) this.top -= (this.lastY - y) * (1 - this.glideHalf);
    if (y > this.top) this.top = y;
    this.lastY = y;
  }
  /** The stored height for an impact at ground y `gy` (uncapped; damage caps it). */
  h(gy) { return Math.max(0, this.top + this.bonus - gy); }
}
