// The erg's Shaped in the world (Phase 9 D9; the user's choice 2026-10-30, "themed places, and storms
// bring Skitters"): each kind keeps to its own ground — Skitters the open dune fields, Plate-backs the
// ruins, Whirlers the canyon floors and the flats, a Glass-sworn at each glass field — and rises when the
// Wraith comes near. A cleared haunt stays quiet for a while (20 min). None rise within reach of the
// camp at the caravanserai. In a sandstorm, Skitters ride in on it: a few rise upwind of the Wraith now
// and then, their tell the sand streaming off them. Respects the ≤ 8 Shaped cap and the calm after a
// fight (systems/calm.js). Encounters a quest arms (systems/encounters.js) are separate.

import { hasSpawnRoom } from '../game/shaped/spawnRoom.js';

/** [id, x, z, group of [archetype, angle (rad), radius (m)]]: around the place, angles from the Wraith's side. */
export const HAUNTS = [
  // Open dune fields: Skitters.
  ['field-south', 2400, 300, [['skitter', -0.5, 14], ['skitter', 0, 16], ['skitter', 0.5, 14]]],
  ['field-east', 2900, 520, [['skitter', -0.6, 13], ['skitter', 0.1, 15], ['skitter', 0.7, 13]]],
  ['field-seif', 3150, -150, [['skitter', -0.4, 14], ['skitter', 0.4, 14]]],
  ['field-flats', 2064, 1264, [['whirler', 0, 18], ['skitter', -0.7, 12], ['skitter', 0.7, 12]]],
  // The ruins: Plate-backs (a Skitter or two among them).
  ['temple', 2909, 1136, [['plateback', 0, 14], ['skitter', -0.8, 12], ['skitter', 0.8, 12]]],
  ['obelisks', 2338, 905, [['plateback', -0.4, 12], ['plateback', 0.4, 12]]],
  ['colossus', 2318, 1030, [['plateback', 0, 12], ['skitter', 1.0, 11]]],
  // Canyon floors: Whirlers.
  ['galleries', 1500, 1000, [['whirler', 0, 16], ['skitter', -0.6, 12], ['skitter', 0.6, 12]]],
  ['galleries-south', 1520, 640, [['whirler', -0.3, 15], ['whirler', 0.4, 17]]],
  // The glass fields: a Glass-sworn each, the bigger fields escorted.
  ['glass-1', 2634, 825, [['glasssworn', 0, 12], ['skitter', -0.9, 10], ['skitter', 0.9, 10]]],
  ['glass-2', 2762, 707, [['glasssworn', 0, 12]]],
  ['glass-3', 2595, 629, [['glasssworn', 0, 12], ['whirler', 1.1, 16]]],
  ['glass-4', 2535, 459, [['glasssworn', 0, 12], ['skitter', -0.8, 10]]],
  ['glass-5', 2680, 560, [['glasssworn', 0, 12]]],
];
export const CAMP = [1810, 775], CAMP_KEEP = 250;
export const hauntTuning = { near: 60, leave: 220, quiet: 1200, stormEvery: [40, 60], stormGroup: [2, 3], stormAhead: 26 };

/** @param {any} g  shared boot context */
export function addErgHauntSystem(g) {
  const { loop, controller, shaped, shapedMod, clock } = g;
  const E = shapedMod.S.EMPTY, F = shapedMod.S.FALLING;
  const haunts = HAUNTS.map(([id, x, z, group]) => ({ id, x, z, group, slots: [], quietUntil: -1, active: false }));
  let t = 0, stormNext = 30, stormSeed = 1;
  const rnd = () => { stormSeed = (stormSeed * 1664525 + 1013904223) >>> 0; return stormSeed / 4294967296; };
  const gone = (h) => h.slots.every((k) => shaped.slots[k].state === E || shaped.slots[k].state === F || shaped.slots[k].arch !== h.arch[h.slots.indexOf(k)]);
  g.ergHaunts = { haunts };
  loop.add({ name: 'ergHaunts', update: () => {
    t += clock.dt;
    if (t < 0.5) return;
    const dt = t; t = 0;
    if (g.capture || !g.sandDust) return;
    const p = controller.pos, inErg = g.sandDust.duneWeight > 0.5;
    const nearCamp = Math.hypot(p.x - CAMP[0], p.z - CAMP[1]) < CAMP_KEEP;
    for (const h of haunts) {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (h.active) {
        if (gone(h)) { h.active = false; h.slots.length = 0; h.quietUntil = clock.simTime + hauntTuning.quiet; g.calm?.note(h.x, h.z); }
        else if (d > hauntTuning.leave) { for (const k of h.slots) shaped.dismiss(k); h.active = false; h.slots.length = 0; }   // walked away: they sink back into their ground
        continue;
      }
      if (!inErg || nearCamp || d > hauntTuning.near || clock.simTime < h.quietUntil || g.calm?.holds(h.x, h.z)) continue;
      if (!hasSpawnRoom(shaped, E, h.group.length)) continue;
      const base = Math.atan2(p.x - h.x, p.z - h.z);
      h.arch = [];
      for (const [name, a, r] of h.group) {
        const k = shaped.spawn(name, h.x + Math.sin(base + Math.PI + a) * r, h.z + Math.cos(base + Math.PI + a) * r);
        if (k >= 0) { h.slots.push(k); h.arch.push(name); }
      }
      h.active = h.slots.length > 0;
    }
    // Skitters ride the storm in: upwind of the Wraith, a few now and then while it lasts.
    const storm = g.sandstorm && g.sandstorm.active && g.sandstorm.density > 0.4;
    if (storm && inErg && !nearCamp) {
      stormNext -= dt;
      if (stormNext <= 0) {
        stormNext = hauntTuning.stormEvery[0] + rnd() * (hauntTuning.stormEvery[1] - hauntTuning.stormEvery[0]);
        const n = hauntTuning.stormGroup[0] + (rnd() < 0.5 ? 0 : 1);
        if (hasSpawnRoom(shaped, E, n) && !g.calm?.holds(p.x, p.z)) {
          const ux = -g.sandstorm.block[0], uz = -g.sandstorm.block[1];   // upwind
          for (let i = 0; i < n; i++) {
            const a = (i - (n - 1) / 2) * 0.5, r = hauntTuning.stormAhead + 6 * rnd();
            const ca = Math.cos(a), sa = Math.sin(a);
            shaped.spawn('skitter', p.x + (ux * ca - uz * sa) * r, p.z + (ux * sa + uz * ca) * r);
          }
        }
      }
    } else stormNext = Math.max(stormNext, 20);
  } });
}
