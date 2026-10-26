// The Bell Ledge in play (world/bellLedge.js, docs/mace-design.md §6): two hounds lie asleep in the
// hollow below the ledge whenever the Wraith comes within sight of it, until it comes within their
// wake radius or hurts one. The first lesson is free: the way down from the bell is a plunge onto them.
// Once both are broken the hollow stays quiet (flag `cleared:bell-ledge-hounds`, saved with the quests).

import { bellLedgeHollow, LEDGE } from '../world/bellLedge.js';

const NEAR = 110;

/** @param {any} g  shared boot context */
export function addBellLedgeSystem(g) {
  const { loop, controller, shaped, shapedMod, chapter, clock } = g;
  const site = g.archSites ? g.archSites.find((s) => s.id === 'bell-ledge') : null;
  if (!site) return;
  const hollow = bellLedgeHollow(site), flags = chapter.graph.flags;
  const slots = [-1, -1];
  let t = 0, spawned = false;
  g.bellLedge = { site, hollow, slots, get spawned() { return spawned; } };
  loop.add({ name: 'bellLedge', update: () => {
    t += clock.dt;
    if (t < 0.5) return;
    t = 0;
    if (flags.has('cleared:bell-ledge-hounds') || g.weaponFinds.some((f) => f.id === 'mace' && f.taken)) return;
    const near = Math.hypot(controller.pos.x - site.at[0], controller.pos.z - site.at[1]) < NEAR;
    if (spawned) {
      // Broken: both gone for good.
      let alive = 0;
      for (let k = 0; k < 2; k++) { const st = shaped.slots[slots[k]]?.state; if (slots[k] >= 0 && st !== shapedMod.S.EMPTY && st !== shapedMod.S.FALLING) alive++; }
      if (alive === 0) { flags.add('cleared:bell-ledge-hounds'); spawned = false; }
      return;
    }
    if (!near) return;
    for (let k = 0; k < 2; k++) slots[k] = shaped.spawn('hound', hollow.hounds[k][0], hollow.hounds[k][1], { idle: LEDGE.wake });
    spawned = slots[0] >= 0 || slots[1] >= 0;
  } });
}
