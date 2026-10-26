// Fire for the lantern flail (docs §11.2): what its blows set alight keeps burning for a few
// seconds, spreading to a Shaped that stands close; at tier 5 the whirl leaves a ring of fire on
// the ground. A burn ticks like a bleed (the sickles') but goes straight through armour, burns
// twice as hot in meadow-stuff (sedge, turf, reed) and hotter at night; the frozen are thawed by it
// (weapons.js). Fields in, nothing allocated per frame.

import { MAX_SHAPED } from '../shaped/shaped.js';
import { ARCHETYPES } from '../shaped/archetypes.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export const burnTuning = { tick: 0.5, spreadRange: 2.1, spreadShare: 0.6, spreadEvery: 1.0 };
const ZONES = 2;

/** @param {{ shaped: any, combat: any, fx: any, ts: any, ground: any }} ctx */
export function createBurn(ctx) {
  const { shaped, combat, fx, ts } = ctx;
  const T = burnTuning, w = combat.wh;
  const time = new Float64Array(MAX_SHAPED), dps = new Float64Array(MAX_SHAPED), spread = new Float64Array(MAX_SHAPED);
  const zx = new Float64Array(ZONES), zz = new Float64Array(ZONES), zr = new Float64Array(ZONES), zt = new Float64Array(ZONES), zTick = new Float64Array(ZONES);
  const st = { n: 0 };

  const self = {
    /** How many Shaped burn now (the view: a light each), and the zones' fields for the light of the ring. */
    get burning() { return st.n; },
    zx, zz, zr, zt,
    isBurning(i) { return time[i] > 0; },
    /** Set slot i alight (or refresh it): `rate` damage a second for `seconds`. The hotter fire wins. */
    ignite(i, rate, seconds) {
      if (rate >= dps[i] || time[i] <= 0) dps[i] = rate;
      time[i] = Math.max(time[i], seconds);
      spread[i] = Math.min(spread[i], 0.2);
    },
    /** A ring of fire on the ground for `seconds`: whatever is inside catches. */
    zone(x, z, radius, seconds) {
      let k = 0; for (let q = 1; q < ZONES; q++) if (zt[q] < zt[k]) k = q;
      zx[k] = x; zz[k] = z; zr[k] = radius; zt[k] = seconds; zTick[k] = 0;
    },
    reset() { time.fill(0); dps.fill(0); spread.fill(0); zt.fill(0); st.n = 0; },

    /** One frame: ticks of damage (through armour), embers off the burning, the contagion, the zones. */
    update(dt, night) {      // (`night` hardens the ring's fire; a blow's own burn was set when it landed)
      let n = 0;
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (time[i] <= 0) continue;
        if (!shaped.isLive(i)) { time[i] = 0; continue; }
        n++;
        const before = time[i];
        time[i] -= dt; spread[i] -= dt;
        const s = shaped.slots[i], A = ARCHETYPES[s.arch], b = s.body;
        if (Math.floor(before / T.tick) !== Math.floor(Math.max(0, time[i]) / T.tick)) {
          // The flame ignores the armour (it is divided back out), and burns the Shaped in the ice no worse than any other.
          const arm = A.armour && !shaped.isFrozen(i) ? A.armour : 1;
          w.i = i; w.dmg = dps[i] * T.tick / arm; w.dx = 0; w.dz = 0; w.stagger = false; w.knock = 0; w.chip = 0; w.stop = 0; w.shake = 0; w.kick = 0;
          w.heavy = false; w.glance = false; w.sound = -1;
          combat.weaponHit();
          // Embers lifted off the body.
          for (let k = 0; k < 3; k++) {
            fx.ex = b.sx[1] + (Math.random() - 0.5) * 0.5; fx.ey = b.sy[1] + 0.3 + Math.random() * 0.4; fx.ez = b.sz[1] + (Math.random() - 0.5) * 0.5;
            fx.evx = (Math.random() - 0.5) * 0.6; fx.evz = (Math.random() - 0.5) * 0.6; fx.evy = 1.2 + Math.random() * 1.2; fx.esize = 0.025 + 0.03 * Math.random();
            fx.emit();
          }
        }
        // The fire jumps to a Shaped that stands close.
        if (spread[i] <= 0) {
          spread[i] = T.spreadEvery;
          for (let j = 0; j < MAX_SHAPED; j++) {
            if (j === i || time[j] > 0 || !shaped.isLive(j) || shaped.isFrozen(j)) continue;
            const c = shaped.slots[j].body, dx = c.sx[1] - b.sx[1], dz = c.sz[1] - b.sz[1];
            if (dx * dx + dz * dz < T.spreadRange * T.spreadRange) self.ignite(j, dps[i] * T.spreadShare, Math.max(1.2, time[i] * T.spreadShare));
          }
        }
      }
      st.n = n;
      for (let k = 0; k < ZONES; k++) {
        if (zt[k] <= 0) continue;
        zt[k] -= dt; zTick[k] -= dt;
        if (zTick[k] > 0) continue;
        zTick[k] = 0.4;
        for (let i = 0; i < MAX_SHAPED; i++) {
          if (!shaped.isLive(i)) continue;
          const c = shaped.slots[i].body, dx = c.sx[1] - zx[k], dz = c.sz[1] - zz[k];
          if (dx * dx + dz * dz < zr[k] * zr[k]) self.ignite(i, 5 * (ARCHETYPES[shaped.slots[i].arch].material === 'meadow' ? 1.8 : 1) * (1 + 0.45 * night), 2.2);
        }
        // The ground under the ring lies singed: a run of flattened grass round its edge.
        const a0 = Math.random() * 6.283;
        for (let q = 0; q < 3; q++) {
          const a = a0 + q * 2.094;
          ts.bx = zx[k] + Math.sin(a) * zr[k] * 0.85; ts.bz = zz[k] + Math.cos(a) * zr[k] * 0.85; ts.bdx = Math.cos(a); ts.bdz = -Math.sin(a);
          ts.bl = 1.1; ts.bw = 0.5; ts.bd = 0.01; ts.bc = 0.4; ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.1;
          ts.stamp();
        }
      }
    },
  };
  return self;
}
